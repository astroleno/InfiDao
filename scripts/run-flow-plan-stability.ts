import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { resolveContentScope } from '@/lib/content/scope';
import { findFlowPassage } from '@/lib/flow/candidates';
import { FLOW_PROMPT_VERSION } from '@/lib/flow/contracts';
import { planningScope, quotationKey, type CandidateRange } from '@/lib/flow/context';
import { lexicalBreaks } from '@/lib/flow/lexemes';
import type { PassageRecord } from '@/types';
import { evaluateFlowRecall } from './run-flow-recall';

const key = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const range = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive() });
const selection = range.extend({ corpusVersion: key, textHash: key });
const evidence = selection.extend({ sourceId: key, quote: key });
const plannerInput = z.object({
  word: key, source: key, chapter: z.string(), surface: z.literal('quote'), quote: key,
  before: z.string(), after: z.string(), focus: z.string(),
  targetScope: z.object({ coreSources: z.array(key), poetryEnabled: z.boolean() }),
  work: z.unknown().optional(),
}).strict();
const contextsSchema = z.object({
  cases: z.array(z.object({
    id: key, cohort: key, depth: z.union([key, z.number().int().nonnegative()]), need: key,
    parent: evidence, selection, plannerInput, inputHash: sha256, scopeFingerprint: key,
    recall: z.object({
      op: z.literal('branch'), scope: z.tuple([z.literal('core')]).rest(z.literal('poetry')).refine(scope => scope.length <= 2),
      exclude: z.array(key), previousQuotes: z.array(key), semantics: z.tuple([]),
      gold: z.array(z.array(evidence).min(1)),
    }).strict(),
  })).min(1),
});
const run = z.object({ caseId: key, repeat: z.number().int().min(1).max(3), inputHash: sha256, elapsedMs: z.number().finite().nonnegative() });
const plansSchema = z.object({
  contextSha256: sha256, model: key, promptVersion: key, repeats: z.literal(3),
  runs: z.array(z.discriminatedUnion('status', [
    run.extend({ status: z.literal('ok'), sense: key.max(120), direction: key.max(120), terms: z.array(key.max(20)).min(2).max(8) }).strict(),
    run.extend({ status: z.literal('error'), errorCode: key }).strict(),
  ])),
});
type Context = z.infer<typeof contextsSchema>['cases'][number];
type Recall = Awaited<ReturnType<typeof evaluateFlowRecall>>['cases'][number];
type PlanRun = z.infer<typeof plansSchema>['runs'][number];
type ReplayRun =
  | (Extract<PlanRun, { status: 'ok' }> & {
    focus: string; echo: ReturnType<typeof echoTerms>; recall: Recall;
    compactClues: Awaited<ReturnType<typeof windowClues>>; replayIdentical: true;
  })
  | (Extract<PlanRun, { status: 'error' }> & { echo: null; recall: null; compactClues: null; replayIdentical: null });

function digest(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function echoTerms(terms: readonly string[], previousQuotes: readonly string[]) {
  const read = previousQuotes.map(quotationKey);
  const effective = [...new Set(terms.map(quotationKey).filter(term => [...term].length >= 2))];
  const echoed = effective.filter(term => read.some(quote => quote.includes(term)));
  return { effective, echoed, novel: effective.filter(term => !echoed.includes(term)), effectiveCount: effective.length, echoedCount: echoed.length };
}

function sameRange(left: CandidateRange, right: CandidateRange) {
  return left.sourceId === right.sourceId && left.corpusVersion === right.corpusVersion &&
    left.textHash === right.textHash && left.start === right.start && left.end === right.end &&
    left.selectedStart === right.selectedStart;
}

function sameOrder(left: CandidateRange[], right: CandidateRange[]) {
  return left.length === right.length && left.every((range, index) => sameRange(range, right[index]!));
}

function matchesEvidence(passage: PassageRecord | undefined, expected: z.infer<typeof evidence>): passage is PassageRecord {
  const { sourceId, corpusVersion, textHash, start, end, quote } = expected;
  const splitsCharacter = (text: string, at: number) =>
    /[\uD800-\uDBFF]/u.test(text[at - 1] || '') && /[\uDC00-\uDFFF]/u.test(text[at] || '');
  return !!passage && passage.id === sourceId && passage.corpusVersion === corpusVersion && passage.textHash === textHash &&
    start < end && end <= passage.text.length && passage.text.slice(start, end) === quote &&
    !splitsCharacter(passage.text, start) && !splitsCharacter(passage.text, end);
}

function overlap(left: CandidateRange[], right: CandidateRange[], windows: boolean) {
  const keys = (ranges: CandidateRange[]) => new Set(ranges.map(range => JSON.stringify([
    range.sourceId, range.corpusVersion, range.textHash, ...(windows ? [range.start, range.end] : []),
  ])));
  const a = keys(left), b = keys(right);
  const common = [...a].filter(item => b.has(item)).length;
  const union = a.size + b.size - common;
  return { common, union, jaccard: union ? common / union : null };
}

async function verifyContext(item: Context) {
  const { parent, selection, plannerInput: input } = item;
  const scope = await resolveContentScope(item.recall.scope);
  if (scope.unavailable.length || scope.fingerprint !== item.scopeFingerprint ||
      !isDeepStrictEqual(planningScope(scope.packIds), input.targetScope)) {
    throw new Error(`Case ${item.id}: reading scope differs from the frozen input`);
  }
  const passage = await findFlowPassage(parent.sourceId, parent.corpusVersion);
  if (!matchesEvidence(passage, parent) ||
      input.quote !== parent.quote || input.source !== passage.source || input.chapter !== passage.chapter ||
      !isDeepStrictEqual(input.work, passage.work) ||
      !item.recall.previousQuotes.includes(parent.quote)) {
    throw new Error(`Case ${item.id}: parent source differs from the frozen input`);
  }
  const boundaries = [0, ...lexicalBreaks(passage.text)];
  const startIndex = boundaries.indexOf(selection.start);
  if (selection.textHash !== parent.textHash || selection.corpusVersion !== parent.corpusVersion ||
      startIndex < 0 || boundaries[startIndex + 1] !== selection.end || selection.start >= selection.end ||
      passage.text.slice(selection.start, selection.end) !== input.word ||
      passage.text.slice(Math.max(0, selection.start - 100), selection.start) !== input.before ||
      passage.text.slice(selection.end, selection.end + 100) !== input.after) {
    throw new Error(`Case ${item.id}: selected word differs from the frozen input`);
  }
  for (const gold of item.recall.gold.flat()) {
    const pack = gold.sourceId.startsWith('poetry-') ? 'poetry' : 'core';
    if (!scope.packIds.includes(pack) || !matchesEvidence(await findFlowPassage(gold.sourceId, gold.corpusVersion), gold)) {
      throw new Error(`Case ${item.id}: gold source differs from the frozen evidence (${gold.sourceId})`);
    }
  }
}

async function windowClues(compact: CandidateRange[], novel: string[]) {
  return Promise.all(compact.map(async window => {
    const passage = await findFlowPassage(window.sourceId, window.corpusVersion);
    if (!passage || passage.textHash !== window.textHash || passage.corpusVersion !== window.corpusVersion) {
      throw new Error(`Cannot resolve compact candidate ${window.sourceId}`);
    }
    const text = passage.text.slice(window.start, window.end), normalized = quotationKey(text);
    return { ...window, source: passage.source, chapter: passage.chapter, text, novelTerms: novel.filter(term => normalized.includes(term)) };
  }));
}

function compareRuns(a: Recall | null, b: Recall | null) {
  if (!a || !b) return null;
  return {
    top40: overlap(a.recalled, b.recalled, false),
    top12: overlap(a.compact, b.compact, false),
    top12Windows: overlap(a.compact, b.compact, true),
  };
}

export async function evaluatePlanStability(contextBytes: Buffer, rawPlans: unknown) {
  const rawContexts = JSON.parse(contextBytes.toString('utf8')) as { cases: { plannerInput: unknown }[] };
  const { cases } = contextsSchema.parse(rawContexts);
  const plans = plansSchema.parse(rawPlans);
  const contextSha256 = digest(contextBytes);
  if (plans.contextSha256 !== contextSha256) throw new Error('Frozen context file SHA-256 differs from plan records');
  if (plans.promptVersion !== FLOW_PROMPT_VERSION) throw new Error('Plan prompt version differs from the replay implementation');
  if (new Set(cases.map(item => item.id)).size !== cases.length) throw new Error('Duplicate frozen case ID');
  if (plans.runs.length !== cases.length * plans.repeats) throw new Error('Expected exactly three repeats per frozen case');
  const caseIds = new Set(cases.map(item => item.id));
  if (plans.runs.some(row => !caseIds.has(row.caseId))) throw new Error('Plan record for unknown case');

  for (const [index, item] of cases.entries()) {
    if (digest(JSON.stringify(rawContexts.cases[index]!.plannerInput)) !== item.inputHash) throw new Error(`Case ${item.id}: planner input SHA-256 differs`);
    const records = plans.runs.filter(row => row.caseId === item.id);
    if (new Set(records.map(row => row.repeat)).size !== plans.repeats) throw new Error(`Case ${item.id}: missing or duplicate repeat`);
    if (records.some(row => row.inputHash !== item.inputHash)) throw new Error(`Case ${item.id}: plan record input SHA-256 differs`);
    await verifyContext(item);
  }

  const results = [];
  for (const item of cases) {
    const records = plans.runs.filter(row => row.caseId === item.id).sort((a, b) => a.repeat - b.repeat);
    const runs: ReplayRun[] = [];
    for (const record of records) {
      if (record.status === 'error') {
        runs.push({ ...record, echo: null, recall: null, compactClues: null, replayIdentical: null });
        continue;
      }
      const { word, source } = item.plannerInput;
      const focus = `「${word}」在《${source}》原文此处：${record.sense}；${record.direction}`;
      const replay = { cases: [{ ...item.recall, id: item.id, terms: record.terms, focus }] };
      const [first] = (await evaluateFlowRecall(replay)).cases;
      const [second] = (await evaluateFlowRecall(replay)).cases;
      if (!first || !second || first.scope.fingerprint !== item.scopeFingerprint || second.scope.fingerprint !== item.scopeFingerprint ||
          !sameOrder(first.recalled, second.recalled) || !sameOrder(first.compact, second.compact)) {
        throw new Error(`Case ${item.id}, repeat ${record.repeat}: ordered offline replay differed`);
      }
      const echo = echoTerms(record.terms, item.recall.previousQuotes);
      runs.push({ ...record, focus, echo, recall: first, compactClues: await windowClues(first.compact, echo.novel), replayIdentical: true });
    }
    const overlaps = runs.flatMap((left, index) => runs.slice(index + 1).map(right => ({
      repeats: [left.repeat, right.repeat],
      candidates: compareRuns(left.recall, right.recall),
    })));
    const echoed = runs.flatMap(row => row.echo ? [row.echo.echoed] : []);
    const echoedAcrossRepeats = [...new Set(echoed.flat())].map(term => ({ term, repeats: echoed.filter(terms => terms.includes(term)).length }));
    const successes = runs.filter(row => row.status === 'ok');
    results.push({
      id: item.id, cohort: item.cohort, depth: item.depth, need: item.need,
      inputHash: item.inputHash, scopeFingerprint: item.scopeFingerprint, goldGroupCount: item.recall.gold.length,
      attempts: runs.length, succeeded: successes.length, failed: runs.length - successes.length,
      hitAt40: runs.filter(row => row.recall?.metrics?.hitAt40).length,
      hitAt12: runs.filter(row => row.recall?.metrics?.hitAt12).length,
      attemptsWithAtLeastTwoEchoes: echoed.filter(terms => terms.length >= 2).length,
      echoedAcrossRepeats, runs, overlap: overlaps,
    });
  }
  const attempts = plans.runs.length, failures = plans.runs.filter(row => row.status === 'error').length;
  return {
    summary: { contextSha256, model: plans.model, promptVersion: plans.promptVersion, repeats: plans.repeats,
      cases: results.length, attempts, succeeded: attempts - failures, failed: failures,
      attemptsWithGold: results.reduce((sum, row) => sum + (row.goldGroupCount ? row.attempts : 0), 0),
      frozenGoldGroups: results.reduce((sum, row) => sum + row.goldGroupCount, 0),
      hitAt40: results.reduce((sum, row) => sum + row.hitAt40, 0),
      hitAt12: results.reduce((sum, row) => sum + row.hitAt12, 0),
      attemptsWithAtLeastTwoEchoes: results.reduce((sum, row) => sum + row.attemptsWithAtLeastTwoEchoes, 0),
    },
    cases: results,
  };
}

async function main() {
  const [contexts, plans, ...unexpected] = process.argv.slice(2);
  if (!contexts || !plans || unexpected.length) throw new Error('Usage: tsx scripts/run-flow-plan-stability.ts <contexts.json> <plans.json>');
  const [contextBytes, rawPlans] = await Promise.all([readFile(contexts), readFile(plans, 'utf8')]);
  console.log(JSON.stringify(await evaluatePlanStability(contextBytes, JSON.parse(rawPlans)), null, 2));
}

if (require.main === module) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
