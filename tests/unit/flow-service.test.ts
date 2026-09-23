/** @jest-environment node */
import type { PassageRecord } from '@/types';
import { anchoredSpans, verifyGenerated, resetFlowState, runFlow, parseGeneratedBatch } from '@/lib/flow/service';
import { flowJson } from '@/lib/flow/model';
import { candidatesFor, flowCorpus, checkedQuote } from '@/lib/flow/candidates';
import { type GeneratedBatch, type FlowAnchor, type FlowEvent, type FlowChain } from '@/lib/flow/contracts';
import { selectedLexeme, planLexeme } from '@/lib/flow/lexemes';

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
test('generated entries bind only to their declared surface and preserve exact ranges', () => {
  const base = item('s1', rows[0]!.text);
  const generated: GeneratedBatch = { frames: [{ ...base, anchors: [
    { ...base.anchors[0]!, surface: 'quote', label: '知止' },
    { ...base.anchors[0]!, surface: 'meaning', label: '方向' },
    { ...base.anchors[0]!, surface: 'reflection', label: '本末' },
  ] }] };
  const [frame] = verifyGenerated(generated, rows, 1);
  expect(frame!.anchors.map(anchor => anchor.surface)).toEqual(['quote', 'meaning', 'reflection']);
  for (const anchor of frame!.anchors) expect(frame![anchor.surface!].slice(anchor.start, anchor.end)).toBe(anchor.label);
  expect(frame!.reflectionSpans.filter(span => span.anchorId).map(span => span.text)).toEqual(['本末']);
  generated.frames[0]!.anchors[0]!.label = '本末';
  expect(verifyGenerated(generated, rows, 1)[0]!.anchors.map(anchor => anchor.surface)).toEqual(['meaning', 'reflection']);
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

test('an overlong generated quote gets one correction without changing source text or relaxing verification', async () => {
  const valid = item('s2', rows[1]!.text), events: FlowEvent[] = [];
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ ...valid, quote: '长'.repeat(81) }] })
    .mockResolvedValueOnce({ frames: [valid] });
  await runFlow({ op: 'open', requestId: 'correct-length' }, 'owner', new AbortController().signal, event => events.push(event));
  expect(flowJson).toHaveBeenCalledTimes(2);
  expect(jest.mocked(flowJson).mock.calls[1]![1]).toHaveProperty('validationIssues', [{ path: ['quote'], code: 'too_big' }]);
  expect((events.at(-1) as { chain: FlowChain }).chain.frames[0]!.quote).toBe(rows[1]!.text);
});

test('correction is bounded and cancellation prevents a second model request', async () => {
  const invalid = { frames: [{ ...item('s2', rows[1]!.text), quote: '长'.repeat(81) }] };
  jest.mocked(flowJson).mockResolvedValueOnce(invalid).mockResolvedValueOnce(invalid);
  const events: FlowEvent[] = [];
  await expect(runFlow({ op: 'open', requestId: 'still-invalid' }, 'owner', new AbortController().signal, event => events.push(event)))
    .rejects.toMatchObject({ code: 'MODEL_INVALID' });
  expect(flowJson).toHaveBeenCalledTimes(2); expect(events).toHaveLength(0);
  jest.clearAllMocks();
  const controller = new AbortController();
  jest.mocked(flowJson).mockImplementationOnce(async () => { controller.abort(); return invalid; });
  await expect(runFlow({ op: 'open', requestId: 'cancel-correction' }, 'owner', controller.signal, () => {})).rejects.toThrow();
  expect(flowJson).toHaveBeenCalledTimes(1);
});

test('each request commits one reviewed node and next advances without waiting for companions', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text), item('s2', rows[1]!.text)] });
  const events: FlowEvent[] = [];
  await runFlow({ op: 'open', seed: '本末', requestId: 'single' }, 'owner', new AbortController().signal, event => events.push(event));
  const first = (events.at(-1) as { chain: FlowChain }).chain;
  expect(first.frames).toHaveLength(1);
  expect(first.frames[0]!.ready).toBe(true);
  expect(first.cursor).toBeTruthy();
  expect(first.exhausted).toBe(false);
  expect(jest.mocked(flowJson).mock.calls[0]![0]).toContain('frames最多1项');
  const original = structuredClone(first.frames[0]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  const next = { op: 'next' as const, chainId: first.chainId, cursor: first.cursor, requestId: 'next' };
  await runFlow(next, 'owner', new AbortController().signal, event => events.push(event));
  const second = (events.at(-1) as { chain: FlowChain }).chain;
  expect(second.chainId).toBe(first.chainId);
  expect(second.frames).toHaveLength(1);
  expect(second.frames[0]!.ordinal).toBe(2);
  expect(second.frames[0]!.sourceId).toBe('s2');
  expect(first.frames[0]).toEqual(original);
  await runFlow(next, 'owner', new AbortController().signal, event => events.push(event));
  expect(flowJson).toHaveBeenCalledTimes(2);
  expect((events.at(-1) as { chain: FlowChain }).chain.frames[0]!.id).toBe(second.frames[0]!.id);
});

test('a delivered but unfinished head cannot be used as a continuation cursor', async () => {
  const quote = '知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。';
  const available = [source('opening', quote), ...rows];
  jest.mocked(flowCorpus).mockResolvedValue(available);
  jest.mocked(candidatesFor).mockResolvedValue(available);
  let head: FlowChain;
  jest.mocked(flowJson).mockImplementationOnce(async () => {
    await expect(runFlow({ op: 'next', requestId: 'too-early', chainId: head.chainId, cursor: head.cursor },
      'owner', new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'CHAIN_NOT_READY' });
    return { frames: [item('opening', quote)] };
  });
  await runFlow({ op: 'open', requestId: 'opening' }, 'owner', new AbortController().signal, event => {
    if (event.type === 'head') head = event.chain;
  });
  expect(flowJson).toHaveBeenCalledTimes(1);
});

test('any canonical word can branch with its local meaning, without a prepared anchor; repeated occurrences have separate paths', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', '知止而后有定')] });
  const events: FlowEvent[] = [];
  const emit = (event: FlowEvent) => events.push(event);
  await runFlow({ op: 'open', requestId: 'lexical' }, 'owner', new AbortController().signal, emit);
  const parent = (events.at(-1) as { chain: FlowChain }).chain, frame = parent.frames[0]!;
  const selection = { start: 1, end: 2, textHash: frame.textHash, corpusVersion: frame.corpusVersion };
  const request = { op: 'branch' as const, requestId: 'word', chainId: parent.chainId, fromFrameId: frame.id, selection };
  await expect(runFlow({ ...request, selection: { ...selection, textHash: 'changed' } }, 'owner', new AbortController().signal, emit))
    .rejects.toMatchObject({ code: 'TEXT_CHANGED' });
  expect(() => selectedLexeme(frame, { ...selection, start: 0 })).toThrow();
  const plan = { sense: '应当安止之处', direction: '辨明所守的方向', terms: ['物有本末', '知所先后'] };
  jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await runFlow(request, 'owner', new AbortController().signal, emit);
  const child = (events.at(-1) as { chain: FlowChain }).chain;
  expect(child.entry).toEqual({ fromFrameId: frame.id, anchorId: 'text:1:2', label: '止' });
  expect(child.parentChainId).toBe(parent.chainId);
  expect(jest.mocked(flowJson).mock.calls[1]![1]).toMatchObject({ word: '止', before: '知', after: '而后有定，定而后能静。' });
  await runFlow(request, 'owner', new AbortController().signal, emit);
  expect(flowJson).toHaveBeenCalledTimes(3);
  const ids = [];
  for (const start of [5, 7]) {
    jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
    await runFlow({ ...request, selection: { ...selection, start, end: start + 1 } }, 'owner', new AbortController().signal, emit);
    ids.push((events.at(-1) as { chain: FlowChain }).chain.chainId);
  }
  expect(new Set(ids).size).toBe(2);
  expect(frame.quoteEnd).toBe(6); // The second 定 was outside the visible excerpt.
});

test('a word in the first readable head can branch before its explanation, and that parent resumes without changing identity', async () => {
  const quote = '知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。';
  const available = [source('opening', quote), ...rows];
  jest.mocked(flowCorpus).mockResolvedValue(available); jest.mocked(candidatesFor).mockResolvedValue(available);
  const controller = new AbortController(), events: FlowEvent[] = [];
  let release!: (value: unknown) => void;
  jest.mocked(flowJson).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const opening = runFlow({ op: 'open', requestId: 'early-word' }, 'owner', controller.signal, e => events.push(e));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const parent = (events[0] as { chain: FlowChain }).chain, frame = parent.frames[0]!;
  controller.abort(); release({ frames: [item('opening', quote)] });
  await expect(opening).rejects.toThrow();
  jest.mocked(flowJson).mockResolvedValueOnce({ sense: '先后相承', direction: '安定如何通向宁静', terms: ['知所先后', '静而后能安'] })
    .mockResolvedValueOnce({ frames: [item('s3', rows[2]!.text)] });
  await runFlow({ op: 'branch', requestId: 'early-branch', chainId: parent.chainId, fromFrameId: frame.id,
    selection: { start: 2, end: 4, textHash: frame.textHash, corpusVersion: frame.corpusVersion } }, 'owner', new AbortController().signal, e => events.push(e));
  expect((events.at(-1) as { chain: FlowChain }).chain.entry!.label).toBe('而后');
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('opening', quote)] });
  await runFlow({ op: 'open', chainId: parent.chainId, requestId: 'resume-parent' }, 'owner', new AbortController().signal, e => events.push(e));
  const restored = (events.at(-1) as { chain: FlowChain }).chain;
  expect(restored.chainId).toBe(parent.chainId);
  expect(restored.frames[0]).toMatchObject({ id: frame.id, quote: frame.quote, ready: true });
});

test('a lexical branch cannot repeat a shortened parent quotation under another source ID', async () => {
  const events: FlowEvent[] = [];
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  await runFlow({ op: 'open', requestId: 'duplicate-root' }, 'owner', new AbortController().signal, event => events.push(event));
  const parent = (events.at(-1) as { chain: FlowChain }).chain, frame = parent.frames[0]!;
  const duplicate = source('other-edition', rows[0]!.text);
  jest.mocked(candidatesFor).mockResolvedValue([duplicate, ...rows]);
  jest.mocked(flowJson).mockResolvedValueOnce({ sense: '安止', direction: '辨明所守的方向', terms: ['物有本末', '知所先后'] })
    .mockResolvedValueOnce({ frames: [item('other-edition', '知止而后有定')] });
  await expect(runFlow({ op: 'branch', requestId: 'duplicate-word', chainId: parent.chainId, fromFrameId: frame.id,
    selection: { start: 1, end: 2, textHash: frame.textHash, corpusVersion: frame.corpusVersion } }, 'owner', new AbortController().signal, () => {}))
    .rejects.toMatchObject({ code: 'NO_BRANCH' });
  expect(jest.mocked(flowJson).mock.calls[2]![1]).toHaveProperty('avoidQuote', frame.quote);
});

test('invalid word-planning output produces a readable retry message instead of leaking schema diagnostics', async () => {
  const frame = verifyGenerated({ frames: [item('s1', rows[0]!.text)] }, rows, 1)[0]!;
  jest.mocked(flowJson).mockResolvedValueOnce({ sense: '安止', direction: '长'.repeat(121), terms: ['物有本末', '知所先后'] });
  await expect(planLexeme(frame, { start: 1, end: 2, textHash: frame.textHash, corpusVersion: frame.corpusVersion }, '方向', new AbortController().signal))
    .rejects.toMatchObject({ code: 'LEXEME_UNRESOLVED', message: '这个字词的联系还未理清，可以留在原句或重试。' });
});
