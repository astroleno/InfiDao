/** @jest-environment node */
import { createSessionStore, MemoryDocumentBackend, SESSION_TTL_MS, type StoredChain } from '@/lib/flow/session-store';
import { SEMANTIC_LIMIT, SEMANTIC_TTL_MS, retainSemantics } from '@/lib/flow/semantic-index';
import { FLOW_PROMPT_VERSION, type FlowFrame } from '@/lib/flow/contracts';
const owner = 'reader-a';
const state = (id: string, generationKey = 'open:r'): StoredChain => ({ owner, terms: ['知止'], seen: [], nodes: {}, branches: {}, updated: 0, generationKey,
  chain: { chainId: id, version: 'v', kind: 'remote', seed: '', seedOrigin: 'example', focus: '知止', parentChainId: null, entry: null,
    frames: [], cursor: '0', exhausted: false } });
function fixture() {
  let now = 1000, ids = 0;
  const backend = new MemoryDocumentBackend(() => now);
  const store = createSessionStore(backend, { createId: () => `holder-${++ids}`, leaseMs: 100 });
  return { backend, store, advance(ms: number) { now += ms; } };
}
const opening = { key: 'open:r', requestId: 'r', fingerprint: 'open:empty' };

const verifiedFrame = (id = 'source'): FlowFrame => ({ id, sourceId: id, corpusVersion: 'corpus-v1', textHash: 'hash',
  quote: '知止', quoteStart: 0, quoteEnd: 2, fullText: '知止', meaning: '辨明安止的方向', reflection: '私人短解不索引',
  source: '大学', chapterLabel: '经一章', ordinal: 1, provenance: 'model', ready: true, anchors: [], reflectionSpans: [] });

test('verified semantics retain separate readings for different content scopes', () => {
  const core = retainSemantics([], [verifiedFrame()], 1000, 'core-version');
  const both = retainSemantics(core, [{ ...verifiedFrame(), meaning: '加入诗词后的原义线索' }], 1001, 'core-and-poetry-version');
  expect(both).toHaveLength(2);
  expect(both.find(entry => entry.contentScope === 'core-version')!.text).toBe('辨明安止的方向');
  expect(both.find(entry => entry.contentScope === 'core-and-poetry-version')!.text).toBe('加入诗词后的原义线索');
  const revised = retainSemantics(both, [{ ...verifiedFrame(), meaning: '新核心线索' }], 1002, 'core-version');
  expect(revised).toHaveLength(2);
  expect(revised.find(entry => entry.contentScope === 'core-and-poetry-version')!.text).toBe('加入诗词后的原义线索');
});

test('only completed verified semantics survive a new worker and remain isolated by owner', async () => {
  const f = fixture(), { lease } = await f.store.reserve(owner, opening);
  const head = state('indexed'); head.chain.seed = '私人输入不索引'; head.chain.frames = [verifiedFrame()];
  await f.store.commitHead(owner, lease!, head);
  const before = await f.store.reserve(owner, { key: 'probe:before', requestId: 'before', fingerprint: 'before' });
  expect(before.semantics).toEqual([]);
  await f.store.release(owner, before.lease!);
  await f.store.commitComplete(owner, lease!, head, '0');
  const restarted = createSessionStore(f.backend, { createId: () => 'restarted' });
  const saved = await restarted.reserve(owner, { key: 'probe:after', requestId: 'after', fingerprint: 'after' });
  expect(saved.semantics).toEqual([expect.objectContaining({ id: 'source', corpusVersion: 'corpus-v1', textHash: 'hash',
    text: '辨明安止的方向', promptVersion: FLOW_PROMPT_VERSION })]);
  expect((await restarted.reserve('other', opening)).semantics).toEqual([]);
  f.advance(SEMANTIC_TTL_MS);
  expect((await restarted.reserve(owner, { key: 'probe:expired', requestId: 'expired', fingerprint: 'expired' })).semantics).toEqual([]);
});

test('verified word branches publish atomically, stay owner-scoped and expire while the owner document stays live', async () => {
  const f = fixture();
  const makeBranch = (index: number) => {
    const key = 'branch:parent-' + index;
    return { key, requestId: key, fingerprint: key };
  };
  const probe = async (id: string, reader = owner) => {
    const { verifiedBranches, lease } = await f.store.reserve(reader, { key: id, requestId: id, fingerprint: id, includeVerifiedBranches: true });
    await f.store.release(reader, lease!);
    return verifiedBranches;
  };
  const plan = { sense: '此处的义项', direction: '进一步的方向', terms: ['本末', '先后'] };
  for (let index = 0; index < 25; index++) {
    const branch = makeBranch(index), { lease } = await f.store.reserve(owner, branch);
    const pending = { ...state('child-' + index, branch.key), pendingVerifiedBranch: { signature: String(index), version: 'test', plan } };
    await f.store.commitHead(owner, lease!, pending);
    if (index === 0) expect(await probe('head-only')).toEqual([]);
    const frame = verifiedFrame('target-' + index);
    pending.chain.frames = [frame];
    await f.store.commitComplete(owner, lease!, { ...pending, initial: pending.chain }, '0', 'test');
    expect((await f.store.getChain(owner, pending.chain.chainId)).pendingVerifiedBranch).toBeUndefined();
  }
  const remembered = await probe('remembered');
  expect(remembered?.map(entry => entry.signature)).toEqual(Array.from({ length: 24 }, (_, index) => String(index + 1)));
  expect(remembered?.at(-1)).toEqual({
    signature: '24', version: 'test', plan, updated: 1000,
    target: { sourceId: 'target-24', corpusVersion: 'corpus-v1', textHash: 'hash', quoteStart: 0, quoteEnd: 2, quote: '知止' },
  });
  expect((await f.store.reserve(owner, { ...makeBranch(24), includeVerifiedBranches: true })).verifiedBranches).toBeUndefined();
  expect((await f.store.reserve(owner, opening)).verifiedBranches).toBeUndefined();
  expect(await probe('another-owner', 'reader-b')).toEqual([]);
  f.advance(SESSION_TTL_MS - 1);
  expect(await probe('keep-owner-active')).toHaveLength(24);
  f.advance(1);
  expect(await probe('expired-memory')).toEqual([]);
});

test.each(['aborted before CAS', 'lost lease', 'wrong version', 'not ready', 'curated'] as const)
('verified word branch is not published when %s', async failure => {
  const f = fixture();
  const key = 'branch:parent';
  const { lease } = await f.store.reserve(owner, { key, requestId: key, fingerprint: key });
  const pending = { ...state('child', key), pendingVerifiedBranch: { signature: 'same', version: 'test',
    plan: { sense: '义项', direction: '方向', terms: ['本末', '先后'] } } };
  await f.store.commitHead(owner, lease!, pending);
  pending.chain.frames = [{ ...verifiedFrame(), ...(failure === 'not ready' ? { ready: false } : {}),
    ...(failure === 'curated' ? { provenance: 'curated' as const } : {}) }];
  const controller = new AbortController();
  if (failure === 'lost lease') f.advance(101);
  if (failure === 'aborted before CAS') {
    const read = f.backend.read.bind(f.backend);
    jest.spyOn(f.backend, 'read').mockImplementationOnce(async key => {
      const result = await read(key); controller.abort(); return result;
    });
  }
  const complete = f.store.commitComplete(owner, lease!, { ...pending, initial: pending.chain }, '0',
    failure === 'wrong version' ? 'other' : 'test', controller.signal);
  if (failure === 'lost lease') await expect(complete).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' });
  else if (failure === 'aborted before CAS') await expect(complete).rejects.toMatchObject({ name: 'AbortError' });
  else await complete;
  const after = await f.store.reserve(owner, { key: 'probe', requestId: 'probe', fingerprint: 'probe', includeVerifiedBranches: true });
  expect(after.verifiedBranches).toEqual([]);
});

test('semantic retention is bounded, versioned and excludes incomplete or curated frames', () => {
  const frames = Array.from({ length: SEMANTIC_LIMIT + 1 }, (_, i) => verifiedFrame(String(i)));
  let entries = retainSemantics([], frames, 1000);
  expect(entries).toHaveLength(SEMANTIC_LIMIT); expect(entries[0]!.id).toBe('1');
  entries[0]!.promptVersion = 'old';
  entries = retainSemantics(entries, [{ ...verifiedFrame('pending'), ready: false }, { ...verifiedFrame('curated'), provenance: 'curated' }], 1001);
  expect(entries).toHaveLength(SEMANTIC_LIMIT - 1);
  const refreshed = retainSemantics(entries, [{ ...verifiedFrame('2'), meaning: '新'.repeat(2000) }], 1002);
  expect(refreshed.at(-1)!.text).toHaveLength(1200);
  expect(refreshed.filter(entry => entry.id === '2')).toHaveLength(1);
  expect(retainSemantics(refreshed, [], 1002 + SEMANTIC_TTL_MS)).toEqual([]);
});

test('a committed head survives a new store instance and remains owned by its reader', async () => {
  const f = fixture(), { lease } = await f.store.reserve(owner, opening);
  await f.store.commitHead(owner, lease!, state('a')); await f.store.release(owner, lease!);
  const restarted = createSessionStore(f.backend, { createId: () => 'new-worker', leaseMs: 100 });
  const resumed = await restarted.reserve(owner, { ...opening, requestId: 'resume-r', fingerprint: 'resume:a' });
  expect(resumed.chain?.chain.chainId).toBe('a'); expect(resumed.lease?.version).toBe(2);
  await expect(restarted.getChain('reader-b', 'a')).rejects.toMatchObject({ code: 'CHAIN_EXPIRED' });
});
test('missing and inaccessible chains use the same neutral recovery message', async () => {
  const f = fixture();
  for (const id of [undefined, 'missing']) {
    await expect(f.store.getChain(owner, id)).rejects.toMatchObject({ code: 'CHAIN_EXPIRED', message: '当前经文暂时无法在线接续，原文仍可阅读。' });
  }
  const lease = (await f.store.reserve(owner, opening)).lease!;
  await f.store.commitHead(owner, lease, state('a'));
  await expect(f.store.getChain('other-owner', 'a')).rejects.toMatchObject({ code: 'CHAIN_EXPIRED', message: '当前经文暂时无法在线接续，原文仍可阅读。' });
  f.advance(SESSION_TTL_MS + 1);
  await expect(f.store.getChain(owner, 'a')).rejects.toMatchObject({ code: 'CHAIN_EXPIRED', message: '当前经文暂时无法在线接续，原文仍可阅读。' });
});

test('parallel reservations permit one generator and reject a reused request with different input', async () => {
  const f = fixture(), results = await Promise.allSettled([f.store.reserve(owner, opening), f.store.reserve(owner, opening)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('CHAIN_BUSY');
  await expect(f.store.reserve(owner, { ...opening, fingerprint: 'different' })).rejects.toMatchObject({ code: 'REQUEST_REUSED' });
});
test('expired workers cannot overwrite, renew or release the new operation', async () => {
  const f = fixture(), first = (await f.store.reserve(owner, opening)).lease!;
  await f.store.commitHead(owner, first, state('a'));
  f.advance(101);
  const second = (await f.store.reserve(owner, opening)).lease!;
  expect(second.version).toBe(first.version + 1);
  await expect(f.store.commitComplete(owner, first, state('a'), '0')).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' });
  await expect(f.store.renew(owner, first)).rejects.toMatchObject({ code: 'OPERATION_EXPIRED' });
  expect(await f.store.release(owner, first)).toBe(false);
  await expect(f.store.reserve(owner, opening)).rejects.toMatchObject({ code: 'CHAIN_BUSY' });
  await expect(f.store.renew(owner, second)).resolves.toMatchObject({ holder: second.holder });
});
test('parent completion merges child mappings committed while its head was still being explained', async () => {
  const f = fixture(), parent = state('a'), first = (await f.store.reserve(owner, opening)).lease!;
  await f.store.commitHead(owner, first, parent);
  const branch = (await f.store.reserve(owner, { key: 'branch:a:f:w', requestId: 'branch-r', fingerprint: 'branch:f:w' })).lease!;
  const child = state('b', branch.key); child.chain.parentChainId = 'a';
  await f.store.commitHead(owner, branch, child, { id: 'a', edge: 'f:w' });
  parent.chain.cursor = 'complete'; parent.initial = parent.chain;
  await f.store.commitComplete(owner, first, parent, '0');
  expect((await f.store.getChain(owner, 'a')).branches).toEqual({ 'f:w': 'b' });
  expect((await f.store.getChain(owner, 'b')).chain.parentChainId).toBe('a');
});

test('progress retains concurrent child edges and rejects mutation of a published paragraph', async () => {
  const f = fixture(), parent = state('p'), lease = (await f.store.reserve(owner, opening)).lease!;
  const frame = { ...verifiedFrame('f'), ready: false, reflection: '', settled: { meaning: true, reflection: false } };
  parent.chain.frames = [frame]; parent.nodes[frame.id] = frame;
  await f.store.commitHead(owner, lease, parent);
  const childLease = (await f.store.reserve(owner, { key: 'branch:p:f:w', requestId: 'child', fingerprint: 'child' })).lease!;
  await f.store.commitHead(owner, childLease, state('c', childLease.key), { id: 'p', edge: 'f:w' });
  const changed = structuredClone(parent);
  changed.chain.frames[0]!.meaning = '被更改的段落。'; changed.nodes.f = changed.chain.frames[0]!;
  await expect(f.store.commitProgress(owner, lease, changed, '0')).rejects.toMatchObject({ code: 'FRAME_CHANGED' });
  const progressed = structuredClone(parent);
  progressed.chain.frames[0]!.reflection = '新的完整联系。'; progressed.chain.frames[0]!.settled!.reflection = true;
  progressed.nodes.f = progressed.chain.frames[0]!;
  expect((await f.store.commitProgress(owner, lease, progressed, '0')).branches).toEqual({ 'f:w': 'c' });
});
test('saved completion replays without a lease, even after a lost response and new store instance', async () => {
  const f = fixture(), saved = state('a'), lease = (await f.store.reserve(owner, opening)).lease!;
  await f.store.commitHead(owner, lease, saved); saved.chain.cursor = 'ready'; saved.initial = saved.chain;
  await f.store.commitComplete(owner, lease, saved, '0');
  const restarted = createSessionStore(f.backend, { createId: () => { throw new Error('should not acquire'); } });
  const replay = await restarted.reserve(owner, opening);
  expect(replay.lease).toBeNull(); expect(replay.result?.cursor).toBe('ready');
});
test('a wrong expected cursor cannot commit or replace the current checkpoint', async () => {
  const f = fixture(), lease = (await f.store.reserve(owner, opening)).lease!;
  await f.store.commitHead(owner, lease, state('a'));
  await expect(f.store.commitComplete(owner, lease, state('a'), 'wrong')).rejects.toMatchObject({ code: 'CURSOR_CHANGED' });
  expect((await f.store.getChain(owner, 'a')).chain.cursor).toBe('0');
});
test('a head storage failure is atomic: neither the child nor its parent mapping is visible', async () => {
  const f = fixture(), first = (await f.store.reserve(owner, opening)).lease!;
  await f.store.commitHead(owner, first, state('a'));
  const child = (await f.store.reserve(owner, { key: 'branch:a:f:w', requestId: 'b', fingerprint: 'b' })).lease!;
  jest.spyOn(f.backend, 'compareSwap').mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(f.store.commitHead(owner, child, state('b'), { id: 'a', edge: 'f:w' })).rejects.toThrow('storage unavailable');
  expect((await f.store.getChain(owner, 'a')).branches).toEqual({});
  await expect(f.store.getChain(owner, 'b')).rejects.toMatchObject({ code: 'CHAIN_EXPIRED' });
});
