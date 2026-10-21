/** @jest-environment node */
import type { PassageRecord } from '@/types';
import { anchoredSpans, verifyGenerated, resetFlowState, runFlow, parseGeneratedBatch } from '@/lib/flow/service';
import { flowJson } from '@/lib/flow/model';
import { candidatesFor, flowCorpus, checkedQuote, planFocus } from '@/lib/flow/candidates';
import { flowRequestSchema, FlowError, type GeneratedBatch, type FlowAnchor, type FlowEvent, type FlowChain } from '@/lib/flow/contracts';
import { chargeFlowModel, withFlowModelBudget } from '@/lib/flow/model-budget';
import { createFlowBudget } from '@/lib/flow/request-budget';
import { createSessionStore, MemoryDocumentBackend } from '@/lib/flow/session-store';
import { reviewRelations } from '@/lib/flow/relations';
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

test('a delivered meaning is already stored and can start a child before its parent finishes review', async () => {
  let sequence = 0;
  const store = createSessionStore(new MemoryDocumentBackend(), { createId: () => `live-${sequence++}` });
  const controller = new AbortController(), events: FlowEvent[] = [], childEvents: FlowEvent[] = [];
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] })
    .mockResolvedValueOnce({ sense: '可循之路', direction: '辨别根本和末节', terms: ['本末', '先后'] })
    .mockResolvedValueOnce({ frames: [{ ...item('s2', rows[1]!.text), anchors: [] }] });
  jest.mocked(reviewRelations).mockImplementationOnce(async (frames, _seed, _focus, _candidates, _signal, _context, publish) => {
    const partial = { ...frames[0]!, ready: false, meaning: '方向可以辨明。', reflection: '', anchors: [],
      settled: { meaning: true, reflection: false } };
    await publish!(partial);
    const parent = (events.at(-1) as { chain: FlowChain }).chain;
    const saved = await store.getChain('owner', parent.chainId);
    expect(saved.nodes[partial.id]).toMatchObject({ ready: false, meaning: partial.meaning, settled: { meaning: true } });
    await runFlow({ op: 'branch', requestId: 'from-live-meaning', chainId: parent.chainId, fromFrameId: partial.id,
      selection: { start: 0, end: 2, surface: 'meaning', surfaceText: partial.meaning, textHash: partial.textHash, corpusVersion: partial.corpusVersion } },
    'owner', new AbortController().signal, event => childEvents.push(event), store);
    controller.abort(); controller.signal.throwIfAborted();
    return frames;
  });
  await expect(runFlow({ op: 'open', seed: '本末', requestId: 'live-parent' }, 'owner', controller.signal, event => events.push(event), store))
    .rejects.toMatchObject({ name: 'AbortError' });
  const parent = (events.at(-1) as { chain: FlowChain }).chain;
  const child = (childEvents.at(-1) as { chain: FlowChain }).chain;
  expect(child.parentChainId).toBe(parent.chainId);
  expect(child.frames[0]!.quote).toBe(rows[1]!.text);
  expect(Object.values((await store.getChain('owner', parent.chainId)).branches)).toContain(child.chainId);
});

test('an interrupted continuation resumes that same paragraph rather than replaying the initial batch', async () => {
  let sequence = 0;
  const store = createSessionStore(new MemoryDocumentBackend(), { createId: () => `resume-${sequence++}` });
  const events: FlowEvent[] = [];
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  await runFlow({ op: 'open', seed: '本末', requestId: 'root' }, 'owner', new AbortController().signal, e => events.push(e), store);
  const root = (events.at(-1) as { chain: FlowChain }).chain;
  const controller = new AbortController();
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ ...item('s2', rows[1]!.text), anchors: [] }] });
  jest.mocked(reviewRelations).mockImplementationOnce(async (frames, _a, _b, _c, _d, _e, publish) => {
    await publish!({ ...frames[0]!, ready: false, reflection: '', settled: { meaning: true, reflection: false } });
    controller.abort(); controller.signal.throwIfAborted();
    return frames;
  });
  await expect(runFlow({ op: 'next', requestId: 'second', chainId: root.chainId, cursor: root.cursor! }, 'owner', controller.signal, e => events.push(e), store))
    .rejects.toMatchObject({ name: 'AbortError' });
  const partial = (events.at(-1) as { chain: FlowChain }).chain.frames[0]!;
  expect(partial.ready).toBe(false);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ ...item('s2', rows[1]!.text), anchors: [] }] });
  await runFlow({ op: 'open', requestId: 'resume-second', chainId: root.chainId }, 'owner', new AbortController().signal, e => events.push(e), store);
  const complete = (events.at(-1) as { chain: FlowChain }).chain;
  expect(complete.frames[0]).toMatchObject({ id: partial.id, quote: partial.quote, meaning: partial.meaning, ready: true });
  expect(complete.cursor).not.toBe(root.cursor);
  expect(flowJson).toHaveBeenCalledTimes(3);
});

test('same-source distinct alternatives both reach review; identical quotations do not', () => {
  const passage = source('shared', '安土敦乎仁，故能爱。君子素其位而行，不愿乎其外。');
  const a = { ...item('shared', '安土敦乎仁，故能爱。'), anchors: [] };
  const b = { ...item('shared', '君子素其位而行，不愿乎其外。'), anchors: [] };
  expect(verifyGenerated({ frames: [a, a, b] }, [passage], 1).map(f => f.quote)).toEqual([a.quote, b.quote]);
});

test('malformed optional prepared links are dropped without rejecting valid on-demand reading text', () => {
  const valid = item('s1', rows[0]!.text);
  const parsed = parseGeneratedBatch({ frames: [{ ...valid, anchors: [
    { ...valid.anchors[0], surface: '释义' },
    { ...valid.anchors[0], target: { sourceId: 's2', quote: '长'.repeat(81), meaning: '过长的引文。' } },
  ] }] });
  expect(parsed.frames).toEqual([{ ...valid, anchors: [] }]);
  expect(() => parseGeneratedBatch({ frames: [{ ...valid, quote: '长'.repeat(81), anchors: [] }] })).toThrow();
});

test('a reprinted read sentence cannot hide an unread companion in the same canonical passage', async () => {
  const events: FlowEvent[] = [], signal = new AbortController().signal;
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  await runFlow({ op: 'open', seed: '本末', requestId: 'reprint-root' }, 'owner', signal, e => events.push(e));
  const root = (events.at(-1) as { chain: FlowChain }).chain;
  const reprint = { ...source('reprint', rows[0]!.text + rows[1]!.text), source: '礼记' };
  jest.mocked(candidatesFor).mockResolvedValue([reprint]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('reprint', rows[0]!.text), { ...item('reprint', rows[1]!.text), anchors: [] }] });
  await runFlow({ op: 'next', chainId: root.chainId, cursor: root.cursor!, requestId: 'reprint-next' }, 'owner', signal, e => events.push(e));
  const input = jest.mocked(flowJson).mock.calls.at(-1)![1] as { candidates: Array<{ text: string }> };
  expect(input.candidates[0]!.text).toBe(rows[1]!.text);
  expect((events.at(-1) as { chain: FlowChain }).chain.frames[0]!.quote).toBe(rows[1]!.text);
  expect(flowJson).toHaveBeenCalledTimes(2); expect(reviewRelations).toHaveBeenCalledTimes(2);
});

test.each(['知止而后有定 定而后能静', '知止而后有定', '知止而后有定，定而后能静。此谓知本。'])
('rejects a repeated quotation across sources without consuming the continuation cursor: %s', async duplicate => {
  const signal = new AbortController().signal, events: FlowEvent[] = [];
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  await runFlow({ op: 'open', requestId: 'root', seed: '本末' }, 'owner', signal, event => events.push(event));
  const root = (events.at(-1) as { chain: FlowChain }).chain;
  const alias = { ...source('alias', `他章重收：${duplicate}`), source: '礼记' };
  jest.mocked(candidatesFor).mockResolvedValue([alias, rows[1]!]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('alias', duplicate)] });
  const next = { op: 'next' as const, requestId: 'next', chainId: root.chainId, cursor: root.cursor! };
  const reviews = jest.mocked(reviewRelations).mock.calls.length;
  await expect(runFlow(next, 'owner', signal, event => events.push(event))).rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
  expect(reviewRelations).toHaveBeenCalledTimes(reviews);
  expect((events.at(-1) as { chain: FlowChain }).chain.cursor).toBe(root.cursor);
  expect(jest.mocked(flowJson).mock.calls.at(-1)![1]).toHaveProperty('avoidQuotes', [rows[0]!.text]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await runFlow(next, 'owner', signal, event => events.push(event));
  expect((events.at(-1) as { chain: FlowChain }).chain.frames[0]!.quote).toBe(rows[1]!.text);
  expect(flowJson).toHaveBeenCalledTimes(3);
});

test.each([
  ['缗蛮黄鸟，止于丘隅。', '绵蛮黄鸟，止于丘隅。'],
  ['绵蛮黄鸟，止于丘隅。', '缗蛮黄鸟，止于丘隅。'],
])('rejects the attested quoted spelling %s → %s without advancing', async (original, duplicate) => {
  const signal = new AbortController().signal, events: FlowEvent[] = [];
  const available = [source('first-edition', original), { ...source('other-edition', duplicate), source: '诗经' }, ...rows];
  jest.mocked(flowCorpus).mockResolvedValue(available);
  jest.mocked(candidatesFor).mockResolvedValue(available);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('first-edition', original)] });
  await runFlow({ op: 'open', requestId: 'spelling-root', seed: '安止' }, 'owner', signal, event => events.push(event));
  const root = (events.at(-1) as { chain: FlowChain }).chain;
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('other-edition', duplicate)] });
  const next = { op: 'next' as const, requestId: 'spelling-next', chainId: root.chainId, cursor: root.cursor! };
  const reviews = jest.mocked(reviewRelations).mock.calls.length;
  await expect(runFlow(next, 'owner', signal, event => events.push(event))).rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
  expect(reviewRelations).toHaveBeenCalledTimes(reviews);
  expect(flowJson).toHaveBeenCalledTimes(2);
  expect((events.at(-1) as { chain: FlowChain }).chain.cursor).toBe(root.cursor);
  expect(jest.mocked(flowJson).mock.calls.at(-1)![1]).toHaveProperty('avoidQuotes', [original, duplicate]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await runFlow(next, 'owner', signal, event => events.push(event));
  expect((events.at(-1) as { chain: FlowChain }).chain.frames[0]!.quote).toBe(rows[1]!.text);
});

test('removes an equivalent-spelling prepared entry while retaining a different stanza', () => {
  const quote = '缗蛮黄鸟，止于丘隅。', alias = '绵蛮黄鸟，止于丘隅。', different = '绵蛮黄鸟，止于丘阿。';
  const available = [source('quoted', quote), source('alias', alias), source('different', different)];
  const entry = (id: string, text: string) => ({ ...item('quoted', quote).anchors[0]!, surface: 'quote' as const, label: '黄鸟', target: { sourceId: id, quote: text, meaning: '黄鸟栖止。' } });
  const frame = verifyGenerated({ frames: [{ ...item('quoted', quote), anchors: [entry('alias', alias), entry('different', different)] }] }, available, 1)[0]!;
  expect(frame.quote).toBe(quote);
  expect(frame.anchors).toHaveLength(1);
  expect(frame.anchors[0]!.target.quote).toBe(different);
  const other = verifyGenerated({ frames: [item('different', different)] }, available, 1)[0]!;
  expect(other.quote).toBe(different);
});

test('continues to a different stanza rather than using fuzzy quotation similarity', async () => {
  const original = '缗蛮黄鸟，止于丘隅。', different = '绵蛮黄鸟，止于丘阿。';
  const available = [source('quoted', original), source('stanza', different), ...rows];
  jest.mocked(flowCorpus).mockResolvedValue(available); jest.mocked(candidatesFor).mockResolvedValue(available);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('quoted', original)] });
  const events: FlowEvent[] = [], signal = new AbortController().signal;
  await runFlow({ op: 'open', requestId: 'stanza-root', seed: '安止' }, 'owner', signal, event => events.push(event));
  const root = (events.at(-1) as { chain: FlowChain }).chain;
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('stanza', different)] });
  await runFlow({ op: 'next', requestId: 'different-stanza', chainId: root.chainId, cursor: root.cursor! }, 'owner', signal, event => events.push(event));
  expect((events.at(-1) as { chain: FlowChain }).chain.frames[0]!.quote).toBe(different);
});

test.each([false, true])('inherits read quotations across branches and continuation (legacy=%s)', async legacy => {
  let sequence = 0;
  const store = createSessionStore(new MemoryDocumentBackend(), { createId: () => `lease-${sequence++}` });
  const getChain = store.getChain;
  if (legacy) jest.spyOn(store, 'getChain').mockImplementation(async (...args) => {
    const saved = await getChain(...args); delete saved.priorQuotes; return saved;
  });
  const signal = new AbortController().signal, events: FlowEvent[] = [];
  const emit = (event: FlowEvent) => events.push(event);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  await runFlow({ op: 'open', requestId: 'ancestry-root', seed: '安止' }, 'owner', signal, emit, store);
  const root = (events.at(-1) as { chain: FlowChain }).chain, original = root.frames[0]!;
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await runFlow({ op: 'next', requestId: 'ancestry-next', chainId: root.chainId, cursor: root.cursor! }, 'owner', signal, emit, store);
  const plan = { sense: '安止', direction: '辨明先后', terms: ['知所先后', '物有本末'] };
  jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({ frames: [item('s3', rows[2]!.text)] });
  await runFlow({ op: 'branch', requestId: 'ancestry-child', chainId: root.chainId, fromFrameId: original.id,
    selection: { start: 1, end: 2, textHash: original.textHash, corpusVersion: original.corpusVersion } }, 'owner', signal, emit, store);
  const child = (events.at(-1) as { chain: FlowChain }).chain, childFrame = child.frames[0]!;
  expect(childFrame.anchors).toHaveLength(0); // Its old target is already in the parent reading.
  expect((await getChain('owner', child.chainId)).priorQuotes).toEqual([rows[0]!.text, rows[1]!.text]);
  jest.mocked(candidatesFor).mockResolvedValue([...rows, source('unread', '敬以直内，义以方外。')]);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await expect(runFlow({ op: 'next', requestId: 'ancestry-child-next', chainId: child.chainId, cursor: child.cursor! }, 'owner', signal, emit, store))
    .rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
  expect(jest.mocked(flowJson).mock.calls.at(-1)![1]).toHaveProperty('avoidQuotes', expect.arrayContaining([rows[0]!.text, rows[1]!.text, rows[2]!.text]));
  jest.mocked(flowJson).mockResolvedValueOnce(plan).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await expect(runFlow({ op: 'branch', requestId: 'ancestry-grandchild', chainId: child.chainId, fromFrameId: childFrame.id,
    selection: { start: 0, end: 1, textHash: childFrame.textHash, corpusVersion: childFrame.corpusVersion } }, 'owner', signal, emit, store))
    .rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
  expect(jest.mocked(flowJson).mock.calls.at(-1)![1]).toHaveProperty('avoidQuotes', expect.arrayContaining([rows[0]!.text, rows[1]!.text, rows[2]!.text]));
});

test('an old prepared entry to an already-read quote generates along its direction without a repeated head', async () => {
  const signal = new AbortController().signal, events: FlowEvent[] = [];
  const emit = (event: FlowEvent) => events.push(event);
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  await runFlow({ op: 'open', requestId: 'prepared-root', seed: '本末' }, 'owner', signal, emit);
  const root = (events.at(-1) as { chain: FlowChain }).chain, original = root.frames[0]!;
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await runFlow({ op: 'next', requestId: 'prepared-next', chainId: root.chainId, cursor: root.cursor! }, 'owner', signal, emit);
  const start = events.length, reserveModels = jest.fn(async (_count: number) => {});
  const request = { op: 'branch' as const, requestId: 'prepared-child', chainId: root.chainId, fromFrameId: original.id, anchorId: original.anchors[0]!.id };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s3', rows[2]!.text)] });
  await withFlowModelBudget({ reserveModels, chargeModel: jest.fn() }, () => runFlow(request, 'owner', signal, emit));
  expect(reserveModels).toHaveBeenCalledWith(2);
  expect(events.slice(start).map(event => event.type)).toEqual(['frame', 'done']);
  expect((events.at(-1) as { chain: FlowChain }).chain.frames[0]!.quote).toBe(rows[2]!.text);
  expect(flowJson).toHaveBeenCalledTimes(3);
  await runFlow(request, 'owner', signal, emit);
  expect(flowJson).toHaveBeenCalledTimes(3);
});

test('insufficient preflight budget stops before planning, model calls or head emission', async () => {
  const reserveModels = jest.fn(async (_count: number) => { throw new FlowError('BUDGET_REACHED', '额度不足', 429); });
  const emit = jest.fn();
  await expect(withFlowModelBudget({ reserveModels, chargeModel: jest.fn() }, () =>
    runFlow({ op: 'open', requestId: 'preflight', seed: '关系冲突' }, 'owner', new AbortController().signal, emit)))
    .rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  expect(reserveModels).toHaveBeenCalledWith(3);
  expect(planFocus).not.toHaveBeenCalled(); expect(flowJson).not.toHaveBeenCalled(); expect(emit).not.toHaveBeenCalled();
});

test('seed planning reserves three, anchored branches reserve two, completed replays reserve nothing', async () => {
  const reserveModels = jest.fn(async (_count: number) => {}), budget = { reserveModels, chargeModel: jest.fn() };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  const events: FlowEvent[] = [], signal = new AbortController().signal;
  await withFlowModelBudget(budget, () => runFlow({ op: 'open', requestId: 'budget-parent', seed: '本末' }, 'owner', signal, event => events.push(event)));
  expect(reserveModels).toHaveBeenLastCalledWith(3);
  const root = (events.at(-1) as { chain: FlowChain }).chain, node = root.frames[0]!;
  const branch = { op: 'branch' as const, requestId: 'budget-child', chainId: root.chainId, fromFrameId: node.id, anchorId: node.anchors[0]!.id };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await withFlowModelBudget(budget, () => runFlow(branch, 'owner', signal, event => events.push(event)));
  expect(reserveModels).toHaveBeenLastCalledWith(2);
  reserveModels.mockClear(); reserveModels.mockRejectedValue(new FlowError('BUDGET_REACHED', '额度不足', 429));
  await withFlowModelBudget(budget, () => runFlow(branch, 'owner', signal, event => events.push(event)));
  expect(reserveModels).not.toHaveBeenCalled(); expect(flowJson).toHaveBeenCalledTimes(2);
  expect(events.at(-1)!.type).toBe('done');
});

test('format repair cannot silently use the call reserved for review', async () => {
  const reserveModels = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new FlowError('BUDGET_REACHED', '额度不足', 429));
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ quote: 'invalid' }] });
  await expect(withFlowModelBudget({ reserveModels, chargeModel: jest.fn() }, () =>
    runFlow({ op: 'open', requestId: 'repair-budget', seed: '本末' }, 'owner', new AbortController().signal, () => {})))
    .rejects.toMatchObject({ code: 'MODEL_INVALID' });
  expect(reserveModels.mock.calls.map(call => call[0])).toEqual([3, 1]);
  expect(flowJson).toHaveBeenCalledTimes(1);
});

test('a five-call allowance completes a three-call seed and two-call branch, then replays at zero remaining', async () => {
  const backend = new MemoryDocumentBackend();
  const budget = createFlowBudget(backend, 'service-budget', { concurrentSite: 2, concurrentOwner: 1, concurrentIP: 2,
    requestsSite: 20, requestsOwner: 20, requestsIP: 20, modelsSite: 5, modelsOwner: 5, modelsIP: 5 });
  const events: FlowEvent[] = [], signal = new AbortController().signal;
  const execute = async (request: Parameters<typeof runFlow>[0]) => {
    const lease = await budget.acquire('owner', 'ip');
    try { await withFlowModelBudget(lease, () => runFlow(request, 'owner', signal, event => events.push(event))); }
    finally { await lease.release(); }
  };
  jest.mocked(planFocus).mockImplementationOnce(async () => { await chargeFlowModel(); return { focus: '本末', terms: ['本末', '知止'], supported: true }; });
  jest.mocked(flowJson).mockImplementationOnce(async () => { await chargeFlowModel(); return { frames: [item('s1', rows[0]!.text)] }; });
  jest.mocked(reviewRelations).mockImplementationOnce(async frames => { await chargeFlowModel(); return frames; });
  await execute({ op: 'open', requestId: 'five-parent', seed: '本末' });
  const root = (events.at(-1) as { chain: FlowChain }).chain, node = root.frames[0]!;
  const branch = { op: 'branch' as const, requestId: 'five-child', chainId: root.chainId, fromFrameId: node.id, anchorId: node.anchors[0]!.id };
  jest.mocked(flowJson).mockImplementationOnce(async () => { await chargeFlowModel(); return { frames: [item('s2', rows[1]!.text)] }; });
  jest.mocked(reviewRelations).mockImplementationOnce(async frames => { await chargeFlowModel(); return frames; });
  await execute(branch);
  const child = (events.at(-1) as { chain: FlowChain }).chain;
  await execute(branch);
  expect((events.at(-1) as { chain: FlowChain }).chain.chainId).toBe(child.chainId);
  await expect(execute({ op: 'open', requestId: 'over-budget', seed: '新的心事' })).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  const document = JSON.parse((await backend.read('service-budget')).value!);
  expect(document.counters['owner:owner'].models).toBe(5);
  expect(document.active).toEqual({}); expect(flowJson).toHaveBeenCalledTimes(2);
});

test('restartFrom verifies canonical source and can reopen a selected word for a different visitor without old chain access', async () => {
  const restartFrom = { sourceId: 's1', corpusVersion: 'test-v1', textHash: 's1', quoteStart: 0, quoteEnd: 6 };
  const selection = { start: 1, end: 2, textHash: 's1', corpusVersion: 'test-v1' };
  expect(flowRequestSchema.safeParse({ op: 'open', requestId: 'invalid', selection }).success).toBe(false);
  expect(flowRequestSchema.safeParse({ op: 'open', requestId: 'invalid', restartFrom, chainId: 'old' }).success).toBe(false);
  jest.mocked(flowJson).mockResolvedValueOnce({ sense: '此处安止的方向', direction: '从安止继续看事物先后', terms: ['物有本末', '知所先后'] })
    .mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  const events: FlowEvent[] = [];
  await runFlow({ op: 'open', requestId: 'restart-word', restartFrom, selection }, 'fresh-visitor', new AbortController().signal,
    event => events.push(event));
  const chain = (events.at(-1) as { chain: FlowChain }).chain;
  expect(chain.parentChainId).toBeNull(); expect(chain.focus).toContain('「止」');
  expect(jest.mocked(flowJson).mock.calls[0]![1]).toMatchObject({ word: '止', before: '知' });
  expect(jest.mocked(flowJson).mock.calls[1]![1]).toHaveProperty('avoidQuote', '知止而后有定');
  await expect(runFlow({ op: 'open', requestId: 'wrong-version', restartFrom: { ...restartFrom, textHash: 'changed' } },
    'fresh-visitor', new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'CORPUS_CHANGED' });
  expect(flowJson).toHaveBeenCalledTimes(2);
});

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

test('a rejected primary can use a separately reviewed companion without another generation', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text), { ...item('s2', rows[1]!.text), anchors: [] }] });
  jest.mocked(reviewRelations).mockImplementationOnce(async frames => frames.slice(1));
  const events: FlowEvent[] = [], reserveModels = jest.fn(async (_count: number) => {});
  await withFlowModelBudget({ reserveModels, chargeModel: jest.fn() }, () => runFlow({ op: 'open', seed: '本末', requestId: 'backup' },
    'owner', new AbortController().signal, event => events.push(event)));
  const result = (events.at(-1) as { chain: FlowChain }).chain;
  expect(result.frames).toHaveLength(1); expect(result.frames[0]).toMatchObject({ sourceId: 's2', ordinal: 1 });
  expect(flowJson).toHaveBeenCalledTimes(1); expect(reviewRelations).toHaveBeenCalledTimes(1);
  expect(reserveModels).toHaveBeenCalledWith(3);
});

test('rejecting both alternatives never displays either as a verified continuation', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text), item('s2', rows[1]!.text)] });
  jest.mocked(reviewRelations).mockResolvedValueOnce([]);
  const emit = jest.fn();
  await expect(runFlow({ op: 'open', seed: '本末', requestId: 'both-rejected' }, 'owner', new AbortController().signal, emit))
    .rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
  expect(emit).not.toHaveBeenCalled(); expect(flowJson).toHaveBeenCalledTimes(1);
});

test('background next reserves foreground headroom and foreground replay uses no model hold', async () => {
  const signal = new AbortController().signal, events: FlowEvent[] = [];
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s1', rows[0]!.text)] });
  await runFlow({ op: 'open', seed: '本末', requestId: 'prepare-root' }, 'owner', signal, event => events.push(event));
  const root = (events.at(-1) as { chain: FlowChain }).chain;
  const reserveModels = jest.fn(async (_count: number) => {}), budget = { reserveModels, chargeModel: jest.fn() };
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  const next = { op: 'next' as const, chainId: root.chainId, cursor: root.cursor!, requestId: 'prepare-next', prefetch: true as const };
  await withFlowModelBudget(budget, () => runFlow(next, 'owner', signal, event => events.push(event)));
  expect(reserveModels).toHaveBeenCalledWith(2, 3);
  const prepared = (events.at(-1) as { chain: FlowChain }).chain;
  reserveModels.mockClear();
  await withFlowModelBudget(budget, () => runFlow({ ...next, requestId: 'human-next', prefetch: undefined } as any, 'owner', signal, event => events.push(event)));
  expect(reserveModels).not.toHaveBeenCalled(); expect(flowJson).toHaveBeenCalledTimes(2);
  expect((events.at(-1) as { chain: FlowChain }).chain).toEqual(prepared);
  expect(flowRequestSchema.safeParse({ op: 'open', requestId: 'wrong-prepare', prefetch: true }).success).toBe(false);
});

test('a new explanation word carries its current context through generation and independent review', async () => {
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [{ ...item('s1', rows[0]!.text), reflection: '从交友理解仁。', anchors: [] }] });
  const events: FlowEvent[] = [], signal = new AbortController().signal;
  await runFlow({ op: 'open', seed: '旧的心事', requestId: 'context-root' }, 'owner', signal, event => events.push(event));
  const root = (events.at(-1) as { chain: FlowChain }).chain, frame = root.frames[0]!;
  jest.mocked(flowJson).mockResolvedValueOnce({ sense: '朋友交往', direction: '朋友如何相互成就', terms: ['以友辅仁', '以文会友'] });
  jest.mocked(flowJson).mockResolvedValueOnce({ frames: [item('s2', rows[1]!.text)] });
  await runFlow({ op: 'branch', requestId: 'context-branch', chainId: root.chainId, fromFrameId: frame.id,
    selection: { start: 1, end: 3, textHash: frame.textHash, corpusVersion: frame.corpusVersion, surface: 'reflection', surfaceText: frame.reflection } },
    'owner', signal, event => events.push(event));
  const input = jest.mocked(flowJson).mock.calls.at(-1)![1] as { readingContext: unknown };
  expect(input.readingContext).toMatchObject({ word: '交友', surface: 'reflection', quote: frame.quote });
  expect(jest.mocked(reviewRelations).mock.calls.at(-1)![5]).toEqual(input.readingContext);
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
    await runFlow({ ...request, requestId: `word-occurrence-${start}`, selection: { ...selection, start, end: start + 1 } }, 'owner', new AbortController().signal, emit);
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
    .rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
  expect(jest.mocked(flowJson).mock.calls[2]![1]).toHaveProperty('avoidQuote', frame.quote);
});

test('invalid word-planning output produces a readable retry message instead of leaking schema diagnostics', async () => {
  const frame = verifyGenerated({ frames: [item('s1', rows[0]!.text)] }, rows, 1)[0]!;
  jest.mocked(flowJson).mockResolvedValueOnce({ sense: '安止', direction: '长'.repeat(121), terms: ['物有本末', '知所先后'] });
  await expect(planLexeme(frame, { start: 1, end: 2, textHash: frame.textHash, corpusVersion: frame.corpusVersion }, '方向', new AbortController().signal))
    .rejects.toMatchObject({ code: 'LEXEME_UNRESOLVED', message: '这个字词的联系还未理清，可以留在原句或重试。' });
});
