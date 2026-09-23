const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { KEY, readPreviewKey, savePreviewKey, clearPreviewKey } = require('../flow/native-settings');
const { createNativeProvider } = require('../flow/native-provider');
const { createChainStore } = require('../flow/chain-store');
const { httpError, networkError } = require('../flow/connection-errors');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('connection controls and statuses use simplified Chinese independently of the classical font', () => {
  const template = fs.readFileSync(path.join(__dirname, '../pages/connect/index.wxml'), 'utf8');
  const logic = fs.readFileSync(path.join(__dirname, '../pages/connect/index.js'), 'utf8');
  assert.match(template, /连接并继续/);
  assert.match(logic, /正在验证连接/);
  assert.doesNotMatch(template + logic, /[經聯續讀讓驗證載開為裡來當這時與頁還從點後個預覽連進機貼換僅額試請關]/);
});

test('preview credentials stay device-local and can never enable the release provider', () => {
  const values = new Map(); let version = 'develop';
  const api = { getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }),
    getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, value), removeStorageSync: key => values.delete(key) };
  savePreviewKey(api, 'sk-test-only-not-a-real-key'); assert.equal(readPreviewKey(api), values.get(KEY));
  version = 'release'; assert.equal(readPreviewKey(api), ''); assert.throws(() => savePreviewKey(api, 'sk-test-only-not-a-real-key'), /预览/);
  clearPreviewKey(api); version = 'develop'; assert.equal(readPreviewKey(api), '');
  assert.throws(() => savePreviewKey(api, 'short'), /完整/);
});

test('native preview history stays separate from existing curated history without deleting either', () => {
  const values = new Map();
  const api = { getStorageSync: key => values.get(key), setStorageSync: (key, value) => values.set(key, structuredClone(value)), removeStorageSync: key => values.delete(key) };
  const curated = createChainStore(api), native = createChainStore(api, { prefix: 'infidao-native-chain-v1:' });
  const chain = { chainId: 'a', frames: [{ id: 'f', ordinal: 1 }] };
  curated.put(chain, { position: 10 }); native.put(chain, { position: 20 });
  assert.equal(curated.get('a').snapshot.position, 10); assert.equal(native.get('a').snapshot.position, 20);
  assert.equal(createChainStore(api).get('a').snapshot.position, 10);
});

function fixture() {
  const calls = []; let aborted = 0;
  const api = { getRandomValues({ length, success }) {
    const bytes = crypto.randomBytes(length); success({ randomValues: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }, request(options) { calls.push(options); return { abort() { aborted++; options.fail({ errMsg: 'request:fail abort' }); } }; } };
  const resources = { loadCorpus: async () => [], loadFont: async () => '', manifest: { version: 'test', shards: [] } };
  const factory = host => ({ async runFlow(request, owner, signal, emit) {
    const value = await host.flowJson('public-system', { seed: request.seed }, signal);
    emit({ type: 'done', requestId: request.requestId, chain: { chainId: request.requestId, value } });
  } });
  return { calls, api, provider: createNativeProvider(api, 'sk-fixture-not-a-real-key', { resources, factory }), aborted: () => aborted };
}

test('native generation calls only the official model endpoint and uses the existing complete-node contract', async () => {
  const { calls, provider } = fixture(), events = [];
  const result = provider.open('public thought', { onEvent: value => events.push(value) }); await tick();
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].data.thinking.type, 'disabled'); assert.equal(calls[0].data.stream, false);
  assert.equal(calls[0].header.Authorization, 'Bearer sk-fixture-not-a-real-key');
  calls[0].success({ statusCode: 200, data: { choices: [{ message: { content: '{"verified":true}' } }] } });
  const chain = await result; assert.equal(chain.value.verified, true); assert.equal(events.length, 1);
  assert.match(chain.chainId, /^[a-f0-9-]{36}$/); assert.equal(JSON.stringify(chain).includes('sk-fixture'), false);
  assert.equal(JSON.stringify(provider).includes('sk-fixture'), false);
});

test('cancellation aborts the real task, rejects promptly, and ignores late model success', async () => {
  const { provider, calls, aborted } = fixture(); let events = 0;
  const result = provider.open('', { onEvent() { events++; } }); await tick(); result.cancel();
  await assert.rejects(result, error => error.cancelled); assert.equal(aborted(), 1);
  calls[0].success({ statusCode: 200, data: { choices: [{ message: { content: '{}' } }] } });
  assert.equal(events, 0);
  const early = provider.open(''); early.cancel(); await assert.rejects(early, error => error.cancelled);
  assert.equal(calls.length, 1);
});

test('invalid and truncated responses do not become readable nodes or expose server diagnostics', async () => {
  for (const response of [{ statusCode: 401, data: { error: 'sensitive' } },
    { statusCode: 200, data: { choices: [{ finish_reason: 'length', message: { content: '{}' } }] } },
    { statusCode: 200, data: { choices: [{ message: { content: 'bad-json' } }] } }]) {
    const { provider, calls } = fixture(); const result = provider.open(''); await tick(); calls[0].success(response);
    await assert.rejects(result, error => !/sensitive|sk-fixture/.test(error.message));
  }
});

test('connection errors distinguish transport, credentials, balance and quota without echoing secrets', () => {
  assert.equal(networkError({ errMsg: 'request:fail url not in domain list sk-private-secret' }).code, 'WX_DOMAIN_BLOCKED');
  assert.equal(networkError({ errMsg: 'request:fail timeout' }).code, 'NETWORK_TIMEOUT');
  assert.equal(networkError({ errMsg: 'request:fail SSL certificate failure' }).code, 'TLS_FAILED');
  assert.equal(networkError({ errMsg: 'request:fail DNS resolution failed' }).code, 'DNS_FAILED');
  assert.equal(httpError(401).code, 'DS_KEY_INVALID');
  assert.equal(httpError(402).code, 'DS_BALANCE_EMPTY');
  assert.equal(httpError(403).code, 'DS_ACCESS_DENIED');
  assert.equal(httpError(429).code, 'DS_RATE_LIMITED');
  assert.equal(networkError({ message: 'Bearer sk-private-secret' }).message.includes('sk-private-secret'), false);
});

function connectionPage(options = {}) {
  const file = path.resolve(__dirname, '../pages/connect/index.js'), req = createRequire(file), values = new Map();
  let definition, debug = false, loads = 0, navigations = 0, debugCalls = 0;
  const api = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: options.version || 'develop' } }),
    getWindowInfo: () => ({ statusBarHeight: 44 }), getAppBaseInfo: () => ({ enableDebug: debug }),
    getStorageSync: key => values.get(key), removeStorageSync: key => values.delete(key),
    setStorageSync(key, value) { if (options.storageFailure) throw Object.assign(new Error('Bearer sk-private-secret'), { code: 'STORAGE_ERROR' }); values.set(key, value); },
    request(callbacks) {
      if (options.networkFailure) callbacks.fail(options.networkFailure);
      else callbacks.success(options.response || { statusCode: 200, data: { data: [{ id: 'deepseek-flash' }] } });
      return { abort() {} };
    },
    reLaunch({ success }) { navigations++; success(); },
    setEnableDebug({ enableDebug, success }) { debugCalls++; if (!options.debugNeedsReopen) debug = enableDebug; success(); },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require(name) { return name === '../../flow/generated/resources' ? { loadCorpus() { loads++; return options.loadCorpus ? options.loadCorpus() : Promise.resolve([]); } } : req(name); },
    wx: api, Page(value) { definition = value; }, setTimeout, clearTimeout,
    getCurrentPages: () => [{ route: 'pages/flow/index' }, { route: 'pages/connect/index' }],
  });
  const page = { ...definition, data: structuredClone(definition.data), changes: [], setData(value) { this.changes.push(value); Object.assign(this.data, value); } };
  page.onLoad(); page.onShow(); page.onKeyInput({ detail: { value: 'sk-fixture-not-a-real-key' } });
  return { page, values, state: () => ({ loads, navigations, debugCalls }) };
}

test('the connection page reports domain and authentication failures before downloading or saving', async () => {
  for (const options of [{ networkFailure: { errMsg: 'request:fail url not in domain list' } },
    { response: { statusCode: 401, data: { error: 'sk-private-secret' } } }]) {
    const { page, values, state } = connectionPage(options); await page.connect();
    assert.equal(state().loads, 0); assert.equal(state().navigations, 0); assert.equal(values.has(KEY), false);
    assert.match(page.data.diagnosis, /验证连接.*(WX_DOMAIN_BLOCKED|DS_KEY_INVALID)/);
    assert.equal(JSON.stringify(page.changes).includes('sk-'), false); assert.equal(page.data.busy, false);
  }
});

test('verified credentials survive a resource retry without mislabelling or persisting a failed connection', async () => {
  let rejectLoad = true;
  const { page, values, state } = connectionPage({ loadCorpus: async () => { if (rejectLoad) throw new Error('resource failed sk-private-secret'); return []; } });
  await page.connect();
  assert.match(page.data.error, /Key 已通过/); assert.match(page.data.diagnosis, /加载经文.*CORPUS_LOAD_FAILED/);
  assert.equal(values.has(KEY), false); assert.equal(state().navigations, 0);
  assert.equal(page._draft, 'sk-fixture-not-a-real-key');
  rejectLoad = false; await page.connect();
  assert.equal(values.get(KEY), 'sk-fixture-not-a-real-key'); assert.equal(state().navigations, 1);
  assert.equal(page._draft, ''); assert.equal(page.data.error, ''); assert.equal(JSON.stringify(page.changes).includes('sk-'), false);
});

test('invalid model responses and local storage errors are separate from invalid credentials', async () => {
  const invalid = connectionPage({ response: { statusCode: 200, data: '<html>sk-private-secret</html>' } });
  await invalid.page.connect(); assert.match(invalid.page.data.diagnosis, /DS_RESPONSE_INVALID/); assert.equal(invalid.state().loads, 0);
  const storage = connectionPage({ storageFailure: true }); await storage.page.connect();
  assert.match(storage.page.data.diagnosis, /保存连接.*KEY_SAVE_FAILED/); assert.equal(storage.state().navigations, 0);
  assert.equal(storage.values.has(KEY), false); assert.equal(JSON.stringify(storage.page.changes).includes('sk-'), false);
});

test('debugging is only enabled by the explicit preview action and is unavailable in release', () => {
  const preview = connectionPage(); assert.equal(preview.page.data.debug, false); assert.equal(preview.state().debugCalls, 0);
  preview.page.enablePreviewDebug(); assert.equal(preview.page.data.debug, true); assert.equal(preview.state().debugCalls, 1);
  const release = connectionPage({ version: 'release' }); release.page.enablePreviewDebug(); assert.equal(release.state().debugCalls, 0);
  const reopen = connectionPage({ debugNeedsReopen: true }); reopen.page.enablePreviewDebug();
  assert.equal(reopen.page.data.debug, false); assert.match(reopen.page.data.diagnosis, /WX_DEBUG_REOPEN_REQUIRED/);
});

test('generated native resource imports load every real record and font shard within bounded packages', async () => {
  const file = path.resolve(__dirname, '../flow/generated/resources.js');
  const module = { exports: {} }; const req = () => { throw new Error('Unexpected synchronous resource import'); };
  req.async = target => Promise.resolve(require(path.resolve(path.dirname(file), target)));
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: req, Promise });
  const assets = module.exports, rows = await assets.loadCorpus();
  assert.equal(rows.length, 11722); assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  for (const row of rows) {
    assert.equal(row.lexicalBreaks.at(-1), row.text.length);
    assert.ok(row.lexicalBreaks.every((end, i, all) => Number.isInteger(end) && end > (all[i - 1] || 0)), 'ordered canonical word boundaries');
  }
  assert.equal(rows.find(row => row.id === 'rysxguji-daxue-1-3').text.includes('物有本末，事有终始。'), true);
  for (const shard of assets.manifest.shards) {
    const data = Buffer.from(await assets.loadFont(shard.id), 'base64');
    assert.equal(data.length, shard.bytes); assert.equal(crypto.createHash('sha256').update(data).digest('hex'), shard.sha256);
  }
  const app = require('../app.json');
  for (const pack of app.subPackages.filter(item => item.root.startsWith('packages/local-'))) {
    const folder = path.resolve(__dirname, '..', pack.root);
    assert.ok(fs.readdirSync(folder).reduce((n, name) => n + fs.statSync(path.join(folder, name)).size, 0) < 2 * 1024 * 1024);
  }
});
