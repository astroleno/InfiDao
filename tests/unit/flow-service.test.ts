/** @jest-environment node */
import type { PassageRecord } from '@/types';
import { anchoredSpans, verifyGenerated, resetFlowState, runFlow, parseGeneratedBatch } from '@/lib/flow/service';
import { flowJson } from '@/lib/flow/model';
import { candidatesFor, flowCorpus, checkedQuote } from '@/lib/flow/candidates';
import { type GeneratedBatch, type FlowAnchor, type FlowEvent, type FlowChain } from '@/lib/flow/contracts';

jest.mock('@/lib/flow/model', () => ({ flowJson: jest.fn(), flowModelConfig: () => ({ model: 'test' }) }));
jest.mock('@/lib/flow/relations', () => ({ reviewRelations: jest.fn(async frames => frames) }));
jest.mock('@/lib/flow/candidates', () => ({ ...jest.requireActual('@/lib/flow/candidates'),
  flowCorpus: jest.fn(), candidatesFor: jest.fn(), planFocus: jest.fn(async () => ({ focus: '本末', terms: ['本末', '知止'] })) }));
const source = (id: string, text: string): PassageRecord => ({ id, text, source: '大学', chapter: '经一章', section: 1,
  collection: 'six_classics', workId: 'daxue', workTitle: '大学', corpusVersion: 'test-v1', textHash: id });
const rows = [source('s1', '知止而后有定，定而后能静。'), source('s2', '物有本末，事有终始。'), source('s3', '知所先后，则近道矣。')];
const item = (id: string, text: string) => ({ sourceId: id, quote: text, meaning: '原文的方向与次序',
  reflection: '先辨明本末，再看先后。', relevance: 0.95, anchors: [{ label: '本末', sense: '根本与末节', direction: '辨别轻重次序', terms: ['本末'],
    target: { sourceId: 's2', quote: rows[1]!.text, meaning: '事物有根本与末节。' } }] });
beforeEach(() => { jest.clearAllMocks(); resetFlowState(); jest.mocked(candidatesFor).mockResolvedValue(rows); jest.mocked(flowCorpus).mockResolvedValue(rows); });

test('verbatim source ranges are required; corrupted private glyphs and fabricated quotes are rejected', () => {
  expect(checkedQuote(rows[0], '知止而后有定')).toEqual({ quoteStart: 0, quoteEnd: 6 });
  expect(() => checkedQuote(rows[0], '知止然后定')).toThrow();
  expect(() => checkedQuote(source('bad', '字\ue730'), '字\ue730')).toThrow();
  expect(verifyGenerated({ frames: [item('s1', '伪造的经文')] }, rows, 1)).toEqual([]);
  const valid = item('s1', rows[0]!.text);
  expect(parseGeneratedBatch({ frames: [valid, { quote: 'invalid' }] }).frames).toEqual([valid]);
});
test('links must target verified, different passages and preserve stable complete text spans', () => {
  const frames = verifyGenerated({ frames: [item('s1', rows[0]!.text)] }, rows, 1);
  expect(frames[0]!.anchors).toHaveLength(1);
  expect(frames[0]!.reflectionSpans.map(span => span.text).join('')).toBe(frames[0]!.reflection);
  expect(verifyGenerated({ frames: [item('s2', rows[1]!.text)] }, rows, 1)[0]!.anchors).toHaveLength(0);
  const bad = item('s1', rows[0]!.text); bad.anchors[0]!.target.quote = '拼接的假话';
  expect(verifyGenerated({ frames: [bad] }, rows, 1)[0]!.anchors).toHaveLength(0);
  const anchors = [{ id: 'a', label: '本末' }, { id: 'b', label: '本' }] as FlowAnchor[];
  expect(anchoredSpans('辨本末', anchors).anchors.map(anchor => anchor.id)).toEqual(['a']);
});
test('relevance rejection does not fabricate a branch and prepared heads cannot change quotation', () => {
  const raw = item('s1', rows[0]!.text); raw.relevance = 0.4;
  expect(verifyGenerated({ frames: [raw] }, rows, 1)).toHaveLength(0);
  const head = verifyGenerated({ frames: [item('s1', rows[0]!.text)] }, rows, 1)[0]!;
  expect(verifyGenerated({ frames: [item('s1', '知止而后有定')] }, rows, 1, head)[0]!.quote).toBe(head.quote);
  expect(verifyGenerated({ frames: [item('s2', rows[1]!.text)] }, rows, 1, head)[0]!.id).toBe(head.id);
});
test('a branch streams its canonical head before the model and is isolated by owner and parent anchor', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  const events: FlowEvent[] = [];
  await runFlow({ op: 'open', requestId: 'first' }, 'owner', new AbortController().signal, event => events.push(event));
  const root = (events.at(-1) as { chain: FlowChain }).chain, node = root.frames[0]!;
  const branch = { op: 'branch' as const, requestId: 'branch', chainId: root.chainId, fromFrameId: node.id, anchorId: node.anchors[0]!.id };
  await expect(runFlow(branch, 'stranger', new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'CHAIN_EXPIRED' });
  jest.mocked(flowJson).mockImplementationOnce(async () => {
    expect(events.at(-1)!.type).toBe('head');
    return { frames: [item('s2', rows[1]!.text)] } as GeneratedBatch;
  });
  await runFlow(branch, 'owner', new AbortController().signal, event => events.push(event));
  const child = (events.at(-1) as { chain: FlowChain }).chain;
  expect(child.parentChainId).toBe(root.chainId);
  expect(child.frames[0]!.quote).toBe(node.anchors[0]!.target.quote);
  await runFlow(branch, 'owner', new AbortController().signal, event => events.push(event));
  expect(flowJson).toHaveBeenCalledTimes(2);
  await expect(runFlow({ op: 'next', requestId: 'wrong', chainId: child.chainId, cursor: 'stale' }, 'owner', new AbortController().signal, () => {}))
    .rejects.toMatchObject({ code: 'CURSOR_CHANGED' });
});
test('an empty opening shows a verified head before explanation generation without replacing it later', async () => {
  const quote = '知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。';
  const available = [source('opening', quote), ...rows];
  jest.mocked(flowCorpus).mockResolvedValue(available);
  jest.mocked(candidatesFor).mockResolvedValue(available);
  const events: FlowEvent[] = [];
  jest.mocked(flowJson).mockImplementationOnce(async () => {
    const early = (events[0] as { chain: FlowChain }).chain.frames[0]!;
    expect(events[0]!.type).toBe('head');
    expect(early.quote).toBe(quote);
    expect(early.ready).toBe(false);
    // Even a shortened model quote cannot replace the already visible head.
    return { frames: [item('opening', '知止而后有定')] } as GeneratedBatch;
  });
  await runFlow({ op: 'open', seed: '', requestId: 'empty' }, 'owner', new AbortController().signal, event => events.push(event));
  const first = (events[0] as { chain: FlowChain }).chain.frames[0]!;
  const complete = (events.at(-1) as { chain: FlowChain }).chain.frames[0]!;
  expect(complete.id).toBe(first.id);
  expect(complete.quote).toBe(first.quote);
  expect(complete.ready).toBe(true);
});
test('abort while generating never commits late model output', async () => {
  const controller = new AbortController();
  jest.mocked(flowJson).mockImplementationOnce(async () => { controller.abort(); return { frames: [item('s1', rows[0]!.text)] }; });
  const events: FlowEvent[] = [];
  await expect(runFlow({ op: 'open', requestId: 'cancel' }, 'owner', controller.signal, event => events.push(event))).rejects.toThrow();
  expect(events).toHaveLength(0);
});
