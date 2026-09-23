const test = require('node:test');
const assert = require('node:assert/strict');
const { createEventDecoder, createRemoteProvider } = require('../flow/remote-provider');
const { createContinuation } = require('../flow/continuation');
const { createCuratedProvider } = require('../flow/curated-provider');
const { createChainStore, PREFIX } = require('../flow/chain-store');
const { createRequestBudget } = require('../flow/request-budget');
const { FlowTimeline, CELL, CENTER_PHASE } = require('../flow/timeline');
const { rowMotion } = require('../flow/scene');
const { chainActions } = require('../flow/chain-page');
const tick = () => new Promise(resolve => setImmediate(resolve));
const storage = () => { const values = new Map(); return { getStorageSync: key => values.get(key),
  setStorageSync: (key, value) => values.set(key, structuredClone(value)), removeStorageSync: key => values.delete(key) }; };

test('an offline word without a prepared link gives an actionable connection error and retains the parent', async () => {
  const provider = createCuratedProvider(), parent = await provider.open(''), frame = parent.frames[0];
  const { classicSpans } = require('../flow/classic-text');
  const part = classicSpans(frame).find(p => p.selection && !frame.anchors.some(a => a.surface === 'quote' &&
    frame.quoteStart + a.start === p.selection.start && frame.quoteStart + a.end === p.selection.end));
  const page = { ...chainActions, _alive: true, _visible: true, _chainRequest: 0, _session: parent,
    _chainStore: { child: () => null }, _continuation: createContinuation(provider),
    data: { chainBusy: false, paused: false, wordHit: part },
    setData(patch) { Object.assign(this.data, patch); }, saveChain() {}, syncMotion() {}, pulse() {} };
  await page.branchFromWord({ detail: { frameId: frame.id, anchorId: part.anchorId, selection: part.selection } });
  assert.equal(page._session.chainId, parent.chainId);
  assert.equal(page.data.chainErrorAction, 'connect');
  assert.match(page.data.chainError, /连接 DS/);
  assert.equal(page.data.chainBusy, false); assert.equal(page.data.wordHit, null);
  const wxml = require('node:fs').readFileSync(require('node:path').join(__dirname, '../pages/flow/index.wxml'), 'utf8');
  assert.match(wxml, /!readingVisible && !overlay && \(chainBusy \|\| chainPending \|\| chainError\)/);
  page.dismissChainError(); assert.equal(page.data.chainError, '');
  page._continuation.dispose();
});

test('stale word selections clear the feedback and explain the failure instead of silently returning', async () => {
  const parent = await createCuratedProvider().open('');
  const page = { ...chainActions, _alive: true, _visible: true, _chainRequest: 3, _session: parent,
    data: { chainBusy: false, wordHit: { label: '旧' } },
    setData(patch) { Object.assign(this.data, patch); }, syncMotion() {} };
  await page.branchFromWord({ detail: { frameId: 'no-longer-present', anchorId: 'text:0:1' } });
  assert.equal(page.data.wordHit, null);
  assert.match(page.data.chainError, /重新选择/);
});

test('UTF-8 survives every chunk boundary, including surrogate pairs and split NDJSON records', () => {
  const events = [{ type: 'head', quote: '知止𠮷' }, { type: 'done', quote: '物有本末。' }];
  const bytes = Buffer.from(events.map(JSON.stringify).join('\n') + '\n');
  for (let split = 1; split < bytes.length; split++) {
    const received = [], decoder = createEventDecoder(event => received.push(event));
    decoder.push(bytes.subarray(0, split)); decoder.push(bytes.subarray(split), true);
    assert.deepEqual(received, events);
  }
  assert.throws(() => createEventDecoder(() => {}).push(Uint8Array.of(0xe4), true), /INCOMPLETE/);
  assert.throws(() => createEventDecoder(() => {}).push(Uint8Array.of(0xed, 0xa0, 0x80), true), /INVALID/);
});

test('non-chunked native responses follow the same done contract; cancelled late responses cannot resolve', async () => {
  let options;
  const api = { request(value) { options = value; return { abort() {} }; } };
  const provider = createRemoteProvider(api, 'https://example.invalid', 'test-session');
  const pending = provider.open('本末');
  const bytes = Buffer.from(JSON.stringify({ type: 'done', requestId: options.data.requestId, chain: { chainId: 'a' } }) + '\n');
  options.success({ statusCode: 200, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  assert.equal((await pending).chainId, 'a');
  const cancelled = provider.open('先后');
  cancelled.cancel();
  options.success({ statusCode: 200, data: { events: [] } });
  await assert.rejects(cancelled, error => error.cancelled);
});

test('content and fonts share two network slots; queued cancellation never starts a request', () => {
  const calls = [];
  const budget = createRequestBudget({ request(options) { calls.push(options); return { abort() { options.fail({ errMsg: 'abort' }); } }; } });
  budget.request({ url: 'content' }); budget.request({ url: 'font' });
  const queued = budget.request({ url: 'cancelled', fail() {} }); queued.abort();
  budget.request({ url: 'next' });
  assert.equal(calls.length, 2);
  calls[0].success({}); assert.deepEqual(calls.map(call => call.url), ['content', 'font', 'next']);
});

test('backgrounding cancels content and font traffic, then permits fresh requests after foregrounding', () => {
  const calls = [], failures = [];
  const api = createRequestBudget({ request(options) { calls.push(options); return { abort() { options.fail({ errMsg: 'abort' }); } }; } });
  for (const url of ['a', 'b', 'c']) api.request({ url, fail() { failures.push(url); } });
  api.abortPending();
  assert.equal(calls.length, 2);
  assert.equal(failures.length, 3);
  api.request({ url: 'hidden', fail() { failures.push('hidden'); } });
  assert.equal(calls.length, 2);
  api.resumeRequests(); api.request({ url: 'visible' });
  assert.equal(calls[2].url, 'visible');
});

test('foreground promotes the prefetched branch without a duplicate request and rejects stale work', async () => {
  const calls = [];
  const provider = {};
  for (const method of ['open', 'branch', 'next']) provider[method] = (input, hooks) => {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    promise.cancel = () => reject(Object.assign(new Error('cancel'), { cancelled: true }));
    calls.push({ method, input, hooks, resolve }); return promise;
  };
  const scheduler = createContinuation(provider);
  const input = { chainId: 'root', fromFrameId: 'f', anchorId: 'a' };
  scheduler.prefetch({ chainId: 'root', exhausted: true }, { id: 'f', anchors: [{ id: 'a' }] });
  const branch = scheduler.branch(input);
  assert.equal(calls.length, 1);
  calls[0].resolve({ chainId: 'child' });
  assert.equal((await branch).chainId, 'child');
  assert.equal((await scheduler.branch(input)).chainId, 'child');
  const old = scheduler.open('old');
  const fresh = scheduler.open('fresh');
  await assert.rejects(old, error => error.cancelled);
  calls[1].resolve({ chainId: 'stale' }); calls[2].resolve({ chainId: 'fresh' });
  assert.equal((await fresh).chainId, 'fresh');
  scheduler.dispose();
});

test('head preparation arriving after done never overwrites the complete frame', async () => {
  let resolve, headReady, delivered = 0;
  const provider = { branch(input, hooks) {
    hooks.onEvent({ type: 'head', chain: { ready: false } });
    return new Promise(done => { resolve = done; });
  } };
  const scheduler = createContinuation(provider, chain => chain.ready ? chain : new Promise(done => { headReady = () => done(chain); }));
  const pending = scheduler.branch({}, { onHead() { delivered++; } });
  resolve({ ready: true }); await pending; headReady(); await tick();
  assert.equal(delivered, 0); scheduler.dispose();
});

test('30 consecutive branches retain exact ancestors with only eight in-memory snapshots', async () => {
  const provider = createCuratedProvider(), api = storage(), store = createChainStore(api);
  let chain = await provider.open(''), path = [];
  for (let i = 0; i <= 30; i++) {
    const snapshot = { position: i * 37 + 235.52, rowOffset: i, ambientPhase: i / 40,
      paused: i % 2 === 0, sourceOpen: i % 3 === 0, readingScroll: i * 23 };
    store.put(chain, snapshot); path.push({ chain, snapshot });
    for (const frame of chain.frames) {
      assert.equal(frame.fullText.slice(frame.quoteStart, frame.quoteEnd), frame.quote);
      assert.equal(frame.reflectionSpans.map(span => span.text).join(''), frame.reflection);
    }
    if (i < 30) chain = await provider.branch({ chainId: chain.chainId, fromFrameId: chain.frames[0].id, anchorId: chain.frames[0].anchors[0].id });
  }
  assert.equal(store.path(chain.chainId).length, 31);
  assert.equal(store.stats().memory, 8);
  const reopened = createChainStore(api);
  for (const item of path.reverse()) assert.deepEqual(reopened.get(item.chain.chainId).snapshot, item.snapshot);
  const restoredProvider = createCuratedProvider();
  restoredProvider.restore(path[0].chain);
  const original = path[0].chain;
  const next = await restoredProvider.next({ chainId: original.chainId, cursor: original.cursor });
  assert.equal(next.frames[0].ordinal, 4);
});

test('content batches pass eight nodes without duplication; old windows remain recoverable on disk', async () => {
  const provider = createCuratedProvider(), store = createChainStore(storage());
  const root = await provider.open('');
  let chain = await provider.branch({ chainId: root.chainId, fromFrameId: root.frames[0].id, anchorId: root.frames[0].anchors[0].id });
  const seen = new Set();
  for (;;) {
    for (const frame of chain.frames) { assert.ok(!seen.has(frame.id)); seen.add(frame.id); }
    store.saveWindow(chain, { position: 250 });
    if (chain.exhausted) break;
    chain = await provider.next({ chainId: chain.chainId, cursor: chain.cursor });
  }
  assert.ok(seen.size > 8);
  assert.ok(store.previousWindow(chain.chainId, 10));
  const timeline = new FlowTimeline(5); timeline.loop = false;
  timeline.advancePosition(CELL * 100);
  assert.equal(timeline.index, 4); assert.equal(timeline.atEnd, true);
  timeline.advancePosition(-CELL * 100);
  assert.equal(timeline.position, CELL * CENTER_PHASE);
  assert.equal(rowMotion(4, 0, 5, 0, false).distance, -4);
});

test('the visual wheel continues through 200 cycles while content is exhausted or delayed', () => {
  const timeline = new FlowTimeline(11);
  for (let lap = 0; lap < 200; lap++) {
    timeline.advancePosition(CELL * 11);
    assert.ok(Math.abs(timeline.position - CELL * CENTER_PHASE) < 1e-7);
    assert.equal(timeline.index, 0); assert.equal(timeline.atEnd, false);
    assert.equal(timeline.rowOffset, (lap + 1) * 11);
  }
  timeline.tick(0); timeline.tick(50);
  assert.ok(timeline.position > CELL * CENTER_PHASE);
  timeline.paused = true;
  const position = timeline.position; timeline.tick(100);
  assert.equal(timeline.position, position);
});

test('entering and restoring a chain keeps infinite motion and exact saved reading coordinates', async () => {
  const chain = await createCuratedProvider().open('');
  const page = { ...chainActions, _alive: true, _visible: true, _chainRequest: 1,
    _chainStore: createChainStore(storage()), _provider: {}, _continuation: { cancelUnrelated() {} },
    data: { detailShift: 160 }, setData(patch) { Object.assign(this.data, patch); }, updateActive() {}, initRenderer() {} };
  await page.presentChain(chain, null, 1);
  assert.equal(page._timeline.loop, true);
  assert.equal(page.data.paused, false);
  const snapshot = { position: 1234.5, rowOffset: 28, ambientPhase: 0.37, paused: true, readingScroll: 141, sourceOpen: true, readingPositions: {} };
  await page.presentChain(chain, snapshot, 1);
  assert.equal(page._timeline.loop, true);
  assert.equal(page._timeline.position, snapshot.position);
  assert.equal(page._timeline.rowOffset, snapshot.rowOffset);
  assert.equal(page.data.paused, true);
  assert.equal(page.data.sourceOpen, true);
  assert.equal(page._readingScrollTop, 141);
});

test('failed index writes restore the previous saved snapshot instead of corrupting return history', async () => {
  const api = storage(), store = createChainStore(api), chain = await createCuratedProvider().open('');
  store.put(chain, { position: 42 });
  const write = api.setStorageSync;
  api.setStorageSync = (key, value) => { if (key === PREFIX + 'index') throw new Error('full'); write(key, value); };
  assert.throws(() => store.put(chain, { position: 84 }), /full/);
  assert.equal(createChainStore(api).get(chain.chainId).snapshot.position, 42);
});

test('native layout scroll resets during a chain transition cannot erase the saved reading destination', async () => {
  const chain = await createCuratedProvider().open('');
  let scrolled;
  const page = { ...chainActions, _alive: true, _visible: true, _chainRequest: 1,
    _chainStore: createChainStore(storage()), _provider: {}, _continuation: { cancelUnrelated() {} },
    _renderer: { stop() {}, setFrames() {} }, data: { snapshotReady: true, detailShift: 160 },
    setData(patch, complete) { Object.assign(this.data, patch); if (complete) complete(); },
    beginAction() { return 1; }, updateActive() {}, refreshChainLinks() {},
    captureScene(action, complete) { this._readingScrollTop = 0; complete(); },
    scrollReader(top) { scrolled = top; this._readingScrollTop = top; },
  };
  await page.presentChain(chain, { paused: true, readingScroll: 141 }, 1);
  assert.equal(scrolled, 141);
  assert.equal(page._readingScrollTop, 141);
  assert.equal(page.data.sourceTarget, '');
});

test('revisiting the same edge restores its child snapshot without another provider request', async () => {
  const provider = createCuratedProvider(), api = storage(), store = createChainStore(api);
  const parent = await provider.open(''), frame = parent.frames[0], anchor = frame.anchors[0];
  const input = { chainId: parent.chainId, fromFrameId: frame.id, anchorId: anchor.id };
  const child = await provider.branch(input);
  const snapshot = { position: 1420, rowOffset: 7, ambientPhase: 0.42, paused: true, sourceOpen: true, readingScroll: 96 };
  store.put(parent, { position: 235.52 }); store.put(child, snapshot);
  const reopened = createChainStore(api);
  assert.deepEqual(reopened.child(parent.chainId, frame.id, anchor.id).snapshot, snapshot);
  assert.equal(reopened.child('another-parent', frame.id, anchor.id), null);
  assert.equal(reopened.child(parent.chainId, 'another-frame', anchor.id), null);
  assert.equal(reopened.child(parent.chainId, frame.id, 'another-anchor'), null);
  let prefetched;
  chainActions.refreshChainLinks.call({ _session: parent, data: { active: { passageId: frame.id } }, _chainStore: reopened,
    setData() {}, _continuation: { prefetch(chain, prepared) { prefetched = prepared.anchors; } } });
  assert.ok(prefetched.length > 0);
  assert.ok(!prefetched.some(item => item.id === anchor.id));
  let restored;
  const page = { ...chainActions, _session: parent, _alive: true, _visible: true, _chainRequest: 0,
    data: { chainBusy: false }, _chainStore: reopened,
    _chainFonts: { prepare: async chain => chain },
    _continuation: { setVisible() {}, branch() { assert.fail('A visited edge must not regenerate'); } },
    setData(patch) { Object.assign(this.data, patch); }, saveChain() {}, syncMotion() {}, pulse() {},
    async presentChain(chain, saved) { restored = { chain, saved }; },
  };
  await page.branchFromWord({ detail: { frameId: frame.id, anchorId: anchor.id } });
  assert.equal(restored.chain.chainId, child.chainId);
  assert.deepEqual(restored.saved, snapshot);
  assert.equal(page._retryOperation, null);
});

test('an unfinished child remains retryable rather than being mistaken for a complete cached branch', async () => {
  const provider = createCuratedProvider(), store = createChainStore(storage());
  const parent = await provider.open(''), frame = parent.frames[0], anchor = frame.anchors[0];
  const child = await provider.branch({ chainId: parent.chainId, fromFrameId: frame.id, anchorId: anchor.id });
  child.frames[0].ready = false; store.put(child, {});
  assert.equal(store.child(parent.chainId, frame.id, anchor.id), null);
});

test('an abandoned child cannot hide a completed retry of the same reading edge', async () => {
  const provider = createCuratedProvider(), store = createChainStore(storage());
  const parent = await provider.open(''), frame = parent.frames[0], anchor = frame.anchors[0];
  const child = await provider.branch({ chainId: parent.chainId, fromFrameId: frame.id, anchorId: anchor.id });
  const retry = { ...structuredClone(child), chainId: 'completed-retry' };
  child.frames[0].ready = false; store.put(child, {}); store.put(retry, { readingScroll: 96 });
  assert.equal(store.child(parent.chainId, frame.id, anchor.id).chain.chainId, retry.chainId);
  assert.equal(store.child(parent.chainId, frame.id, anchor.id).snapshot.readingScroll, 96);
});

test('a readable opening head keeps flowing without next cancelling its unfinished explanation', async () => {
  const page = { ...chainActions, _session: { chainId: 'opening', cursor: '0', frames: [{ ordinal: 1, ready: false }] },
    data: { chainBusy: false, paused: false, active: { ordinal: 1 } },
    _continuation: { next() { assert.fail('The opening must finish before next'); } },
    trimChainWindow() { assert.fail('An unfinished head cannot be evicted'); },
  };
  page.checkChainEnd();
  await page.fetchNextChain();
  assert.equal(page._nextRequest, undefined);
});

async function delayedOpening() {
  const chain = await createCuratedProvider().open('');
  chain.frames = [{ ...chain.frames[0], anchors: [] }];
  chain.exhausted = true; chain.cursor = null;
  const head = { ...chain, frames: [{ ...chain.frames[0], ready: false }] };
  let resolve, reject;
  const page = { ...chainActions, _alive: true, _visible: true, _chainRequest: 0,
    _chainStore: createChainStore(storage()), _provider: {},
    data: { shots: [], chainBusy: false, chainPending: false },
    setData(patch) { Object.assign(this.data, patch); },
    initRenderer() {}, beginAction() {}, syncMotion() {},
    updateActive() {
      this.data.active = this._readingLines[this._timeline.index];
      this.refreshChainLinks();
    },
  };
  page._continuation = createContinuation({ open(seed, hooks) {
    const pending = new Promise((a, b) => { resolve = a; reject = b; });
    pending.cancel = () => reject(Object.assign(new Error('CANCELLED'), { cancelled: true }));
    hooks.onEvent({ type: 'head', chain: head });
    return pending;
  } });
  return { page, chain, complete() { resolve(chain); }, fail() { reject(new Error('暂未返回')); } };
}

test('a readable head remains pending until its explanation replaces the same passage in place', async () => {
  const { page, chain, complete } = await delayedOpening();
  const pending = page.openChainSession(''); await tick();
  assert.equal(page.data.chainBusy, false, 'the readable wheel can be paused while the explanation loads');
  assert.equal(page.data.chainPending, true);
  assert.equal(page.data.chainFrame.ready, false);
  const quote = page.data.active.quote;
  page._timeline.position += 32;
  const position = page._timeline.position;
  complete(); await pending;
  assert.equal(page.data.chainPending, false);
  assert.equal(page.data.chainFrame.ready, true);
  assert.equal(page.data.chainFrame.reflection, chain.frames[0].reflection);
  assert.equal(page.data.active.quote, quote);
  assert.equal(page._timeline.position, position);
  page._continuation.dispose();
});

test('cancelling an unfinished opening clears waiting, preserves the quote and allows an explicit retry', async () => {
  const { page, complete } = await delayedOpening();
  const pending = page.openChainSession(''); await tick();
  const quote = page.data.active.quote;
  page.cancelBranch(); complete(); await pending;
  assert.equal(page.data.chainPending, false);
  assert.equal(page.data.chainBusy, false);
  assert.match(page.data.chainError, /再试/);
  assert.equal(page.data.active.quote, quote);
  assert.equal(page.data.chainFrame.ready, false, 'a late completion cannot overwrite a cancelled request');
  let retried;
  page.openChainSession = seed => { retried = seed; };
  page.retryChain();
  assert.equal(retried, '');
  page._continuation.dispose();
});

test('an explanation failure clears waiting and exposes retry beside the readable head', async () => {
  const { page, fail } = await delayedOpening();
  const pending = page.openChainSession(''); await tick();
  fail(); await pending;
  assert.equal(page.data.chainPending, false);
  assert.equal(page.data.chainBusy, false);
  assert.equal(page.data.chainFrame.ready, false);
  assert.equal(page.data.chainError, '暂未返回');
  page._continuation.dispose();
});
