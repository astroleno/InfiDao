import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { searchPoetry } from '@/lib/content/store';
import { candidatesFor, findFlowPassage, flowCorpus } from '@/lib/flow/candidates';
import { CANDIDATE_EXCERPT_LIMIT, compactCandidates, quotationKey, type CandidateRange } from '@/lib/flow/context';
import type { SemanticEntry } from '@/lib/flow/semantic-index';
import { buildLexicalIndex } from '@/lib/search/lexical';
import type { PassageRecord } from '@/types';
import { evaluatePlanStability } from './run-flow-plan-stability';
import { scoreGoldGroup } from './run-flow-recall';

const POOL_LIMIT = 40;
const CORE_PREFIX = 6;
const TERM_LIMIT = 36;
const POETRY_LIMIT = 32;
const WINDOW_COUNT = 12;

type Gold = Parameters<typeof scoreGoldGroup>[0][number];
type RecallInput = {
  scope: ['core'] | ['core', 'poetry'];
  exclude: string[];
  force?: { sourceId: string; quote: string };
  previousQuotes: string[];
  semantics: SemanticEntry[];
  gold: Gold[][];
};
type ReviewedSample = {
  caseId: string; repeat: number; verdict: 'D' | 'P' | 'N';
  evidence: (Omit<Gold, 'quote'> & { windowId: string })[];
};
type TermHits = { exact: string[]; normalized: string[] };
type SideCoverage = { recalled: TermHits; compact: TermHits };
type TermCoverage = {
  term: string;
  normalizedTerm: string;
  coreCorpus: TermHits;
  coreRank36: TermHits;
  rankedCoreIds: string[];
  coreRank36WithoutVerbatimTerm: string[];
  poetryIndex: (TermHits & {
    rankedIds: string[];
    exactStatus: 'found' | 'not-found-within-probe';
    normalizedStatus: 'found' | 'not-found-within-probe';
    exhaustive: false;
  }) | null;
  baseline: SideCoverage;
  roundRobin: SideCoverage;
};
type Change<T> = { added: T[]; removed: T[] };
type ComparisonRun = {
  caseId: string;
  cohort: string;
  repeat: number;
  scope: string;
  scopeFingerprint: string;
  need: string;
  terms: string[];
  turnTerms: string[];
  baseline: ReturnType<typeof measurePool>;
  roundRobin: ReturnType<typeof measurePool>;
  oldStrong: (ReviewedSample['evidence'][number] & { baselineContains: boolean; roundRobinContains: boolean })[];
  termCoverage: TermCoverage[];
  rawCoreRankGold: { index: number; found: boolean }[];
  changedWindows: Change<string>;
  changedGold: { recalled: Change<number>; compact: Change<number> };
};

const passageRange = (row: PassageRecord): CandidateRange => ({
  sourceId: row.id, corpusVersion: row.corpusVersion, textHash: row.textHash, start: 0, end: row.text.length,
});

const windowKey = (row: CandidateRange) =>
  JSON.stringify([row.sourceId, row.corpusVersion, row.textHash, row.start, row.end]);

function contains(window: CandidateRange, target: CandidateRange) {
  return window.sourceId === target.sourceId && window.corpusVersion === target.corpusVersion &&
    window.textHash === target.textHash && window.start <= target.start && window.end >= target.end;
}

export function roundRobinCore(
  original: readonly PassageRecord[], rankings: readonly PassageRecord[][], exclude: ReadonlySet<string>, forceId?: string,
) {
  const output = new Map(original.slice(0, CORE_PREFIX).map(row => [row.id, row]));
  const allowed = (row: PassageRecord) => !exclude.has(row.id) || row.id === forceId;
  const cursors = rankings.map(() => 0);
  while (output.size < POOL_LIMIT) {
    const before = output.size;
    for (const [index, rows] of rankings.entries()) {
      while (cursors[index]! < rows.length && output.size < POOL_LIMIT) {
        const row = rows[cursors[index]!]!;
        cursors[index] = cursors[index]! + 1;
        if (!allowed(row) || output.has(row.id)) continue;
        output.set(row.id, row);
        break;
      }
    }
    if (before === output.size) break;
  }
  for (const row of original) {
    if (output.size >= POOL_LIMIT) break;
    output.set(row.id, row);
  }
  return [...output.values()];
}

function fuse(core: PassageRecord[], poetry: PassageRecord[], force?: PassageRecord) {
  const rows = new Map<string, PassageRecord>();
  if (force) rows.set(force.id, force);
  for (let rank = 0; rank < Math.max(core.length, poetry.length); rank++) {
    for (const row of [poetry[rank], core[rank]]) if (row && !rows.has(row.id)) rows.set(row.id, row);
  }
  return [...rows.values()].slice(0, POOL_LIMIT);
}

function measurePool(rows: PassageRecord[], terms: string[], input: RecallInput) {
  const selection = compactCandidates(rows, terms, input.force, input.previousQuotes);
  const recalled = rows.map(passageRange);
  const compact = selection.windows;
  if (recalled.length > POOL_LIMIT || compact.length > WINDOW_COUNT) throw new Error('Candidate limit changed');
  const windows = compact.map((range, index) => {
    const row = selection.passages[index]!;
    const { text, source, chapter, work } = selection.input[index]!;
    if (row.text.slice(range.start, range.end) !== text || text.length > CANDIDATE_EXCERPT_LIMIT) {
      throw new Error(`Supplied text differs from its UTF-16 range: ${row.id}`);
    }
    return { ...range, source, chapter, work, text, key: windowKey(range) };
  });
  const gold = input.gold.map((group, index) => {
    const ordinary = group.filter(item => item.sourceId !== input.force?.sourceId);
    const forced = group.filter(item => item.sourceId === input.force?.sourceId);
    return {
      index,
      ordinary: ordinary.length ? scoreGoldGroup(ordinary, recalled, compact) : null,
      forced: forced.length ? scoreGoldGroup(forced, recalled, compact) : null,
    };
  });
  return { recalled, compact: windows, gold };
}

function termHits<T>(rows: readonly T[], getText: (row: T) => string, getKey: (row: T) => string, term: string) {
  const normalized = quotationKey(term);
  return {
    exact: rows.filter(row => !!term && getText(row).includes(term)).map(getKey),
    normalized: rows.filter(row => !!normalized && quotationKey(getText(row)).includes(normalized)).map(getKey),
  };
}

function changed<T>(before: readonly T[], after: readonly T[]): Change<T> {
  return { added: after.filter(value => !before.includes(value)), removed: before.filter(value => !after.includes(value)) };
}

function eligibleTerms(terms: string[]) {
  const seen = new Set<string>();
  return terms.filter(term => {
    const key = quotationKey(term);
    if ([...key].length < 2 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function evaluateComparison(contextBytes: Buffer, plans: unknown, review: { sampleWindowReview: ReviewedSample[] }) {
  const stability = await evaluatePlanStability(contextBytes, plans);
  const { cases } = JSON.parse(contextBytes.toString('utf8')) as { cases: { id: string; recall: RecallInput }[] };
  const cohorts = stability.cases.map(item => item.cohort);
  if (cohorts.filter(cohort => cohort === 'diagnostic').length !== 2 ||
      cohorts.filter(cohort => cohort === 'holdout').length !== 4 || stability.summary.succeeded !== 18) {
    throw new Error('Expected two diagnostic and four holdout cases with three successful frozen repeats each');
  }
  const corpus = await flowCorpus();
  const byId = new Map(corpus.map(row => [row.id, row]));
  const coreRank = buildLexicalIndex(corpus);
  const cachedCoreRanks = new Map<string, PassageRecord[]>();
  const cachedPoetryRanks = new Map<string, Awaited<ReturnType<typeof searchPoetry>>>();
  const ranks = (term: string) => {
    if (!cachedCoreRanks.has(term)) cachedCoreRanks.set(term, coreRank(term, TERM_LIMIT).map(row => byId.get(row.id)!));
    return cachedCoreRanks.get(term)!;
  };
  const poetryRanks = async (query: string) => {
    if (!cachedPoetryRanks.has(query)) cachedPoetryRanks.set(query, await searchPoetry(query, POETRY_LIMIT));
    return cachedPoetryRanks.get(query)!;
  };
  const results: ComparisonRun[] = [];
  for (const item of stability.cases) {
    const input = cases.find(entry => entry.id === item.id)!.recall;
    const exclude = new Set(input.exclude), forceId = input.force?.sourceId;
    const poetryEnabled = input.scope[1] === 'poetry';
    for (const run of item.runs) {
      if (run.status !== 'ok') throw new Error('Unexpected failed replay');
      const { terms, focus, repeat, recall } = run;
      const baselineRows = await candidatesFor(terms, focus, exclude, forceId, input.semantics, input.scope);
      const baseline = measurePool(baselineRows, terms, input);
      if (!isDeepStrictEqual(baseline.recalled, recall.recalled) || !isDeepStrictEqual(baseline.gold, recall.groups) ||
          !isDeepStrictEqual(baseline.compact.map(({ sourceId, corpusVersion, textHash, start, end, selectedStart }) =>
            ({ sourceId, corpusVersion, textHash, start, end, ...(selectedStart === undefined ? {} : { selectedStart }) })),
          recall.compact)) {
        throw new Error(`Baseline differs from ordered stability replay for ${item.id}/${repeat}`);
      }
      const originalCore = poetryEnabled ? await candidatesFor(terms, focus, exclude, forceId, input.semantics, ['core']) : baselineRows;
      const turnTerms = eligibleTerms(terms);
      const diversifiedCore = roundRobinCore(originalCore, turnTerms.map(ranks), exclude, forceId);
      const poetry = poetryEnabled ? (await poetryRanks([...terms, focus].join(' '))).map(row => row.passage)
        .filter(row => !exclude.has(row.id) || row.id === forceId) : [];
      const forced = poetryEnabled && forceId ?
        originalCore.find(row => row.id === forceId) ?? poetry.find(row => row.id === forceId) ?? await findFlowPassage(forceId) : undefined;
      const originalOrder = poetryEnabled ? fuse(originalCore, poetry, forced) : originalCore;
      if (!isDeepStrictEqual(originalOrder.map(passageRange), baseline.recalled)) {
        throw new Error(`Core extraction or poetry fusion differs from production for ${item.id}/${repeat}`);
      }
      const experimentRows = poetryEnabled ? fuse(diversifiedCore, poetry, forced) : diversifiedCore;
      const roundRobin = measurePool(experimentRows, terms, input);
      const textOf = (row: PassageRecord) => row.text;
      const idOf = (row: PassageRecord) => row.id;
      const termCoverage: TermCoverage[] = [];
      for (const term of terms) {
        const core = ranks(term);
        const coreCorpus = termHits(corpus, textOf, idOf, term);
        const coreRank36 = termHits(core, textOf, idOf, term);
        const poetryIndex = poetryEnabled ? (await poetryRanks(term)).map(row => row.passage) : [];
        const poetryProbe = poetryEnabled ? termHits(poetryIndex, textOf, idOf, term) : null;
        const measure = (rows: PassageRecord[], pool: typeof baseline) => ({
          recalled: termHits(rows, textOf, idOf, term),
          compact: termHits(pool.compact, row => row.text, row => row.key, term),
        });
        termCoverage.push({
          term, normalizedTerm: quotationKey(term), coreCorpus, coreRank36,
          rankedCoreIds: core.map(idOf),
          coreRank36WithoutVerbatimTerm: core.map(idOf).filter(id => !coreRank36.exact.includes(id)),
          poetryIndex: poetryProbe && {
            ...poetryProbe, rankedIds: poetryIndex.map(idOf),
            exactStatus: poetryProbe.exact.length ? 'found' : 'not-found-within-probe',
            normalizedStatus: poetryProbe.normalized.length ? 'found' : 'not-found-within-probe',
            exhaustive: false,
          },
          baseline: measure(baselineRows, baseline),
          roundRobin: measure(experimentRows, roundRobin),
        });
      }
      const rawCoreRankRanges = [...new Set(terms.flatMap(ranks))].map(passageRange);
      const oldStrong = review.sampleWindowReview.filter(sample => sample.caseId === item.id && sample.repeat === repeat && sample.verdict === 'D')
        .flatMap(sample => sample.evidence).map(evidence => ({
          ...evidence, baselineContains: baseline.compact.some(window => contains(window, evidence)),
          roundRobinContains: roundRobin.compact.some(window => contains(window, evidence)),
        }));
      if (oldStrong.some(row => !row.baselineContains)) {
        throw new Error(`Previously reviewed evidence missing from baseline for ${item.id}/${repeat}`);
      }
      results.push({
        caseId: item.id, cohort: item.cohort, repeat, scope: input.scope.join('+'),
        scopeFingerprint: recall.scope.fingerprint, need: item.need, terms, turnTerms,
        baseline, roundRobin, oldStrong, termCoverage,
        rawCoreRankGold: input.gold.flatMap((group, index) => {
          const coreGold = group.filter(row => !row.sourceId.startsWith('poetry-') && row.sourceId !== forceId);
          return coreGold.length ? [{ index, found: coreGold.some(row => rawCoreRankRanges.some(range => contains(range, row))) }] : [];
        }),
        changedWindows: changed(baseline.compact.map(row => row.key), roundRobin.compact.map(row => row.key)),
        changedGold: {
          recalled: changed(baseline.gold.filter(group => group.ordinary && group.ordinary !== 'poolMiss').map(group => group.index),
            roundRobin.gold.filter(group => group.ordinary && group.ordinary !== 'poolMiss').map(group => group.index)),
          compact: changed(baseline.gold.filter(group => group.ordinary === 'hit12').map(group => group.index),
            roundRobin.gold.filter(group => group.ordinary === 'hit12').map(group => group.index)),
        },
      });
    }
  }
  const mean = (items: number[]) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : null;
  const summarizeLayer = (runs: typeof results, score: (run: typeof results[number]) => boolean[]) => {
    const rounds = runs.map(row => score(row));
    const scoredRounds = rounds.filter(row => row.length);
    const scoredPoints = [...new Set(runs.map(row => row.caseId))].flatMap(caseId => {
      const selected = rounds.filter((row, index) => row.length && runs[index]!.caseId === caseId).flat();
      return selected.length ? [selected] : [];
    });
    const macro = (rows: boolean[][]) => mean(rows.map(row => row.filter(Boolean).length / row.length));
    return {
      scoredRounds: scoredRounds.length, scoredPoints: scoredPoints.length,
      groupAttempts: rounds.flat().length, groupHits: rounds.flat().filter(Boolean).length,
      hitRounds: scoredRounds.filter(row => row.some(Boolean)).length,
      hitPoints: scoredPoints.filter(row => row.some(Boolean)).length,
      macroRecallByRound: macro(scoredRounds), macroRecallByPoint: macro(scoredPoints),
    };
  };
  const summarize = (runs: typeof results) => {
    const scoreSide = (side: 'baseline' | 'roundRobin') => ({
      recalled: summarizeLayer(runs, run => run[side].gold.flatMap(group => group.ordinary ? [group.ordinary !== 'poolMiss'] : [])),
      compact: summarizeLayer(runs, run => run[side].gold.flatMap(group => group.ordinary ? [group.ordinary === 'hit12'] : [])),
    });
    return {
      rounds: runs.length, points: new Set(runs.map(row => row.caseId)).size,
      coreRank36Union: summarizeLayer(runs, run => run.rawCoreRankGold.map(group => group.found)),
      baseline: scoreSide('baseline'), roundRobin: scoreSide('roundRobin'),
      changedGold: {
        recalled: {
          added: runs.flatMap(run => run.changedGold.recalled.added).length,
          removed: runs.flatMap(run => run.changedGold.recalled.removed).length,
        },
        compact: {
          added: runs.flatMap(run => run.changedGold.compact.added).length,
          removed: runs.flatMap(run => run.changedGold.compact.removed).length,
        },
      },
    };
  };
  const strata = [
    { label: 'all', rows: results },
    ...['diagnostic', 'holdout'].flatMap(cohort => ['all', 'core', 'core+poetry'].map(scope => ({
      label: `${cohort}/${scope}`, rows: results.filter(row => row.cohort === cohort && (scope === 'all' || row.scope === scope)),
    }))),
    ...['core', 'core+poetry'].map(scope => ({ label: `all/${scope}`, rows: results.filter(row => row.scope === scope) })),
  ];
  return {
    contextSha256: stability.summary.contextSha256,
    limits: { coreRank: TERM_LIMIT, poetryProbe: POETRY_LIMIT, candidatePool: POOL_LIMIT, windows: WINDOW_COUNT, windowUtf16: CANDIDATE_EXCERPT_LIMIT },
    summary: Object.fromEntries(strata.filter(row => row.rows.length).map(({ label, rows }) => [label, summarize(rows)])),
    runs: results,
  };
}

async function main() {
  const [contexts, plans, review, ...extra] = process.argv.slice(2);
  if (!contexts || !plans || !review || extra.length) {
    throw new Error('Usage: tsx scripts/run-flow-recall-comparison.ts <contexts.json> <plans.json> <prior-review.json>');
  }
  const [bytes, frozen, prior] = await Promise.all([readFile(contexts), readFile(plans, 'utf8'), readFile(review, 'utf8')]);
  console.log(JSON.stringify(await evaluateComparison(bytes, JSON.parse(frozen), JSON.parse(prior))));
}

if (require.main === module) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
