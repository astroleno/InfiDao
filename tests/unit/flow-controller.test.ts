/** @jest-environment node */
const { createFlowController, mergeChain } = require('../../shared/flow/controller');

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
