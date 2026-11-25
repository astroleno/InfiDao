/** @jest-environment node */
import { createHash } from 'node:crypto';
import { evaluatePlanStability, echoTerms } from '../../scripts/run-flow-plan-stability';
import { planningScope } from '@/lib/flow/context';
import { FLOW_PROMPT_VERSION } from '@/lib/flow/contracts';
import { candidatesFor, findFlowPassage } from '@/lib/flow/candidates';
import { resolveContentScope } from '@/lib/content/scope';
import type { PassageRecord } from '@/types';

jest.mock('@/lib/flow/candidates', () => ({ candidatesFor: jest.fn(), findFlowPassage: jest.fn() }));

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const passage = (id: string, text: string): PassageRecord => ({
  id, text, source: '论语', chapter: '学而', textHash: id, corpusVersion: 'v1',
  workId: 'lunyu', workTitle: '论语', collection: 'core', section: 0,
});
const parent = passage('parent', '仁。'), target = passage('target', '以礼立身。'), other = passage('other', '故能长久。');
const exact = (value: PassageRecord) =>
  ({ sourceId: value.id, textHash: value.textHash, corpusVersion: value.corpusVersion, start: 0, end: value.text.length, quote: value.text });

async function fixture() {
  const scope = await resolveContentScope(['core']);
  const plannerInput = { word: '仁', source: parent.source, chapter: parent.chapter, surface: 'quote',
    quote: parent.text, before: '', after: '。', focus: '保留旧焦点', targetScope: planningScope() };
  const inputHash = hash(JSON.stringify(plannerInput));
  const item = { id: 'test', cohort: 'control', depth: 1, need: '以礼验仁', parent: exact(parent),
    selection: { start: 0, end: 1, textHash: parent.textHash, corpusVersion: parent.corpusVersion },
    plannerInput, inputHash, scopeFingerprint: scope.fingerprint,
    recall: { op: 'branch', scope: ['core'], exclude: [parent.id], previousQuotes: [parent.text, '有伦有序。'], semantics: [], gold: [[exact(target)]] },
  };
  const bytes = Buffer.from(JSON.stringify({ cases: [item] }) + '\n');
  const ok = { caseId: item.id, repeat: 1, inputHash, elapsedMs: 10, status: 'ok', sense: '关乎行事', direction: '用礼分辨处境', terms: ['有伦', '以礼'] };
  const records = { contextSha256: hash(bytes), model: 'test', promptVersion: FLOW_PROMPT_VERSION, repeats: 3,
    runs: [ok, { ...ok, repeat: 2, terms: ['有序', '以礼'] }, { caseId: item.id, repeat: 3, inputHash, elapsedMs: 15, status: 'error', errorCode: 'TIMEOUT' }],
  };
  return { item, bytes, records };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(findFlowPassage).mockImplementation(async id => [parent, target, other].find(row => row.id === id));
  jest.mocked(candidatesFor).mockImplementation(async terms => terms.includes('有伦') ? [target, other] : [target]);
});

test('echoes require two code points and never span separate quotations', () => {
  expect(echoTerms(['有伦', '有、伦', '伦有', '仁', '𠮷', '𠮷𠮷', '有序'], ['有伦。', '有序亦𠮷𠮷。']))
    .toEqual({ effective: ['有伦', '伦有', '𠮷𠮷', '有序'], echoed: ['有伦', '𠮷𠮷', '有序'], novel: ['伦有'], effectiveCount: 4, echoedCount: 3 });
});

test('replays each success twice and keeps a failure in the frozen denominator', async () => {
  const { bytes, records } = await fixture();
  const report = await evaluatePlanStability(bytes, records);
  expect(report.summary).toMatchObject({ attempts: 3, succeeded: 2, failed: 1, attemptsWithGold: 3,
    frozenGoldGroups: 1, hitAt40: 2, hitAt12: 2, attemptsWithAtLeastTwoEchoes: 0 });
  const reading = report.cases[0]!;
  expect(reading.echoedAcrossRepeats).toEqual([{ term: '有伦', repeats: 1 }, { term: '有序', repeats: 1 }]);
  expect(reading.runs[0]).toMatchObject({ replayIdentical: true, echo: { echoed: ['有伦'] }, compactClues: [{ text: target.text, novelTerms: ['以礼'] }, { text: other.text, novelTerms: [] }] });
  expect(reading.runs[2]).toMatchObject({ status: 'error', errorCode: 'TIMEOUT', recall: null });
  expect(reading.overlap[0]).toMatchObject({ repeats: [1, 2], candidates: { top40: { common: 1, union: 2, jaccard: .5 }, top12: { jaccard: .5 }, top12Windows: { jaccard: .5 } } });
  expect(reading.overlap[1]).toEqual({ repeats: [1, 3], candidates: null });
  expect(candidatesFor).toHaveBeenCalledTimes(4);
  expect(candidatesFor).toHaveBeenNthCalledWith(1, ['有伦', '以礼'], '「仁」在《论语》原文此处：关乎行事；用礼分辨处境', new Set([parent.id]), undefined, [], ['core']);
});

test('rejects modified inputs, duplicated repeats and an incorrect reading scope', async () => {
  const { item, bytes, records } = await fixture();
  await expect(evaluatePlanStability(Buffer.concat([bytes, Buffer.from(' ')]), records)).rejects.toThrow('context file SHA-256');
  await expect(evaluatePlanStability(bytes, { ...records, runs: [records.runs[0], records.runs[0], records.runs[2]] })).rejects.toThrow('duplicate repeat');
  const changedInput = Buffer.from(JSON.stringify({ cases: [{ ...item, plannerInput: { ...item.plannerInput, focus: '改动' } }] }));
  await expect(evaluatePlanStability(changedInput, { ...records, contextSha256: hash(changedInput) })).rejects.toThrow('planner input SHA-256');
  const wrongScope = Buffer.from(JSON.stringify({ cases: [{ ...item, scopeFingerprint: 'old' }] }));
  await expect(evaluatePlanStability(wrongScope, { ...records, contextSha256: hash(wrongScope) })).rejects.toThrow('reading scope differs');
  expect(candidatesFor).not.toHaveBeenCalled();
});

test('detects a changed candidate order even with the same set', async () => {
  const { bytes, records } = await fixture();
  jest.mocked(candidatesFor).mockResolvedValueOnce([target, other]).mockResolvedValueOnce([other, target]);
  await expect(evaluatePlanStability(bytes, records)).rejects.toThrow('ordered offline replay differed');
});
