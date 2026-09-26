const test = require('node:test');
const assert = require('node:assert/strict');
const { createChainStore, PREFIX } = require('../flow/chain-store');
const { createCuratedProvider } = require('../flow/curated-provider');
const { chainActions } = require('../flow/chain-page');

function storage() {
  const values = new Map(), toasts = [];
  return { values, toasts, getStorageSync: key => values.get(key),
    setStorageSync: (key, value) => values.set(key, structuredClone(value)),
    removeStorageSync: key => values.delete(key), showToast: value => toasts.push(value) };
}

function page(api) {
  const value = { ...chainActions, _alive: true, _visible: true,
    data: { ready: false, loading: true, error: '', shots: [], sceneHeight: 725 },
    setData(patch) { Object.assign(this.data, patch); }, syncMotion() {}, updateActive() {},
    initRenderer() { this.setData({ ready: true, phase: 'flow' }); },
  };
  value.initChains(api);
  return value;
}

test('a full inactive archive is reclaimed on cold start without losing personal notes', async () => {
  const api = storage();
  api.setStorageSync(PREFIX + 'index', { old: { bytes: 3 * 1024 * 1024, chainId: 'old' } });
  api.setStorageSync(PREFIX + 'old', { chain: { chainId: 'old' }, snapshot: { position: 42 } });
  api.setStorageSync('infidao-notes-v1', [{ id: 'my-note', text: '保留我的话' }]);
  const before = structuredClone(api.values), instance = page(api);
  await instance.openChainSession('');
  assert.equal(instance.data.error, '');
  assert.equal(instance.data.loading, false);
  assert.equal(instance.data.ready, true);
  assert.equal(instance.data.phase, 'flow');
  assert.equal(instance._timeline.loop, true);
  assert.equal(instance._chainStore.stats().temporary, false);
  assert.equal(api.toasts.length, 0);
  assert.equal(api.values.has(PREFIX + 'old'), false);
  assert.deepEqual(api.values.get('infidao-notes-v1'), before.get('infidao-notes-v1'));
  await instance.saveChain();
  assert.equal(instance._chainStore.get(instance._session.chainId).chain.chainId, instance._session.chainId);
  assert.ok(api.values.has(PREFIX + instance._session.chainId));
  instance._continuation.dispose();
});

test('native storage write errors also allow startup without clearing a key or notes', async () => {
  const api = storage();
  api.setStorageSync('unrelated', { keep: true });
  const before = structuredClone(api.values);
  api.setStorageSync = () => { throw new Error('setStorageSync:fail storage quota exceeded'); };
  const instance = page(api);
  await instance.openChainSession('');
  assert.equal(instance.data.ready, true);
  assert.equal(instance.data.error, '');
  assert.equal(instance._chainStore.stats().temporary, true);
  assert.match(instance.data.storageNotice, /暂不保存/);
  assert.deepEqual(api.values, before);
  instance._continuation.dispose();
});

test('temporary paths retain ancestors beyond the LRU and can return to an already persisted parent', async () => {
  const api = storage(), root = await createCuratedProvider().open('');
  const disk = createChainStore(api);
  disk.put(root, { position: 42 });
  const before = structuredClone(api.values);
  let notices = 0;
  const store = createChainStore(api, { byteLimit: 1, allowTemporary: true,
    temporaryByteLimit: 3 * 1024 * 1024, onTemporary: () => { notices++; } });
  let parent = root.chainId;
  for (let i = 0; i < 12; i++) {
    const chain = { ...root, chainId: 'temporary-' + i, parentChainId: parent,
      entry: { fromFrameId: 'frame-' + i, anchorId: 'word-' + i, label: '止' } };
    store.put(chain, { position: i + 1 }); parent = chain.chainId;
  }
  assert.equal(store.path(parent).length, 13);
  assert.equal(store.get('temporary-0').snapshot.position, 1);
  assert.equal(store.get(root.chainId).snapshot.position, 42);
  assert.equal(store.child(root.chainId, 'frame-0', 'word-0').chain.chainId, 'temporary-0');
  assert.ok(store.stats().memory <= 8);
  assert.equal(notices, 1);
  assert.deepEqual(api.values, before);
  assert.equal(createChainStore(api).get('temporary-0'), null, 'temporary records are not presented as durable');
});

test('a failed index write preserves the durable snapshot while the current session uses its newer temporary snapshot', async () => {
  const api = storage(), chain = await createCuratedProvider().open('');
  const store = createChainStore(api, { allowTemporary: true });
  store.put(chain, { position: 42 });
  const before = structuredClone(api.values), write = api.setStorageSync;
  api.setStorageSync = (key, value) => { if (key === PREFIX + 'index') throw new Error('quota'); write(key, value); };
  store.put(chain, { position: 84 });
  assert.equal(store.get(chain.chainId).snapshot.position, 84);
  assert.equal(createChainStore(api).get(chain.chainId).snapshot.position, 42);
  assert.deepEqual(api.values, before);
});

test('temporary storage remains bounded and never evicts an ancestor when full', async () => {
  const api = storage(), chain = await createCuratedProvider().open('');
  const bytes = JSON.stringify({ chain, snapshot: {} }).length * 3;
  const store = createChainStore(api, { byteLimit: 1, allowTemporary: true, temporaryByteLimit: bytes + 10 });
  store.put(chain);
  const before = store.get(chain.chainId);
  assert.throws(() => store.put({ ...chain, chainId: 'another', parentChainId: chain.chainId }), /TEMPORARY_STORAGE_FULL/);
  assert.deepEqual(store.get(chain.chainId), before);
  assert.ok(store.stats().temporaryBytes <= bytes + 10);
  assert.equal(api.values.size, 0);
});
