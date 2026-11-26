import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { candidatesFor, findFlowPassage } from '@/lib/flow/candidates';
import { compactCandidates, quotationKey, repeatsQuotation, type CandidateRange } from '@/lib/flow/context';
import { lexicalBreaks } from '@/lib/flow/lexemes';
import type { ContentPackId } from '@/lib/content/contracts';
import { evaluatePlanStability } from './run-flow-plan-stability';

type Span = CandidateRange & { text: string; source: string; chapter: string };
type Point = Span & { passage: string; token: string; tokenStart: number; tokenEnd: number };
type Case = {
  id: string; group: string; op: 'open' | 'branch'; scope: ContentPackId[];
  seed?: string; point?: Point; need: string; terms: string[]; prior: Span[]; evidence: Span[];
};
type Option = Span & { id: string; rank: number; tier: number; repeated: boolean };
type Replayed = Awaited<ReturnType<typeof replay>>;
type Grade = { id: string; verdict: 'D' | 'P' | 'N'; reason: string };

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const normalizesInsidePrior = (text: string, previous: string[]) => {
  const normal = quotationKey(text);
  return normal.length > 0 && previous.some(past => past.includes(normal));
};

function soften(options: Option[]) {
  const ranked = [...options];
  for (let i = 0; i + 1 < ranked.length; i++) {
    const previous = ranked[i]!, following = ranked[i + 1]!;
    if (!previous.repeated || following.repeated || previous.tier !== following.tier) continue;
    ranked[i] = following;
    ranked[i + 1] = previous;
    i++;
  }
  return ranked;
}

async function assertSpan(ref: Span) {
  const row = await findFlowPassage(ref.sourceId, ref.corpusVersion);
  assert(row && row.id === ref.sourceId && row.corpusVersion === ref.corpusVersion && row.textHash === ref.textHash);
  assert(ref.start >= 0 && ref.end > ref.start && row.text.slice(ref.start, ref.end) === ref.text);
  return row;
}

function covers(container: CandidateRange, target: CandidateRange) {
  return container.sourceId === target.sourceId && container.corpusVersion === target.corpusVersion &&
    container.textHash === target.textHash && container.start <= target.start && container.end >= target.end;
}

function rankOptions(caseId: string, windows: Span[], terms: string[], previous: string[]) {
  return windows.flatMap((window, index): Option[] => {
    return [...window.text.matchAll(/[^。！？!?]+[。！？!?]*[”’」』]*/gu)].flatMap(match => {
      const text = match[0].trim();
      const keyLength = [...quotationKey(text)].length;
      if (keyLength < 2 || keyLength > 160) return [];
      const offset = match.index + match[0].length - match[0].trimStart().length;
      const start = window.start + offset;
      const end = start + text.length;
      assert(window.text.slice(offset, offset + text.length) === text);
      const id = hash(JSON.stringify(['fixed-flow-blind-v1', caseId, window.sourceId, window.textHash, start, end])).slice(0, 16);
      return [{ ...window, id, rank: index + 1, tier: terms.some(term => text.includes(term)) ? 1 : 0,
        text, start, end, repeated: normalizesInsidePrior(text, previous) }];
    });
  }).sort((left, right) => right.tier - left.tier);
}

async function replay(entry: Case) {
  const { id, point, prior, evidence, terms, need, scope, op, seed } = entry;
  assert(op === 'open' ? seed && !point && !prior.length : point && !seed && prior.length > 0);
  const clickable = [];
  if (point) {
    const row = await assertSpan(point);
    assert(row.text === point.passage && point.start <= point.tokenStart && point.tokenEnd <= point.end &&
      row.text.slice(point.tokenStart, point.tokenEnd) === point.token);
    assert(prior.at(-1)?.text === point.text);
    const ends = (row as typeof row & { lexicalBreaks?: number[] }).lexicalBreaks || lexicalBreaks(row.text);
    for (const [index, end] of ends.entries()) {
      const start = ends[index - 1] ?? 0;
      const text = row.text.slice(start, end);
      if (end > point.tokenStart && start < point.tokenEnd && /[\p{L}\p{N}]/u.test(text)) clickable.push({ start, end, text });
    }
    assert(clickable.length > 0);
  }
  await Promise.all([...prior, ...evidence].map(assertSpan));
  const recalled = await candidatesFor(terms, need, new Set(), undefined, [], scope);
  const compaction = compactCandidates(recalled, terms, undefined, point ? [point.text] : []);
  assert(recalled.length <= 40 && compaction.windows.length <= 12);
  const previous = prior.map(span => quotationKey(span.text));
  const baseline = rankOptions(id, compaction.windows.map((range, index) => {
    const row = compaction.passages[index]!, input = compaction.input[index]!;
    assert(row.id === range.sourceId && row.text.slice(range.start, range.end) === input.text && input.text.length <= 480);
    return { ...range, source: input.source, chapter: input.chapter, text: input.text };
  }), terms, previous);
  const trial = soften(baseline);
  const trialRanks = new Map(trial.map((option, index) => [option.id, index]));
  assert.equal(baseline.length, trialRanks.size);
  for (const [index, option] of baseline.entries()) {
    const next = trialRanks.get(option.id);
    assert(next !== undefined && Math.abs(index - next) <= 1);
    if (next > index) assert(option.repeated && option.tier === trial[index]!.tier);
  }
  if (op === 'open') assert.deepEqual(baseline, trial);
  return {
    entry, baseline, trial, clickable,
    poolCount: recalled.length, windows: compaction.windows,
    evidence: evidence.map(span => ({
      span,
      poolRank: recalled.findIndex(row => row.id === span.sourceId) + 1 || null,
      windowRank: compaction.windows.findIndex(window => covers(window, span)) + 1 || null,
      optionIds: baseline.filter(option => covers(option, span)).map(option => option.id),
      downweighted: baseline.filter((option, index) => covers(option, span) && trialRanks.get(option.id)! > index).map(option => option.id),
    })),
  };
}

function blindDeck(results: Replayed[]) {
  return results.flatMap(({ entry, baseline, trial }) => {
    const { point, prior, seed, need } = entry;
    const context = {
      need,
      ...(seed ? { seed } : {}),
      ...(point ? { point: { token: point.token, source: point.source, chapter: point.chapter, quote: point.text } } : {}),
      prior: prior.map(({ source, chapter, text }) => ({ source, chapter, text })),
    };
    const top = [...new Set([baseline[0], trial[0]])];
    return top.map(option => ({
      id: option?.id ?? hash(entry.id + '-no-option').slice(0, 16), ...context,
      quote: option ? { source: option.source, chapter: option.chapter, text: option.text } : null,
    }));
  }).sort((a, b) => hash('opaque-flow-order' + a.id).localeCompare(hash('opaque-flow-order' + b.id)));
}

function report(results: Replayed[], grades: Grade[]) {
  const deck = blindDeck(results);
  const labels = new Map(grades.map(grade => [grade.id, grade]));
  assert.equal(labels.size, grades.length);
  assert.equal(labels.size, deck.length);
  for (const { id } of deck) {
    const grade = labels.get(id);
    assert(grade && ['D', 'P', 'N'].includes(grade.verdict) && grade.reason.trim());
  }
  const points = results.map(({ entry, baseline, trial, windows, evidence, poolCount, clickable }) => {
    const lead = (options: Option[]) => {
      const option = options[0] ?? null;
      const grade = labels.get(option?.id ?? hash(entry.id + '-no-option').slice(0, 16))!;
      return { option, grade,
        productionRepeatGuard: !!option && repeatsQuotation(option.text, entry.prior.slice(-1).map(span => span.text)),
      };
    };
    return {
      id: entry.id, group: entry.group, poolCount, windows, clickable, options: baseline.length,
      baseline: lead(baseline), trial: lead(trial), evidence,
      repeatedCount: baseline.filter(option => option.repeated).length,
      downweighted: baseline.flatMap((option, index) => trial[index + 1]?.id === option.id
        ? [{ option, baselineRank: index + 1, trialRank: index + 2 }]
        : []),
    };
  });
  const count = (side: 'baseline' | 'trial', subset: typeof points = points) => ({
    D: subset.filter(point => point[side].grade.verdict === 'D').length,
    P: subset.filter(point => point[side].grade.verdict === 'P').length,
    N: subset.filter(point => point[side].grade.verdict === 'N').length,
  });
  const byGroup = Object.fromEntries([...new Set(points.map(point => point.group))].map(group => {
    const subset = points.filter(point => point.group === group);
    return [group, { points: subset.length, baseline: count('baseline', subset), trial: count('trial', subset) }];
  }));
  const repeatedRemoved = points.filter(point => point.baseline.option?.repeated && point.trial.option && !point.trial.option.repeated).map(point => point.id);
  const directLoss = points.filter(point => point.baseline.grade.verdict === 'D' && point.trial.grade.verdict !== 'D').map(point => point.id);
  const loweredEvidence = points.filter(point => point.evidence.some(span => span.downweighted.length)).map(point => point.id);
  const baseline = count('baseline'), trial = count('trial');
  const netDirect = trial.D - baseline.D;
  return {
    summary: {
      points: points.length, blindedItems: deck.length,
      baseline, trial, byGroup,
      options: points.reduce((total, point) => total + point.options, 0),
      repeatedOptions: points.reduce((total, point) => total + point.repeatedCount, 0),
      downweightedOptions: points.reduce((total, point) => total + point.downweighted.length, 0),
      changedLeads: points.filter(point => point.baseline.option?.id !== point.trial.option?.id).map(point => point.id),
      repeatedRemoved, netDirect, directLoss, loweredEvidence,
      noEvidenceInPool: points.filter(point => !point.evidence.some(span => span.poolRank)).map(point => point.id),
      noEvidenceInWindow: points.filter(point => !point.evidence.some(span => span.windowRank)).map(point => point.id),
      noEvidenceInOption: points.filter(point => !point.evidence.some(span => span.optionIds.length)).map(point => point.id),
      passes: repeatedRemoved.length >= 2 && netDirect > 0 && !directLoss.length && !loweredEvidence.length,
    },
    points,
  };
}

type HistoricalQuote = { sourceId: string; textHash: string; quoteStart: number; quoteEnd: number; quote: string };
type HistoricalResponse = { id: string; recentReadings: { quote: string }[]; delivered: { quote: string } };
type TrialArchive = {
  responses: { cases: HistoricalResponse[] };
  mapping: { cases: { id: string; pair: number; arm: string }[] };
  canonicalPreflight?: { pair: number; original: HistoricalQuote[]; proposals: HistoricalQuote[] }[];
};

async function archiveCandidates(path: string) {
  const archive = await readJson<TrialArchive>(path);
  const deliveries = archive.responses.cases.map(response => {
    const mapping = archive.mapping.cases.find(item => item.id === response.id);
    assert(mapping);
    return {
      ...mapping, quote: response.delivered.quote,
      repeated: normalizesInsidePrior(response.delivered.quote, response.recentReadings.map(reading => quotationKey(reading.quote))),
    };
  });
  const proposals = [];
  for (const item of archive.canonicalPreflight ?? []) {
    const original = archive.mapping.cases.find(mapping => mapping.pair === item.pair && mapping.arm === 'v17');
    const context = archive.responses.cases.find(response => response.id === original?.id);
    assert(context);
    const prior = context.recentReadings.map(reading => quotationKey(reading.quote));
    const options = [];
    for (const quote of item.proposals) {
      const row = await findFlowPassage(quote.sourceId);
      assert(row?.textHash === quote.textHash && row.text.slice(quote.quoteStart, quote.quoteEnd) === quote.quote);
      options.push({ ...quote, repeated: normalizesInsidePrior(quote.quote, prior) });
    }
    proposals.push({ pair: item.pair, original: item.original, options });
  }
  return { deliveries, proposals };
}

async function calibration(paths: string[]) {
  const [contextsPath, plansPath, v18Path, v20Path] = paths;
  assert(contextsPath && plansPath && v18Path && v20Path && paths.length === 4);
  const contexts = await readFile(contextsPath);
  const stable = await evaluatePlanStability(contexts, await readJson(plansPath));
  const { cases } = JSON.parse(contexts.toString('utf8')) as { cases: {
    id: string; recall: { previousQuotes: string[] };
  }[] };
  assert.equal(stable.cases.length, 6);
  const oldRuns = [];
  for (const { id, runs } of stable.cases) {
    const context = cases.find(old => old.id === id);
    assert(context);
    for (const run of runs) {
      assert(run.status === 'ok');
      const windows = [];
      for (const range of run.recall.compact) {
        const row = await findFlowPassage(range.sourceId, range.corpusVersion);
        assert(row?.textHash === range.textHash);
        windows.push({ ...range, source: row.source, chapter: row.chapter, text: row.text.slice(range.start, range.end) });
      }
      const baseline = rankOptions(id, windows, run.terms, context.recall.previousQuotes.map(quotationKey));
      const trial = soften(baseline);
      oldRuns.push({ id, repeat: run.repeat, options: baseline.length, repeatedOptions: baseline.filter(option => option.repeated).length,
        reorderedOptions: baseline.filter((option, index) => option !== trial[index]).length,
        baseline: baseline[0] ?? null, trial: trial[0] ?? null });
    }
  }
  return { oldRuns, v18: await archiveCandidates(v18Path), v20: await archiveCandidates(v20Path) };
}

async function main() {
  const [mode, input, gradesPath] = process.argv.slice(2);
  if (mode === 'calibration') {
    console.log(JSON.stringify(await calibration(process.argv.slice(3)), null, 2));
    return;
  }
  assert(input && (mode === 'deck' || (mode === 'report' && gradesPath)), 'Usage: tsx scripts/run-flow-quote-rank-replay.ts <deck|report> <fixed-points.json> [grades.json]');
  const { cases, inputs } = await readJson<{ cases: Case[]; inputs: Record<string, string> }>(input);
  for (const [path, expected] of Object.entries(inputs)) assert.equal(hash(await readFile(path)), expected, path);
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map(entry => entry.id)).size, 18);
  const points = [];
  for (const entry of cases) {
    assert.equal(entry.prior.length, entry.op === 'open' ? 0 : entry.group === 'deep' ? 2 : 1);
    points.push(await replay(entry));
  }
  const result = mode === 'deck' ? { items: blindDeck(points) } :
    report(points, (await readJson<{ grades: Grade[] }>(gradesPath!)).grades);
  console.log(JSON.stringify(result, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
