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
