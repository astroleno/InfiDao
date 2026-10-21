/** @jest-environment node */
const { createFlowController, mergeChain } = require('../../shared/flow/controller');
import { withPreparedContinuation } from '@/lib/flow-browser/prepared-provider';

function deferred<T = any>() {
  let resolve!: (value: T) => void, reject!: (error: any) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const batch = (id: string, ready = true, ordinal = 1) => ({ chainId: id, kind: 'remote', seed: '', cursor: 'next', exhausted: false,
  frames: [{ id: `${id}:${ordinal}`, ordinal, ready, sourceId: 'source', quote: '知止', textHash: 'hash',
    anchors: [{ id: 'word', label: '知止' }] }] });
const snapshot = { position: 20, rowOffset: 3, ambientPhase: 9, paused: true, sourceOpen: true, readingPositions: { source: 99 }, ribbon: {} };
function fixture(overrides: any = {}) {
  let sequence = 0;
  const records = new Map<string, any>(), requests: any[] = [];
  const request = jest.fn((input, hooks) => {
    const d = deferred();
    const task = Object.assign(d.promise, { cancel: jest.fn(() => d.reject(Object.assign(new Error('cancelled'), { cancelled: true }))) });
    requests.push({ ...d, task, input, event: (type: string, chain: any) => hooks.onEvent({ type, chain, requestId: hooks.requestId }) });
    return task;
  });
  const provider = { open: request, branch: request, next: request, resume: request, restore: jest.fn() };
  const storage = {
    put: jest.fn(async (record) => { records.set(record.pathId, structuredClone(record)); return { persisted: true }; }),
    get: jest.fn(async (id) => structuredClone(records.get(id))),
    commitBranch: jest.fn(async (parent, child) => { records.set(parent.pathId, structuredClone(parent)); records.set(child.pathId, structuredClone(child)); return { persisted: true }; }),
    child: jest.fn(async (): Promise<any> => null), latest: jest.fn(async (): Promise<any> => null), activate: jest.fn(async () => ({ persisted: true })),
  };
  const host = { defaultProvider: provider, providerFor: () => provider, storage,
    createId: () => `id-${++sequence}`, prepare: async (value: any) => value,
    initialSnapshot: () => snapshot, capture: () => snapshot, present: jest.fn(), update: jest.fn(), history: jest.fn(), state: jest.fn(), ...overrides };
  return { controller: createFlowController(host), host, provider, storage, records, requests };
}

describe('shared reading controller', () => {
  test('a visible ancestor word branches directly from its owner without an intermediate presentation', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush();
    f.requests[0].resolve(batch('root')); await opening;
    const root = f.controller.getState().record;
    const child = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].resolve(batch('child')); await child;
    f.host.present.mockClear();
    const branch = f.controller.branch({ pathId: root.pathId, frameId: 'root:1', anchorId: 'word' }); await flush();
    expect(f.requests[2].input.chainId).toBe('root');
    expect(f.controller.getState().record.chain.chainId).toBe('child');
    expect(f.host.present).not.toHaveBeenCalled();
    f.requests[2].resolve(batch('new-direction')); await branch;
    expect(f.controller.getState().record.parentPathId).toBe(root.pathId);
    expect(f.host.present).toHaveBeenCalledTimes(1);
  });

  test('rapid ancestor selections are versioned before asynchronous history loads', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush();
    const rootBatch = batch('root'); rootBatch.frames[0]!.anchors.push({ id: 'other', label: '止' });
    f.requests[0].resolve(rootBatch); await opening;
    const root = f.controller.getState().record;
    const child = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].resolve(batch('child')); await child;
    const loading = deferred();
    f.storage.get.mockImplementationOnce(() => loading.promise);
    const first = f.controller.branch({ pathId: root.pathId, frameId: 'root:1', anchorId: 'word' }); await flush();
    const last = f.controller.branch({ pathId: root.pathId, frameId: 'root:1', anchorId: 'other' }); await flush();
    loading.resolve(root); await flush();
    expect(f.requests).toHaveLength(3);
    expect(f.requests[2].input.anchorId).toBe('other');
    f.requests[2].resolve(batch('latest')); await Promise.all([first, last]);
    expect(f.controller.getState().record.chain.chainId).toBe('latest');
  });

  test('an expired ancestor reconnects from its own canonical quotation and keeps its parent', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush();
    f.requests[0].resolve(batch('root')); await opening;
    const root = f.controller.getState().record;
    const child = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].resolve(batch('child')); await child;
    const next = f.controller.branch({ pathId: root.pathId, frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[2].reject(Object.assign(new Error('expired'), { code: 'CHAIN_EXPIRED' })); await flush();
    expect(f.requests[3].input.restartFrom.sourceId).toBe('source');
    f.requests[3].resolve(batch('reconnected')); await next;
    expect(f.controller.getState().record.parentPathId).toBe(root.pathId);
  });

  test('a faster second word supersedes an in-flight branch, deduplicates repeats and ignores late results', async () => {
    const f = fixture(), open = f.controller.open('');
    await flush();
    const root = batch('root');
    root.frames[0]!.anchors.push({ id: 'another', label: '止' });
    f.requests[0].resolve(root); await open;
    const a = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    expect(f.controller.getState().busy).toBe(true);
    const b = f.controller.branch({ frameId: 'root:1', anchorId: 'another' }); await flush();
    await f.controller.branch({ frameId: 'root:1', anchorId: 'another' });
    expect(f.requests).toHaveLength(3);
    expect(f.requests[1].task.cancel).toHaveBeenCalledTimes(1);
    f.requests[1].event('head', batch('stale')); await flush();
    expect(f.controller.getState().record.chain.chainId).toBe('root');
    f.requests[2].resolve(batch('latest')); await Promise.all([a, b]);
    expect(f.controller.getState().record.chain.chainId).toBe('latest');
    expect(f.host.history).toHaveBeenCalledTimes(2);
  });

  test('an accepted meaning can branch before the whole node completes', async () => {
    const f = fixture(), open = f.controller.open(''); await flush();
    const head: any = batch('live', false);
    Object.assign(head.frames[0], { corpusVersion: 'v1', meaning: '', reflection: '', settled: { meaning: false, reflection: false } });
    f.requests[0].event('head', head); await flush();
    const paragraph = structuredClone(head);
    Object.assign(paragraph.frames[0], { meaning: '方向。', textBreaks: { meaning: [2, 3], reflection: [] },
      settled: { meaning: true, reflection: false } });
    f.requests[0].event('progress', paragraph); await flush();
    expect(f.controller.getState()).toMatchObject({ pending: true, record: { chain: { frames: [{ meaning: '方向。' }] } } });
    const branch = f.controller.branch({ frameId: 'live:1', selection: {
      surface: 'meaning', surfaceText: '方向。', start: 0, end: 2, textHash: 'hash', corpusVersion: 'v1',
    } }); await flush();
    expect(f.requests[1].input.selection.surfaceText).toBe('方向。');
    f.requests[1].resolve(batch('child')); await Promise.all([open, branch]);
    expect(f.controller.getState().record.chain.chainId).toBe('child');
    expect(() => mergeChain(paragraph, { ...paragraph, frames: [{ ...paragraph.frames[0], meaning: '偷偷改写。' }] }))
      .toThrow('已读的段落');
  });
  test('controller preparation leaves the path unchanged and next consumes that exact request', async () => {
    const f = fixture(), prepared = withPreparedContinuation(f.provider as any);
    (f.host as any).defaultProvider = prepared;
    (f.host as any).providerFor = () => prepared;
    const open = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await open;
    const before = structuredClone(f.controller.getState());
    f.controller.prepareNext();
    expect(f.controller.getState()).toEqual(before); expect(f.requests).toHaveLength(2);
    f.requests[1].resolve(batch('root', true, 2)); await flush();
    await f.controller.next();
    expect(f.requests).toHaveLength(2);
    expect(f.controller.getState().record.chain.frames).toHaveLength(2);
    expect(f.requests[1].task.cancel).not.toHaveBeenCalled();
  });
  test('visibility cancellation suspends a preparation; explicit cancellation and dispose release it', async () => {
    const f = fixture();
    const suspendPreparation = jest.fn(), cancelPreparation = jest.fn();
    Object.assign(f.provider, { suspendPreparation, cancelPreparation });
    const open = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await open;
    cancelPreparation.mockClear();
    f.controller.setVisible(false); expect(suspendPreparation).toHaveBeenCalledTimes(1); expect(cancelPreparation).not.toHaveBeenCalled();
    f.controller.setVisible(true); f.controller.cancel(); expect(cancelPreparation).toHaveBeenCalledTimes(1);
    f.controller.dispose(); expect(cancelPreparation).toHaveBeenCalledTimes(2);
  });
  test('a provider with no online replacement retains its actionable connection error', async () => {
    const f = fixture(), open = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await open;
    const parent = f.controller.getState().record;
    const branch = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].reject(Object.assign(new Error('连接服务后继续。'), { code: 'CONNECTION_REQUIRED' })); await branch;
    expect(f.requests).toHaveLength(2); expect(f.controller.getState().record.pathId).toBe(parent.pathId);
    expect(f.controller.getState().error.code).toBe('CONNECTION_REQUIRED');
  });
  test('a curated word can still reconnect through a different online default provider', async () => {
    const f = fixture(), open = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await open;
    const local = { branch: jest.fn(async () => { throw Object.assign(new Error('connect'), { code: 'CONNECTION_REQUIRED' }); }) };
    (f.host as any).providerFor = () => local;
    const branch = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush(); await flush();
    expect(local.branch).toHaveBeenCalledTimes(1); expect(f.requests).toHaveLength(2);
    f.requests[1].resolve(batch('online')); await branch;
    expect(f.controller.getState().record.chain.chainId).toBe('online');
  });
  test('an explicitly selected expired word reopens once without an error flash and replays its saved edge', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush();
    f.requests[0].resolve(batch('root')); await opening;
    const parent = f.controller.getState().record;
    const branching = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].reject(Object.assign(new Error('expired'), { code: 'CHAIN_EXPIRED' })); await flush();
    expect(f.requests).toHaveLength(3);
    expect(f.requests[2].input.restartFrom).toMatchObject({ sourceId: 'source', textHash: 'hash' });
    expect(f.host.state.mock.calls.every((call: any[]) => !call[0].error)).toBe(true);
    f.requests[2].resolve({ ...batch('reopened'), parentChainId: null, entry: null }); await branching;
    const child = f.controller.getState().record;
    expect(child).toMatchObject({ parentPathId: parent.pathId, parentEntry: { fromFrameId: 'root:1', anchorId: 'word', label: '知止' } });
    await f.controller.restore(parent.pathId);
    f.storage.child.mockResolvedValueOnce(child);
    await f.controller.branch({ frameId: 'root:1', anchorId: 'word' });
    expect(f.requests).toHaveLength(3);
    expect(f.controller.getState().record.pathId).toBe(child.pathId);
  });

  test('an expired continuation reopens from the last read passage with a replayable local edge', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await opening;
    const parent = f.controller.getState().record;
    const next = f.controller.next(); await flush();
    f.requests[1].reject(Object.assign(new Error('expired'), { code: 'CHAIN_EXPIRED' })); await flush();
    f.requests[2].resolve(batch('reopened')); await next;
    expect(f.controller.getState().record).toMatchObject({ parentPathId: parent.pathId,
      parentEntry: { fromFrameId: 'root:1', anchorId: 'next:next', label: '沿此意继续' } });
    expect(f.records.get(parent.pathId).chain.chainId).toBe('root');
  });

  test.each(['BUDGET_REACHED', 'CORPUS_CHANGED'])('does not automatically retry %s', async code => {
    const f = fixture(), opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await opening;
    const branching = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].reject(Object.assign(new Error(code), { code })); await branching;
    expect(f.requests).toHaveLength(2); expect(f.controller.getState().error.code).toBe(code);
  });

  test('a failed automatic reopen never loops, and cancellation blocks late expired errors', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await opening;
    const branching = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].reject(Object.assign(new Error('expired'), { code: 'CHAIN_EXPIRED' })); await flush();
    f.requests[2].reject(Object.assign(new Error('expired'), { code: 'CHAIN_EXPIRED' })); await branching;
    expect(f.requests).toHaveLength(3); expect(f.controller.getState().error.code).toBe('CHAIN_EXPIRED');
    const another = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.controller.cancel(); f.requests[3].reject(Object.assign(new Error('expired'), { code: 'CHAIN_EXPIRED' })); await another;
    expect(f.requests).toHaveLength(4); expect(f.controller.getState().error).toBeNull();
  });

  test('library restore never resumes an incomplete chain on open or visibility changes', async () => {
    const f = fixture();
    f.records.set('saved', { pathId: 'saved', chain: batch('old', false), snapshot, completion: 'pending' });
    await f.controller.restore('saved', { navigation: 'push', resumeIncomplete: false });
    expect(f.requests).toHaveLength(0);
    expect(f.controller.getState()).toMatchObject({ record: { completion: 'stopped' }, error: { code: 'INCOMPLETE' } });
    expect(f.records.get('saved').completion).toBe('stopped');
    f.controller.setVisible(false); f.controller.setVisible(true); await flush();
    expect(f.requests).toHaveLength(0);
    const retrying = f.controller.retry(); await flush(); expect(f.requests).toHaveLength(1);
    f.requests[0].resolve(batch('old')); await retrying;
  });
  test('a fresh visit opens a new chain without trying to restore an absent one', async () => {
    const f = fixture(), starting = f.controller.start(); await flush();
    expect(f.requests[0].input).toBe('');
    f.requests[0].resolve(batch('fresh')); await starting;
    expect(f.storage.get).not.toHaveBeenCalled();
    expect(f.controller.getState().error).toBeNull();
  });

  test('an unavailable restored head is retained and is not resumed on visibility or reload', async () => {
    const f = fixture();
    f.records.set('saved', { pathId: 'saved', chain: batch('old', false), snapshot, completion: 'pending' });
    f.storage.latest.mockResolvedValue('saved');
    const starting = f.controller.start(); await flush();
    f.requests[0].reject(Object.assign(new Error('当前经文暂时无法在线接续，原文仍可阅读。'), { code: 'CHAIN_EXPIRED' }));
    await starting;
    expect(f.controller.getState()).toMatchObject({ record: { pathId: 'saved', completion: 'failed' }, error: { code: 'CHAIN_EXPIRED' } });
    expect(f.records.get('saved').chain.frames[0].quote).toBe('知止');
    f.controller.setVisible(false); f.controller.setVisible(true); await flush();
    await f.controller.restore('saved');
    expect(f.requests).toHaveLength(1);
    expect(f.controller.getState().error.code).toBe('CHAIN_EXPIRED');
    // Restart remains an explicit action and preserves the old local path.
    const restart = f.controller.restart({ frameId: 'old:1' }); await flush();
    expect(f.requests[1].input.restartFrom).toMatchObject({ sourceId: 'source', textHash: 'hash' });
    f.requests[1].resolve(batch('new')); await restart;
    expect(f.controller.getState().record.parentPathId).toBe('saved');
    expect(f.records.get('saved').chain.chainId).toBe('old');
  });

  test('offers the latest parent mode to a new branch without copying its reading position', async () => {
    const fresh = { ...snapshot, paused: false, position: 0, rowOffset: 0, sourceOpen: false, readingPositions: {}, ribbon: null };
    const initialSnapshot = jest.fn((_chain, context) => ({ ...fresh, paused: !!context.parentSnapshot?.paused }));
    const f = fixture({ initialSnapshot });
    const opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await opening;
    expect(f.controller.getState().record.snapshot).toEqual(fresh);
    const branching = f.controller.branch({ frameId: 'root:1', anchorId: 'word' }); await flush();
    f.requests[1].resolve(batch('child')); await branching;
    expect(initialSnapshot.mock.calls[1]![1].parentSnapshot).toEqual(snapshot);
    expect(f.controller.getState().record.snapshot).toEqual({ ...fresh, paused: true });
  });
  test('ten branches restore each exact snapshot in reverse and forward order without generating again', async () => {
    const f = fixture(); const chainIds: string[] = [], pathIds: string[] = [];
    let opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('root')); await opening;
    chainIds.push('root'); pathIds.push(f.controller.getState().record.pathId);
    for (let index = 1; index <= 10; index++) {
      f.host.capture = () => ({ ...snapshot, position: index * 17, readingPositions: { source: index * 13 } });
      opening = f.controller.branch({ frameId: chainIds[index - 1] + ':1', anchorId: 'word' }); await flush();
      f.requests[index].resolve(batch('branch-' + index)); await opening;
      chainIds.push('branch-' + index); pathIds.push(f.controller.getState().record.pathId);
    }
    const checkpoints = pathIds.map(id => structuredClone(f.records.get(id).snapshot));
    for (const index of [...Array.from({ length: 10 }, (_, i) => 9 - i), ...Array.from({ length: 10 }, (_, i) => i + 1)]) {
      const currentId = f.controller.getState().record.pathId;
      f.host.capture = () => f.records.get(currentId).snapshot;
      await f.controller.restore(pathIds[index]);
      expect(f.controller.getState().record.chain.chainId).toBe(chainIds[index]);
      expect(f.controller.getState().record.snapshot).toEqual(checkpoints[index]);
    }
    expect(f.requests).toHaveLength(11);
  });
  test('commits a head once, merges completion without another history entry or resetting the snapshot', async () => {
    const f = fixture(), opening = f.controller.open('');
    await flush();
    f.requests[0].event('head', batch('a', false)); await flush();
    const head = f.controller.getState().record;
    expect(f.controller.getState()).toMatchObject({ busy: false, pending: true });
    expect(f.records.get(head.pathId).completion).toBe('pending');
    f.requests[0].event('frame', batch('a')); f.requests[0].resolve(batch('a')); await opening;
    expect(f.host.present).toHaveBeenCalledTimes(1);
    expect(f.host.history).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().record).toMatchObject({ pathId: head.pathId, snapshot, completion: 'complete' });
  });

  test('A head -> branch B -> return A resumes the same saved head; cancelled A cannot overwrite B', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush();
    f.requests[0].event('head', batch('a', false)); await flush();
    const a = f.controller.getState().record;
    const branching = f.controller.branch({ frameId: 'a:1', anchorId: 'word' }); await flush();
    expect(f.requests[0].task.cancel).toHaveBeenCalledTimes(1);
    f.requests[1].resolve(batch('b')); await branching; await opening;
    const b = f.controller.getState().record;
    expect(b.parentPathId).toBe(a.pathId);
    f.requests[0].event('frame', batch('a')); await flush();
    expect(f.controller.getState().record.pathId).toBe(b.pathId);
    const restoring = f.controller.restore(a.pathId); await flush();
    expect(f.requests[2].input).toEqual({ chainId: 'a' });
    f.requests[2].resolve(batch('a')); await restoring;
    expect(f.controller.getState().record).toMatchObject({ pathId: a.pathId, snapshot, completion: 'complete' });
    expect(f.host.history.mock.calls.map((call: any[]) => call[0])).toEqual([a.pathId, b.pathId, a.pathId]);
  });

  test('manual stop keeps its head and does not auto-resume on restore; retry resumes explicitly', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush();
    f.requests[0].event('head', batch('a', false)); await flush();
    f.controller.cancel(); await opening; await flush();
    const id = f.controller.getState().record.pathId;
    expect(f.records.get(id).completion).toBe('stopped');
    await f.controller.restore(id); expect(f.requests).toHaveLength(1);
    const retry = f.controller.retry(); await flush();
    expect(f.requests[1].input).toEqual({ chainId: 'a' });
    f.requests[1].resolve(batch('a')); await retry;
  });

  test('font preparation after cancellation cannot present a stale chain', async () => {
    const gate = deferred(), f = fixture({ prepare: async (value: any) => { if (value.chainId === 'a') await gate.promise; return value; } });
    const first = f.controller.open('first'); await flush();
    f.requests[0].event('head', batch('a', false)); await flush();
    const second = f.controller.open('second'); await flush();
    f.requests[1].resolve(batch('b')); await second;
    gate.resolve(null); await first;
    expect(f.host.present).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().record.chain.chainId).toBe('b');
  });

  test('failed branch transaction preserves the parent and its history', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('a')); await opening;
    const parent = f.controller.getState().record;
    f.storage.commitBranch.mockRejectedValueOnce(new Error('disk full'));
    const branch = f.controller.branch({ frameId: 'a:1', anchorId: 'word' }); await flush(); f.requests[1].resolve(batch('b')); await branch;
    expect(f.controller.getState().record.pathId).toBe(parent.pathId);
    expect(f.controller.getState().error.message).toBe('disk full');
    expect(f.host.history).toHaveBeenCalledTimes(1);
  });

  test('memory fallback remains navigable and reports persistence failure', async () => {
    const f = fixture(); f.storage.put.mockImplementation(async record => { f.records.set(record.pathId, structuredClone(record)); return { persisted: false }; });
    const opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('a')); await opening;
    expect(f.controller.getState()).toMatchObject({ storageWarning: true, record: { chain: { chainId: 'a' } } });
    await f.controller.restore(f.controller.getState().record.pathId);
    expect(f.host.present).toHaveBeenCalledTimes(2);
  });

  test('restores an already visited child without another provider request', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('a')); await opening;
    f.storage.child.mockResolvedValueOnce({ pathId: 'saved', chain: batch('b'), snapshot, parentPathId: f.controller.getState().record.pathId });
    await f.controller.branch({ frameId: 'a:1', anchorId: 'word' });
    expect(f.requests).toHaveLength(1);
    expect(f.controller.getState().record.pathId).toBe('saved');
  });

  test('uses curated fallback only before any remote record has been shown', async () => {
    const fallbackProvider = { open: jest.fn(async () => ({ ...batch('local'), kind: 'curated' })) };
    const f = fixture({ fallbackProvider }), opening = f.controller.open(''); await flush();
    f.requests[0].reject(new Error('offline')); await opening;
    expect(fallbackProvider.open).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().record.chain.chainId).toBe('local');
    const second = f.controller.open('thought'); await flush(); f.requests[1].reject(new Error('offline')); await second;
    expect(fallbackProvider.open).toHaveBeenCalledTimes(1);
  });

  test('does not downgrade complete frames or rewind a cursor with an old head', () => {
    const full = batch('a'); full.cursor = 'new';
    expect(mergeChain(full, batch('a', false))).toMatchObject({ cursor: 'new', frames: [{ ready: true }] });
    expect(() => mergeChain(full, { ...batch('a'), frames: [{ ...full.frames[0], quote: 'changed' }] })).toThrow('经句身份');
  });

  test('accepts an empty final continuation and stops requesting it again', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush(); f.requests[0].resolve(batch('a')); await opening;
    const next = f.controller.next(); await flush(); f.requests[1].resolve({ ...batch('a'), frames: [], cursor: null, exhausted: true }); await next;
    await f.controller.next(); expect(f.requests).toHaveLength(2);
    expect(f.controller.getState().record.chain.frames).toHaveLength(1);
  });

  test('a slow latest-path lookup cannot supersede a new user action', async () => {
    const f = fixture(), gate = deferred(); f.storage.latest.mockImplementation(() => gate.promise);
    const start = f.controller.start(); const opening = f.controller.open('new'); await flush();
    f.requests[0].resolve(batch('a')); await opening; gate.resolve('old'); await start;
    expect(f.storage.get).not.toHaveBeenCalled();
    expect(f.controller.getState().record.chain.chainId).toBe('a');
  });

  test('hiding cancels the request and showing resumes the pending head', async () => {
    const f = fixture(), opening = f.controller.open(''); await flush(); f.requests[0].event('head', batch('a', false)); await flush();
    f.controller.setVisible(false); await opening; f.controller.setVisible(true); await flush();
    expect(f.requests[1].input).toEqual({ chainId: 'a' });
    f.requests[1].resolve(batch('a')); await flush();
    expect(f.controller.getState().record.completion).toBe('complete');
  });
});
