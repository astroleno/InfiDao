const test = require('node:test');
const assert = require('node:assert/strict');
const { createChainStore, PREFIX } = require('../flow/chain-store');

function storage() {
  const values = new Map();
  return { values, getStorageSync: key => structuredClone(values.get(key)),
    setStorageSync: (key, value) => values.set(key, structuredClone(value)),
    removeStorageSync: key => values.delete(key), getStorageInfoSync: () => ({ keys: [...values.keys()] }) };
}
const chain = (id, parent = null, ordinal = 1) => ({ chainId: id, parentChainId: parent,
  entry: parent ? { fromFrameId: 'frame', anchorId: id, label: '止' } : null,
  frames: [{ id: id + '-frame', ordinal, quote: '知止而后有定', ready: true }], focus: '止' });
const managed = api => createChainStore(api, { autoPrune: true, allowTemporary: true });

test('300 cold starts retain at most two inactive trees and keep saving without temporary mode', () => {
  const api = storage();
  api.setStorageSync('infidao-notes-v1', [{ text: '我的注脚', quote: '知止而后有定' }]);
  api.setStorageSync('infidao-preview-key-v1', 'test-only-sentinel');
  const notes = api.getStorageSync('infidao-notes-v1');
  for (let i = 0; i < 300; i++) {
    const store = managed(api);
    store.put(chain('root-' + i), { position: i });
    assert.equal(store.stats().temporary, false);
    assert.ok(store.stats().saved <= 3);
    assert.ok(store.stats().bytes < 10000);
    assert.equal(store.get('root-' + i).snapshot.position, i);
  }
  assert.equal([...api.values.keys()].filter(key => key.startsWith(PREFIX)).length, 4);
  assert.deepEqual(api.getStorageSync('infidao-notes-v1'), notes);
  assert.equal(api.getStorageSync('infidao-preview-key-v1'), 'test-only-sentinel');
});

test('pressure removes whole inactive trees while 30 active branches, siblings and prior windows all remain returnable', () => {
  const api = storage(), old = createChainStore(api);
  old.put(chain('closed')); old.put(chain('closed-child', 'closed'));
  old.saveWindow(chain('closed-child', 'closed'), { position: 7 });
  const store = createChainStore(api, { autoPrune: true, allowTemporary: true, archivedRoots: 0 });
  store.put(chain('active'), { position: 42 });
  let parent = 'active';
  for (let i = 0; i < 30; i++) {
    const node = chain('branch-' + i, parent);
    store.put(node, { position: i });
    store.saveWindow(node, { position: i + 100 });
    parent = node.chainId;
  }
  store.put(chain('sibling', 'active'));
  assert.equal(store.path(parent).length, 31);
  assert.equal(store.get('active').snapshot.position, 42);
  assert.equal(store.child('active', 'frame', 'sibling').chain.chainId, 'sibling');
  assert.equal(store.previousWindow('branch-0', 2).snapshot.position, 100);
  assert.equal(store.stats().temporary, false);
  assert.equal([...api.values.keys()].some(key => key.includes('closed')), false);
});

test('resolving an old return target protects that whole tree before another save triggers cleanup', () => {
  const api = storage(), old = createChainStore(api);
  old.put(chain('parent'), { position: 42 }); old.put(chain('child', 'parent'));
  old.put(chain('unrelated'));
  const store = createChainStore(api, { autoPrune: true, archivedRoots: 0 });
  store.get('child');
  store.put(chain('new-root'));
  assert.equal(store.get('parent').snapshot.position, 42);
  assert.equal(store.path('child').length, 2);
  assert.equal(store.get('unrelated'), null);
});

test('archive budget pressure frees inactive trees and resumes persistent writing', () => {
  const api = storage(), old = createChainStore(api);
  for (let i = 0; i < 12; i++) old.put(chain('old-' + i));
  const bytes = JSON.stringify({ chain: chain('new'), snapshot: {} }).length * 3;
  const store = createChainStore(api, { autoPrune: true, allowTemporary: true, byteLimit: bytes * 2, archivedRoots: 20 });
  store.put(chain('new'));
  assert.equal(store.stats().temporary, false);
  assert.ok(store.stats().bytes <= bytes * 2);
  assert.ok(store.stats().reclaimed > 0);
  assert.ok(createChainStore(api).get('new'));
});

test('a native quota error retries after reclaiming inactive cache, without touching another namespace', () => {
  const api = storage(), old = createChainStore(api);
  old.put(chain('old-1')); old.put(chain('old-2'));
  const native = createChainStore(api, { prefix: 'infidao-native-chain-v1:' });
  native.put(chain('native'));
  const nativeBefore = api.getStorageSync('infidao-native-chain-v1:native');
  const write = api.setStorageSync;
  api.setStorageSync = (key, value) => {
    if (key === PREFIX + 'new' && api.values.has(PREFIX + 'old-1')) throw new Error('native quota');
    write(key, value);
  };
  const store = managed(api); store.put(chain('new'));
  assert.equal(store.stats().temporary, false);
  assert.equal(store.get('new').chain.chainId, 'new');
  assert.deepEqual(api.getStorageSync('infidao-native-chain-v1:native'), nativeBefore);
});

test('failed cleanup index commit preserves every old payload and permits temporary reading', () => {
  const api = storage(), old = createChainStore(api);
  old.put(chain('old')); const before = structuredClone(api.values), write = api.setStorageSync;
  api.setStorageSync = (key, value) => { if (key === PREFIX + 'index') throw new Error('index unavailable'); write(key, value); };
  const store = createChainStore(api, { autoPrune: true, allowTemporary: true, archivedRoots: 0 });
  store.put(chain('new'));
  assert.equal(store.stats().temporary, true);
  assert.deepEqual(api.values, before);
  assert.ok(store.get('new'));
});

test('interrupted payload deletion is retried on launch; orphan and dangling cache entries are repaired', () => {
  const api = storage(), old = createChainStore(api);
  old.put(chain('old'));
  const remove = api.removeStorageSync;
  api.removeStorageSync = key => { if (key === PREFIX + 'old') throw new Error('interrupted'); remove(key); };
  const first = createChainStore(api, { autoPrune: true, archivedRoots: 0 });
  first.put(chain('first'));
  assert.ok(api.values.has(PREFIX + 'old'));
  assert.equal(api.getStorageSync(PREFIX + 'index').old, undefined);
  api.removeStorageSync = remove;
  api.setStorageSync(PREFIX + 'orphan', { chain: chain('orphan'), snapshot: {} });
  remove(PREFIX + 'first');
  const next = managed(api); next.put(chain('next'));
  assert.equal(next.stats().temporary, false);
  assert.deepEqual(Object.keys(api.getStorageSync(PREFIX + 'index')), ['next']);
  assert.deepEqual([...api.values.keys()].sort(), [PREFIX + 'index', PREFIX + 'next'].sort());
});

test('an oversized node does not erase useful archives', () => {
  const api = storage(), old = createChainStore(api);
  old.put(chain('archived'));
  const store = createChainStore(api, { autoPrune: true, allowTemporary: true, byteLimit: 100 });
  store.put(chain('new'));
  assert.equal(store.stats().temporary, true);
  assert.ok(api.values.has(PREFIX + 'archived'));
  store.put(chain('child', 'new'));
  assert.equal(store.path('child').length, 2);
  assert.ok(store.get('new'));
});

test('an active tree exceeding the disk budget keeps every ancestor while its child becomes temporary', () => {
  const api = storage(), root = chain('root');
  const bytes = JSON.stringify({ chain: root, snapshot: {} }).length * 3;
  const store = createChainStore(api, { autoPrune: true, allowTemporary: true, byteLimit: bytes * 1.5 });
  store.put(root);
  const before = structuredClone(api.values);
  store.put(chain('child', 'root'));
  assert.equal(store.stats().temporary, true);
  assert.deepEqual(api.values, before);
  assert.equal(store.path('child').length, 2);
  assert.ok(createChainStore(api).get('root'));
});
