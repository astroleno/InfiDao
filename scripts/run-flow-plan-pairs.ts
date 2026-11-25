import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { searchPoetry } from '@/lib/content/store';
import { findFlowPassage, flowCorpus } from '@/lib/flow/candidates';
import { CANDIDATE_EXCERPT_LIMIT, quotationKey, type CandidateRange } from '@/lib/flow/context';
import type { PassageRecord } from '@/types';
import { evaluatePlanStability } from './run-flow-plan-stability';
import { evaluateFlowRecall } from './run-flow-recall';

type Recall = Awaited<ReturnType<typeof evaluateFlowRecall>>['cases'][number];
type Contexts = { cases: { id: string; plannerInput: { word: string; quote: string }; recall: { previousQuotes: string[]; scope: string[] } }[] };
const verdict = z.enum(['D', 'P', 'N']);
const scoresSchema = z.object({ scores: z.array(z.object({ id: z.string(), verdict, reason: z.string().optional() })) });
const archiveSchema = z.object({ sampleWindowReview: z.array(z.object({
  caseId: z.string(), repeat: z.number(), verdict,
  evidence: z.array(z.object({ sourceId: z.string(), corpusVersion: z.string(), textHash: z.string(), start: z.number(), end: z.number() })),
})) });

export function mergePlanTerms(primary: readonly string[], partner: readonly string[], previousQuotes: readonly string[]) {
  const terms = [...primary];
  const seen = new Set(primary.map(quotationKey));
  const read = previousQuotes.map(quotationKey);
  const added: string[] = [];
  const skipped: { term: string; reason: 'empty' | 'duplicate' | 'already-read' | 'limit' }[] = [];
  for (const term of partner) {
    const key = quotationKey(term);
    const reason = !key ? 'empty' : seen.has(key) ? 'duplicate'
      : [...key].length >= 2 && read.some(quote => quote.includes(key)) ? 'already-read'
        : terms.length >= 8 ? 'limit' : null;
    if (reason) { skipped.push({ term, reason }); continue; }
    terms.push(term);
    added.push(term);
    seen.add(key);
  }
  return { terms, added, skipped };
}

const digest = (input: string) => createHash('sha256').update(input).digest('hex');

function windowId(caseId: string, range: CandidateRange) {
  return digest(JSON.stringify(['plan-pairs-v1', caseId, range.sourceId, range.corpusVersion, range.textHash, range.start, range.end])).slice(0, 16);
}

function goldAt(recall: Recall, limit: 40 | 12) {
  return recall.groups.filter(group => limit === 40
    ? group.ordinary && group.ordinary !== 'poolMiss' : group.ordinary === 'hit12').map(group => group.index);
}

function changed<T>(before: readonly T[], after: readonly T[]) {
  return { added: after.filter(item => !before.includes(item)), removed: before.filter(item => !after.includes(item)) };
}

function termHits(rows: PassageRecord[], term: string) {
  const key = quotationKey(term);
  const count = (select: (row: PassageRecord) => string) => rows.reduce((hits, row) => {
    const text = select(row);
    if (text.includes(term)) hits.exact++;
    else if (key && quotationKey(text).includes(key)) hits.normalizedOnly++;
    return hits;
  }, { exact: 0, normalizedOnly: 0 });
  return { body: count(row => row.text), title: count(row => row.workTitle), chapter: count(row => row.chapter) };
}

async function makeBlindWindow(id: string, range: CandidateRange) {
  const passage = await findFlowPassage(range.sourceId, range.corpusVersion);
  if (!passage || passage.corpusVersion !== range.corpusVersion || passage.textHash !== range.textHash ||
      range.start < 0 || range.end > passage.text.length || range.end <= range.start || range.end - range.start > CANDIDATE_EXCERPT_LIMIT) {
    throw new Error(`Invalid replay window ${range.sourceId} [${range.start}, ${range.end})`);
  }
  return { id, ...range, source: passage.source, chapter: passage.chapter, text: passage.text.slice(range.start, range.end) };
}

async function evaluatePlanPairs(contextBytes: Buffer, plans: unknown, oldReview: unknown, review?: unknown) {
  const stability = await evaluatePlanStability(contextBytes, plans);
  const contexts = (JSON.parse(contextBytes.toString('utf8')) as Contexts).cases;
  const groups = stability.cases.map(item => item.cohort);
  if (groups.filter(group => group === 'diagnostic').length !== 2 || groups.filter(group => group === 'holdout').length !== 4 ||
      stability.summary.cases !== 6 || stability.summary.succeeded !== 18) {
    throw new Error('Expected two diagnostic and four holdout points with three successful plans each');
  }
  const previous = archiveSchema.parse(oldReview).sampleWindowReview;
  const previousDirect = new Set(previous.filter(row => row.verdict === 'D')
    .flatMap(row => row.evidence.map(range => windowId(row.caseId, range))));
  const core = await flowCorpus();
  const termCoverage = new Map<string, { term: string; core: ReturnType<typeof termHits>; poetryProbe: ReturnType<typeof termHits> | null }>();
  const reviewed = scoresSchema.parse(review ?? { scores: [] }).scores;
  const scoreById = new Map(reviewed.map(score => [score.id, score.verdict]));
  if (scoreById.size !== reviewed.length) throw new Error('Duplicate blind scores');

  const points = [];
  for (const point of stability.cases) {
    const context = contexts.find(item => item.id === point.id)!;
    const allWindows = new Map<string, CandidateRange>();
    const changedIds = new Set<string>();
    const remember = (recall: Recall) => recall.compact.map(range => {
      const id = windowId(point.id, range);
      allWindows.set(id, range);
      return id;
    });
    const pairs = [];
    for (const primary of point.runs) {
      if (primary.status !== 'ok') throw new Error('Missing primary plan');
      const before = remember(primary.recall);
      for (const archived of previous.filter(row => row.caseId === point.id && row.repeat === primary.repeat && row.verdict === 'D')) {
        if (archived.evidence.some(range => !before.includes(windowId(point.id, range)))) {
          throw new Error(`Archived direct window differs from the baseline for ${point.id}/${primary.repeat}`);
        }
      }
      for (const partner of point.runs) {
        if (partner === primary) continue;
        if (partner.status !== 'ok') throw new Error('Missing partner plan');
        const merged = mergePlanTerms(primary.terms, partner.terms, context.recall.previousQuotes);
        const [candidate] = (await evaluateFlowRecall({ cases: [{
          ...context.recall, id: point.id, focus: primary.focus, terms: merged.terms,
        }] })).cases;
        if (!candidate || candidate.scope.fingerprint !== point.scopeFingerprint || candidate.recalled.length > 40 || candidate.compact.length > 12) {
          throw new Error(`Replay scope or limits changed for ${point.id}`);
        }
        const after = remember(candidate);
        const windows = changed(before, after);
        [...windows.added, ...windows.removed].forEach(id => changedIds.add(id));
        for (const term of merged.added) {
          const poetry = context.recall.scope.includes('poetry');
          const id = JSON.stringify([term, poetry]);
          if (termCoverage.has(id)) continue;
          termCoverage.set(id, { term, core: termHits(core, term), poetryProbe: poetry
            ? termHits((await searchPoetry(term, 32)).map(row => row.passage), term) : null });
        }
        const top40 = goldAt(primary.recall, 40), paired40 = goldAt(candidate, 40);
        const top12 = goldAt(primary.recall, 12), paired12 = goldAt(candidate, 12);
        pairs.push({
          primary: primary.repeat, partner: partner.repeat, primaryTerms: primary.terms, partnerTerms: partner.terms,
          focus: primary.focus, merged, windows, before, after,
          gold: { top40, paired40, top12, paired12, change40: changed(top40, paired40), change12: changed(top12, paired12) },
          recall: { before: primary.recall.recalled, after: candidate.recalled },
        });
      }
    }
    const isDirect = (id: string) => previousDirect.has(id) || scoreById.get(id) === 'D';
    const windows = await Promise.all([...allWindows.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([id, range]) => makeBlindWindow(id, range)));
    points.push({
      id: point.id, cohort: point.cohort, scopeFingerprint: point.scopeFingerprint, need: point.need, ...context.plannerInput,
      goldGroups: point.goldGroupCount,
      windows,
      changedWindows: windows.filter(window => changedIds.has(window.id)).map(window => window.id),
      pairs: pairs.map(pair => ({ ...pair, direct: {
        before: pair.before.filter(isDirect), after: pair.after.filter(isDirect),
        change: changed(pair.before.filter(isDirect), pair.after.filter(isDirect)),
        ungradedBefore: pair.before.filter(id => !isDirect(id) && !scoreById.has(id)).length,
        ungradedAfter: pair.after.filter(id => !isDirect(id) && !scoreById.has(id)).length,
      } })),
    });
  }
  const allIds = new Set(points.flatMap(point => point.windows.map(window => window.id)));
  if (reviewed.some(row => !allIds.has(row.id))) throw new Error('Unknown blind window ID');
  return {
    input: stability.summary,
    limits: { maxTerms: 8, pool: 40, windows: 12, excerptUtf16: CANDIDATE_EXCERPT_LIMIT, poetryProbe: 32 },
    termCoverage: [...termCoverage.values()],
    blind: { total: allIds.size, newlyGraded: reviewed.length, archivedDirect: previousDirect.size },
    points,
  };
}

async function main() {
  const [contexts, plans, archivedReview, review, ...unexpected] = process.argv.slice(2);
  if (!contexts || !plans || !archivedReview || unexpected.length) {
    throw new Error('Usage: tsx scripts/run-flow-plan-pairs.ts <contexts.json> <plans.json> <archived-review.json> [blind-review.json]');
  }
  const json = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;
  const [contextBytes, rawPlans, archived, blind] = await Promise.all([
    readFile(contexts), json(plans), json(archivedReview), review ? json(review) : undefined,
  ]);
  console.log(JSON.stringify(await evaluatePlanPairs(contextBytes, rawPlans, archived, blind), null, 2));
}

if (require.main === module) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
