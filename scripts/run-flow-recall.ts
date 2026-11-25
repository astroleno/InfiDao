import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { resolveContentScope } from '@/lib/content/scope';
import { candidatesFor, findFlowPassage } from '@/lib/flow/candidates';
import { compactCandidates, type CandidateRange } from '@/lib/flow/context';
import type { PassageRecord } from '@/types';

const key = z.string().min(1);
const source = z.object({ sourceId: key, corpusVersion: key, textHash: key });
const evidence = source.extend({
  start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: key,
});
const fixture = z.object({
  cases: z.array(z.object({
    id: key,
    op: z.enum(['open', 'branch', 'next']),
    terms: z.array(key),
    focus: z.string(),
    scope: z.tuple([z.literal('core')]).rest(z.literal('poetry')).refine(scope => scope.length <= 2),
    exclude: z.array(key).default([]),
    force: z.object({ sourceId: key, quote: key }).optional(),
    previousQuotes: z.array(key).default([]),
    semantics: z.array(z.object({
      id: key, corpusVersion: key, textHash: key, promptVersion: key,
      text: z.string(), updated: z.number(), contentScope: key.optional(),
    }).transform(({ contentScope, ...entry }) => ({ ...entry, ...(contentScope ? { contentScope } : {}) }))).default([]),
    gold: z.array(z.array(evidence).min(1)),
  })).min(1),
});

type Gold = z.infer<typeof evidence>;
const matchesSource = (candidate: CandidateRange, gold: Gold) =>
  candidate.sourceId === gold.sourceId && candidate.corpusVersion === gold.corpusVersion && candidate.textHash === gold.textHash;

const contains = (candidate: CandidateRange, gold: Gold) =>
  matchesSource(candidate, gold) && candidate.start <= gold.start && candidate.end >= gold.end;

const splitsCharacter = (text: string, at: number) =>
  /[\uD800-\uDBFF]/u.test(text[at - 1] || '') && /[\uDC00-\uDFFF]/u.test(text[at] || '');

function validateGold(gold: Gold, passage: PassageRecord | undefined) {
  if (!passage || passage.id !== gold.sourceId || passage.corpusVersion !== gold.corpusVersion || passage.textHash !== gold.textHash) {
    throw new Error(`Invalid gold source identity: ${gold.sourceId}`);
  }
  if (gold.start >= gold.end || gold.end > passage.text.length ||
      splitsCharacter(passage.text, gold.start) || splitsCharacter(passage.text, gold.end) ||
      passage.text.slice(gold.start, gold.end) !== gold.quote) {
    throw new Error(`Invalid gold UTF-16 range: ${gold.sourceId} [${gold.start}, ${gold.end})`);
  }
}

type GroupOutcome = 'hit12' | 'windowMiss' | 'shortlistMiss' | 'poolMiss';

export function scoreGoldGroup(gold: readonly Gold[], recalled: CandidateRange[], compact: CandidateRange[]): GroupOutcome {
  if (gold.some(item => compact.some(window => contains(window, item)))) return 'hit12';
  if (gold.some(item => compact.some(window => matchesSource(window, item)))) return 'windowMiss';
  if (gold.some(item => recalled.some(window => contains(window, item)))) return 'shortlistMiss';
  return 'poolMiss';
}

export async function evaluateFlowRecall(raw: unknown) {
  const { cases } = fixture.parse(raw);
  if (new Set(cases.map(item => item.id)).size !== cases.length) throw new Error('Duplicate case ID');
  const results = [];
  for (const item of cases) {
    try {
      const scope = await resolveContentScope(item.scope);
      if (scope.unavailable.length) throw new Error(`Unavailable content pack: ${scope.unavailable.join(', ')}`);
      for (const gold of item.gold.flat()) {
        const pack = gold.sourceId.startsWith('poetry-') ? 'poetry' : 'core';
        if (!scope.packIds.includes(pack) && gold.sourceId !== item.force?.sourceId) {
          throw new Error(`Gold source is outside the retrieval scope: ${gold.sourceId}`);
        }
        validateGold(gold, await findFlowPassage(gold.sourceId, gold.corpusVersion));
      }
      const rows = await candidatesFor(item.terms, item.focus, new Set(item.exclude), item.force?.sourceId, item.semantics, scope.packIds);
      const recalled = rows.map(row => ({ sourceId: row.id, corpusVersion: row.corpusVersion, textHash: row.textHash, start: 0, end: row.text.length }));
      const selection = compactCandidates(rows, item.terms, item.force, item.previousQuotes);
      const compact = selection.windows;
      const groups = item.gold.map((group, index) => {
        const ordinary = group.filter(gold => gold.sourceId !== item.force?.sourceId);
        const forced = group.filter(gold => gold.sourceId === item.force?.sourceId);
        return {
          index,
          ordinary: ordinary.length ? scoreGoldGroup(ordinary, recalled, compact) : null,
          forced: forced.length ? scoreGoldGroup(forced, recalled, compact) : null,
        };
      });
      const losses = { hit12: 0, windowMiss: 0, shortlistMiss: 0, poolMiss: 0 };
      for (const group of groups) if (group.ordinary) losses[group.ordinary]++;
      const denominator = Object.values(losses).reduce((sum, count) => sum + count, 0);
      const hit40 = denominator - losses.poolMiss, hit12 = losses.hit12;
      const metrics = denominator ? {
        hitAt40: Number(hit40 > 0), hitAt12: Number(hit12 > 0),
        recallAt40: hit40 / denominator, recallAt12: hit12 / denominator,
      } : null;
      results.push({
        id: item.id, op: item.op, scope, recalled, compact, groups, losses, metrics,
        forcedHead: item.force ? {
          sourceId: item.force.sourceId,
          inTop40: recalled.some(candidate => candidate.sourceId === item.force?.sourceId),
          inTop12: compact.some(candidate => candidate.sourceId === item.force?.sourceId),
        } : null,
        noApplicableEvidence: item.gold.length === 0,
      });
    } catch (error) {
      throw new Error(`Case ${item.id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  const scored = results.flatMap(row => row.metrics ? [row.metrics] : []);
  const mean = (metric: keyof (typeof scored)[number]) =>
    scored.length ? scored.reduce((total, row) => total + row[metric], 0) / scored.length : null;
  return {
    summary: {
      cases: results.length, scoredCases: scored.length,
      noApplicableEvidence: results.filter(result => result.noApplicableEvidence).length,
      forcedOnlyEvidence: results.filter(result => !result.noApplicableEvidence && !result.metrics).length,
      hitAt40: mean('hitAt40'), hitAt12: mean('hitAt12'),
      macroRecallAt40: mean('recallAt40'), macroRecallAt12: mean('recallAt12'),
      losses: {
        poolMiss: results.reduce((sum, result) => sum + result.losses.poolMiss, 0),
        shortlistMiss: results.reduce((sum, result) => sum + result.losses.shortlistMiss, 0),
        windowMiss: results.reduce((sum, result) => sum + result.losses.windowMiss, 0),
      },
    },
    cases: results,
  };
}

async function main() {
  const [path, ...unexpected] = process.argv.slice(2);
  if (!path || unexpected.length) throw new Error('Usage: tsx scripts/run-flow-recall.ts <cases.json>');
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  console.log(JSON.stringify(await evaluateFlowRecall(raw), null, 2));
}

if (require.main === module) void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
