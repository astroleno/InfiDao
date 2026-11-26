import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { candidatesFor, findFlowPassage } from '@/lib/flow/candidates';
import { CANDIDATE_EXCERPT_LIMIT, compactCandidates, quotationKey, type CandidateRange } from '@/lib/flow/context';
import type { PassageRecord } from '@/types';
import { evaluatePlanStability } from './run-flow-plan-stability';
import { evaluateFlowRecall, scoreGoldGroup } from './run-flow-recall';

const POOL_LIMIT = 40;
const SHORTLIST_LIMIT = 12;
const PROTECTED_PREFIX = 6;

type Gold = Parameters<typeof scoreGoldGroup>[0][number];
type FrozenContext = {
  id: string;
  need: string;
  plannerInput: { word: string; source: string; chapter: string; quote: string };
  recall: {
    scope: ['core'] | ['core', 'poetry']; exclude: string[];
    semantics: []; previousQuotes: string[]; gold: Gold[][];
    force?: { sourceId: string; quote: string };
  };
};
type Window = {
  id: string; rank: number; range: CandidateRange; source: string; chapter: string; text: string;
};
const scoresSchema = z.object({
  scores: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{16}$/u), verdict: z.enum(['D', 'P', 'N']) })),
});
const key = z.string().min(1);
const metric = z.number().min(0).max(1);
const archiveSchema = z.object({
  model: key, promptVersion: key, serverBaseline: key,
  links: z.array(z.object({
    reviewId: key,
    scopeFingerprint: key,
    replayInput: z.record(z.unknown()),
    recall: z.object({ hitAt40: metric, hitAt12: metric, recallAt40: metric, recallAt12: metric }),
    review: z.object({ verdict: key, reason: key }),
    delivered: z.object({
      sourceId: key, corpusVersion: key, textHash: key,
      quoteStart: z.number().int().nonnegative(), quoteEnd: z.number().int().positive(),
      quote: key, reflection: key,
    }),
  })).min(1),
});

function windowId(caseId: string, range: CandidateRange) {
  const identity = ['plan-pairs-v1', caseId, range.sourceId, range.corpusVersion, range.textHash, range.start, range.end];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 16);
}

function checkedWindows(caseId: string, selection: ReturnType<typeof compactCandidates>, ranks: Map<string, number>): Window[] {
  return selection.windows.map((range, index) => {
    const row = selection.passages[index]!;
    const { source, chapter, text } = selection.input[index]!;
    if (row.text.slice(range.start, range.end) !== text || !text || text.length > CANDIDATE_EXCERPT_LIMIT) {
      throw new Error(`Invalid production window ${row.id} [${range.start}, ${range.end})`);
    }
    return { id: windowId(caseId, range), rank: ranks.get(row.id)!, range, source, chapter, text };
  });
}

function exactTerms(windows: readonly Window[], terms: readonly string[]) {
  return [...new Set(terms)].filter(term => windows.some(window => window.text.includes(term)));
}

function novelTerms(terms: readonly string[], previousQuotes: readonly string[]) {
  const seen = new Set<string>(), read = previousQuotes.map(quotationKey);
  return terms.filter(term => {
    const key = quotationKey(term);
    if ([...key].length < 2 || seen.has(key)) return false;
    seen.add(key);
    return !read.some(quote => quote.includes(key));
  });
}

function selectSwap(
  baseline: readonly Window[], eligible: readonly Window[], opportunities: readonly string[],
  retainedTerms: readonly string[], forceId?: string,
) {
  const protectedIds = new Set(eligible.slice(0, PROTECTED_PREFIX).map(window => window.range.sourceId));
  if (forceId) protectedIds.add(forceId);
  const candidates = eligible.filter(candidate => !baseline.some(window =>
    window.range.sourceId === candidate.range.sourceId ||
    (window.source === candidate.source && window.text === candidate.text)));
  const sources = new Set(baseline.map(window => window.source));
  for (const term of opportunities) {
    for (const added of candidates) {
      if (!added.text.includes(term)) continue;
      for (let index = baseline.length - 1; index >= 0; index--) {
        const removed = baseline[index]!;
        if (protectedIds.has(removed.range.sourceId)) continue;
        const after = baseline.map((window, position) => position === index ? added : window);
        if ([...sources].every(source => after.some(window => window.source === source)) &&
            exactTerms(after, retainedTerms).length === retainedTerms.length) {
          return { term, slot: index + 1, added, removed, after };
        }
      }
    }
  }
  return null;
}

function fullRange(row: PassageRecord): CandidateRange {
  return { sourceId: row.id, corpusVersion: row.corpusVersion, textHash: row.textHash, start: 0, end: row.text.length };
}

function goldGroups(groups: Gold[][], recalled: CandidateRange[], compact: CandidateRange[], forceId?: string) {
  return groups.map((group, index) => {
    const ordinary = group.filter(gold => gold.sourceId !== forceId);
    const forced = group.filter(gold => gold.sourceId === forceId);
    return {
      index,
      ordinary: ordinary.length ? scoreGoldGroup(ordinary, recalled, compact) : null,
      forced: forced.length ? scoreGoldGroup(forced, recalled, compact) : null,
    };
  });
}

async function replay(contextBytes: Buffer, plans: unknown) {
  const stability = await evaluatePlanStability(contextBytes, plans);
  const { cases } = JSON.parse(contextBytes.toString('utf8')) as { cases: FrozenContext[] };
  if (stability.summary.attempts !== 18 || stability.summary.succeeded !== 18 ||
      stability.cases.filter(point => point.cohort === 'diagnostic').length !== 2 ||
      stability.cases.filter(point => point.cohort === 'holdout').length !== 4) {
    throw new Error('Expected two diagnostic and four holdout cases with three successful plans each');
  }

  const points = [];
  for (const point of stability.cases) {
    const context = cases.find(item => item.id === point.id)!;
    const { scope, exclude, force, semantics, previousQuotes, gold } = context.recall;
    const runs = [];
    for (const run of point.runs) {
      if (run.status !== 'ok') throw new Error('Unexpected failed frozen plan');
      const { terms, focus, repeat, recall } = run;
      const rows = await candidatesFor(terms, focus, new Set(exclude), force?.sourceId, semantics, scope);
      const recalled = rows.map(fullRange);
      const ranks = new Map(rows.map((row, index) => [row.id, index + 1]));
      const selection = compactCandidates(rows, terms, force, previousQuotes);
      const baseline = checkedWindows(point.id, selection, ranks);
      if (rows.length > POOL_LIMIT || baseline.length > SHORTLIST_LIMIT ||
          !isDeepStrictEqual(recalled, recall.recalled) || !isDeepStrictEqual(selection.windows, recall.compact)) {
        throw new Error(`Production replay differed for ${point.id}/${repeat}`);
      }
      const eligible = rows.flatMap(row =>
        checkedWindows(point.id, compactCandidates([row], terms, force, previousQuotes), ranks));
      const eligibleRanges = new Map(eligible.map(window => [window.range.sourceId, window.range]));
      if (baseline.some(window => !isDeepStrictEqual(window.range, eligibleRanges.get(window.range.sourceId)))) {
        throw new Error(`Single-row excerpts differed from production for ${point.id}/${repeat}`);
      }
      const retained = exactTerms(baseline, terms);
      const opportunities = novelTerms(terms, previousQuotes).filter(term => !retained.includes(term));
      const swap = selectSwap(baseline, eligible, opportunities, retained, force?.sourceId);
      const variant = swap?.after ?? baseline;
      const beforeGold = goldGroups(gold, recalled, selection.windows, force?.sourceId);
      if (!isDeepStrictEqual(beforeGold, recall.groups)) throw new Error(`Gold groups differed for ${point.id}/${repeat}`);
      runs.push({
        repeat, terms, retained, poolSize: rows.length, shortlistSize: baseline.length,
        opportunities: opportunities.map(term => ({
          term, fullBody: rows.filter(row => row.text.includes(term)).length,
          eligibleExcerpt: eligible.filter(window => window.text.includes(term)).length,
          titleOnly: rows.filter(row => row.workTitle.includes(term) && !row.text.includes(term)).length,
          chapterOnly: rows.filter(row => row.chapter.includes(term) && !row.text.includes(term)).length,
        })),
        swap, baseline, variant,
        gold: {
          before: beforeGold,
          after: goldGroups(gold, recalled, variant.map(window => window.range), force?.sourceId),
        },
      });
    }
    points.push({ id: point.id, cohort: point.cohort, scope, need: context.need, from: context.plannerInput, runs });
  }
  return { input: stability.summary, points };
}

function priorScores(rawScores: unknown) {
  const scores = scoresSchema.parse(rawScores).scores;
  const byId = new Map(scores.map(score => [score.id, score.verdict]));
  if (byId.size !== scores.length) throw new Error('Duplicate prior score ID');
  return byId;
}

function evaluate(result: Awaited<ReturnType<typeof replay>>, rawScores: unknown, extraScores: unknown, packetOnly: boolean) {
  const byId = priorScores(rawScores);
  const extras = scoresSchema.parse(extraScores).scores;

  const packet = result.points.flatMap(point => {
    const changed = new Map(point.runs.flatMap(run => run.swap
      ? [run.swap.added, run.swap.removed].map(window => [window.id, window] as const)
      : []));
    const windows = [...changed.values()].filter(window => !byId.has(window.id))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, source, chapter, text }) => ({ id, source, chapter, text }));
    const { word, source, chapter, quote } = point.from;
    return windows.length ? [{ need: point.need, from: { word, source, chapter, quote }, windows }] : [];
  });
  if (packetOnly) return { points: packet };
  const novelIds = new Set(packet.flatMap(point => point.windows.map(window => window.id)));
  for (const score of extras) {
    if (!novelIds.has(score.id) || byId.has(score.id)) throw new Error(`Unexpected or duplicate new score ID ${score.id}`);
    byId.set(score.id, score.verdict);
  }

  const points = result.points.map(point => ({
    id: point.id, cohort: point.cohort, scope: point.scope,
    runs: point.runs.map(({ baseline, variant, swap, ...run }) => {
      const direct = (windows: Window[]) => windows.filter(window => byId.get(window.id) === 'D').map(window => window.id);
      const before = direct(baseline), after = direct(variant);
      return {
        ...run,
        swap: swap && {
          term: swap.term, slot: swap.slot,
          added: { ...swap.added, verdict: byId.get(swap.added.id) ?? null },
          removed: { ...swap.removed, verdict: byId.get(swap.removed.id) ?? null },
        },
        direct: {
          before: before.length, after: after.length,
          gained: after.filter(id => !before.includes(id)), lost: before.filter(id => !after.includes(id)),
          ungradedBefore: baseline.filter(window => !byId.has(window.id)).length,
          ungradedAfter: variant.filter(window => !byId.has(window.id)).length,
        },
      };
    }),
  }));
  const runs = points.flatMap(point => point.runs);
  const gold12 = (side: 'before' | 'after') => runs.map(run =>
    run.gold[side].filter(group => group.ordinary === 'hit12').length);
  const before12 = gold12('before'), after12 = gold12('after');
  return {
    input: result.input,
    limits: { pool: POOL_LIMIT, shortlist: SHORTLIST_LIMIT, protectedPrefix: PROTECTED_PREFIX, excerptUtf16: CANDIDATE_EXCERPT_LIMIT },
    summary: {
      replayed: runs.length, swaps: runs.filter(run => run.swap).length,
      ungradedChangedWindows: novelIds.size - extras.length,
      runsWithDirectBefore: runs.filter(run => run.direct.before).length,
      runsWithDirectAfter: runs.filter(run => run.direct.after).length,
      directGained: runs.reduce((total, run) => total + run.direct.gained.length, 0),
      directLost: runs.reduce((total, run) => total + run.direct.lost.length, 0),
      gold: {
        runsAt40: runs.filter(run => run.gold.before.some(group => group.ordinary && group.ordinary !== 'poolMiss')).length,
        runsAt12Before: before12.filter(Boolean).length,
        runsAt12After: after12.filter(Boolean).length,
        groupsAt12Before: before12.reduce((total, count) => total + count, 0),
        groupsAt12After: after12.reduce((total, count) => total + count, 0),
      },
    },
    points,
  };
}

async function auditArchive(rawArchive: unknown, rawScores: unknown) {
  const { links, ...archive } = archiveSchema.parse(rawArchive);
  if (new Set(links.map(link => link.reviewId)).size !== links.length) throw new Error('Duplicate archived review ID');
  const byId = priorScores(rawScores);
  const deliveries = [];
  for (const link of links) {
    const [recalled] = (await evaluateFlowRecall({ cases: [link.replayInput] })).cases;
    if (!recalled || recalled.scope.fingerprint !== link.scopeFingerprint || !isDeepStrictEqual(recalled.metrics, link.recall)) {
      throw new Error(`Archived recall differs for ${link.reviewId}`);
    }
    const { sourceId, corpusVersion, textHash, quoteStart, quoteEnd, quote, reflection } = link.delivered;
    const row = await findFlowPassage(sourceId, corpusVersion);
    if (!row || row.id !== sourceId || row.corpusVersion !== corpusVersion || row.textHash !== textHash ||
        quoteStart >= quoteEnd || quoteEnd > row.text.length || row.text.slice(quoteStart, quoteEnd) !== quote) {
      throw new Error(`Delivered quote differs from its archived source for ${link.reviewId}`);
    }
    const windows = recalled.compact.map(range => {
      const id = windowId(recalled.id, range);
      return { id, range, verdict: byId.get(id) ?? null };
    });
    const matching = windows.filter(({ range }) => range.sourceId === sourceId &&
      range.corpusVersion === corpusVersion && range.textHash === textHash && range.start <= quoteStart && range.end >= quoteEnd);
    if (matching.length !== 1) throw new Error(`Expected one exact delivered-quote window for ${link.reviewId}`);
    const window = matching[0]!;
    const matchedDirect = windows.filter(item => item.verdict === 'D').length;
    deliveries.push({
      caseId: recalled.id, reviewId: link.reviewId, audit: link.review,
      shortlist: {
        windows: windows.length, matchedDirect, hasMatchedDirect: matchedDirect > 0,
        ungraded: windows.filter(item => item.verdict === null).length,
      },
      quote: { start: quoteStart, end: quoteEnd, text: quote, exact: true },
      deliveredWindow: { ...window, text: row.text.slice(window.range.start, window.range.end) },
      reflection,
    });
  }
  return { archive, deliveries };
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const json = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (mode === 'archive' && args.length === 2) {
    const [archive, grades] = await Promise.all([json(args[0]!), json(args[1]!)]);
    console.log(JSON.stringify(await auditArchive(archive, grades), null, 2));
    return;
  }
  const [contexts, plans, review, extraReview, ...unexpected] = args;
  if ((mode !== 'packet' && mode !== 'report') || !contexts || !plans || !review ||
      (mode === 'packet' && extraReview) || unexpected.length) {
    throw new Error('Usage:\n' +
      '  tsx scripts/run-flow-shortlist-replay.ts <packet|report> <contexts.json> <plans.json> <prior-review.json> [new-review.json]\n' +
      '  tsx scripts/run-flow-shortlist-replay.ts archive <archived-review.json> <prior-review.json>');
  }
  const [contextBytes, rawPlans] = await Promise.all([readFile(contexts), json(plans)]);
  // Freeze all swaps before loading any labels. Packet mode uses prior IDs only.
  const result = await replay(contextBytes, rawPlans);
  const [rawScores, extraScores] = await Promise.all([json(review), extraReview ? json(extraReview) : { scores: [] }]);
  console.log(JSON.stringify(evaluate(result, rawScores, extraScores, mode === 'packet'), null, 2));
}

if (require.main === module) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
