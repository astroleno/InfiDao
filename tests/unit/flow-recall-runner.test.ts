/** @jest-environment node */
import { evaluateFlowRecall, scoreGoldGroup } from '../../scripts/run-flow-recall';
import { candidatesFor, findFlowPassage } from '@/lib/flow/candidates';
import { compactCandidates } from '@/lib/flow/context';
import type { PassageRecord } from '@/types';

jest.mock('@/lib/flow/candidates', () => ({ candidatesFor: jest.fn(), findFlowPassage: jest.fn() }));

const identity = { sourceId: 'source', corpusVersion: 'v1', textHash: 'hash' };
const target = { ...identity, start: 500, end: 502, quote: '仁义' };
const alternate = { ...target, sourceId: 'alternate' };
const recalled = [{ ...identity, start: 0, end: 1000 }];

test('candidate containment is strict and accepts any fully contained alternative', () => {
  expect(scoreGoldGroup([target], recalled, [{ ...identity, start: 501, end: 600 }])).toBe('windowMiss');
  expect(scoreGoldGroup([target], recalled, [{ ...identity, start: 1, end: 501 }])).toBe('windowMiss');
  expect(scoreGoldGroup([target], recalled, [])).toBe('shortlistMiss');
  expect(scoreGoldGroup([target], [], [])).toBe('poolMiss');
  expect(scoreGoldGroup([target, alternate], [...recalled, { ...alternate, start: 0, end: 1000 }], [alternate])).toBe('hit12');
});

test('repeated poetry is scored at the position supplied to the model after the read sentence is removed', () => {
  const quote = '𠮷'.repeat(240);
  const read = '已读章' + quote + '。';
  const text = read + quote + '；补语。';
  const passage = { id: identity.sourceId, source: '诗', chapter: '篇', text,
    corpusVersion: identity.corpusVersion, textHash: identity.textHash,
    work: { packId: 'poetry', workId: 'poem', revision: 'v1', start: 0, end: text.length,
      title: '篇', author: '', dynasty: '', genre: '' } } as PassageRecord;
  const compact = compactCandidates([passage], [], undefined, [read]);
  expect(compact.input[0]).toMatchObject({ text: quote, excerptStart: 3 });
  expect(compact.windows).toEqual([{ ...identity, start: 3, end: 3 + quote.length, selectedStart: read.length }]);
  const retrieved = [{ ...identity, start: 0, end: text.length }];
  expect(scoreGoldGroup([{ ...identity, start: read.length, end: read.length + quote.length, quote }], retrieved, compact.windows))
    .toBe('windowMiss');
  expect(scoreGoldGroup([{ ...identity, start: 3, end: 3 + quote.length, quote }], retrieved, compact.windows))
    .toBe('hit12');
});

test('fixture evidence is checked against the version, hash and UTF-16 source text before recall', async () => {
  const text = '口'.repeat(498) + '𠮷仁义。';
  jest.mocked(findFlowPassage).mockResolvedValue({ id: identity.sourceId, source: '礼记', chapter: '篇',
    text, corpusVersion: 'v1', textHash: 'hash' } as PassageRecord);
  jest.mocked(candidatesFor).mockResolvedValue([]);
  const item = { id: 'one', op: 'open', terms: ['仁义'], focus: '仁义', scope: ['core'] };
  await expect(evaluateFlowRecall({ cases: [{ ...item, gold: [[{ ...target, textHash: 'stale' }]] }] }))
    .rejects.toThrow('Invalid gold source identity');
  await expect(evaluateFlowRecall({ cases: [{ ...item, gold: [[{ ...target, corpusVersion: 'stale' }]] }] }))
    .rejects.toThrow('Invalid gold source identity');
  await expect(evaluateFlowRecall({ cases: [{ ...item, gold: [[{ ...target, start: 499, quote: text.slice(499, 502) }]] }] }))
    .rejects.toThrow('Invalid gold UTF-16 range');
  await expect(evaluateFlowRecall({ cases: [{ ...item, gold: [[target]] }] }))
    .resolves.toMatchObject({ summary: { scoredCases: 1, hitAt40: 0, losses: { poolMiss: 1 } } });
  await expect(evaluateFlowRecall({ cases: [{ ...item, gold: [] }] }))
    .resolves.toMatchObject({ summary: { scoredCases: 0, noApplicableEvidence: 1, hitAt40: null } });
});

test('a force-only evidence group stays out of recall totals even when its source is delivered', async () => {
  const text = '仁义。';
  const passage = { id: identity.sourceId, source: '礼记', chapter: '篇', text,
    corpusVersion: identity.corpusVersion, textHash: identity.textHash } as PassageRecord;
  jest.mocked(findFlowPassage).mockResolvedValue(passage);
  jest.mocked(candidatesFor).mockResolvedValue([passage]);
  const force = { sourceId: identity.sourceId, quote: text };
  await expect(evaluateFlowRecall({
    cases: [{ id: 'forced', op: 'next', terms: ['仁义'], focus: '仁义', scope: ['core'], force,
      gold: [[{ ...identity, start: 0, end: text.length, quote: text }]] }],
  })).resolves.toMatchObject({
    summary: { scoredCases: 0, noApplicableEvidence: 0, forcedOnlyEvidence: 1, hitAt12: null },
    cases: [{ groups: [{ ordinary: null, forced: 'hit12' }], forcedHead: { inTop40: true, inTop12: true } }],
  });
});
