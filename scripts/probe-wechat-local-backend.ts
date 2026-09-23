// Manual native-runtime trial. No HTTP content server is started.
// Calls the configured DeepSeek model with a public fixture. The private key
// exists only in a mode-0600 temporary argument file and the development runtime.
// Run: npx tsx scripts/probe-wechat-local-backend.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { loadEnvConfig } from '@next/env';

const ide = process.env.WECHAT_IDE || '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide';
const project = path.resolve('miniprogram');
const output = process.env.FLOW_LOCAL_PROBE_OUTPUT || '/tmp/infidao-wechat-local-backend.json';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'infidao-local-trial-'));
const privateFile = path.join(project, 'project.private.config.json');
const originalPrivate = fs.readFileSync(privateFile, 'utf8');
const pageFile = path.join(project, 'pages/flow/index.js');
const originalPage = fs.readFileSync(pageFile, 'utf8');
const probeFile = path.join(project, 'flow/local-backend-probe.generated.js');
const probeHook = "  _createLocalBackendProbe: require('../../flow/local-backend-probe.generated'),\n";
let installed = false;

function evaluate(source: string, args?: unknown[]) {
  const parameters = ['-c', 'Codex', 'automation_evaluate', '--project', project, '--fn-source', source];
  const argsFile = path.join(scratch, 'runtime-args.json');
  if (args) {
    fs.writeFileSync(argsFile, JSON.stringify(args), { mode: 0o600 });
    parameters.push('--args-file', argsFile);
  }
  try {
    const raw = execFileSync(ide, parameters, { encoding: 'utf8', timeout: 25000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.result.result.result;
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string; code?: string };
    let details = failure.stdout || failure.stderr || failure.code || failure.message.split('\n')[0];
    for (const argument of args || []) {
      const key = (argument as { key?: string })?.key;
      if (key) details = details.replaceAll(key, '[REDACTED]');
    }
    throw new Error('Native evaluation failed: ' + details.slice(0, 1800));
  } finally { if (fs.existsSync(argsFile)) fs.unlinkSync(argsFile); }
}

const runtime = String.raw`function(payload) {
  const page = getCurrentPages().slice(-1)[0];
  if (!page?._alive || page._localBackendQa?.running) throw new Error('No idle flow page');
  const qa = page._localBackendQa = { running: true, stage: 'unzip', checks: [], requests: [], operations: [], searches: [], assets: [], model: payload.model };
  const fs = wx.getFileSystemManager(), root = wx.env.USER_DATA_PATH + '/infidao-local-backend-probe';
  const now = () => wx.getPerformance().now();
  let rows = [], pool, poolAt = 0;
  const active = new Set();
  const infidaoProbeHost = {
    loadCorpus: async () => rows,
    config: () => ({ model: payload.model }),
    randomUUID() {
      if (!pool || poolAt + 16 > pool.length) throw new Error('Random pool exhausted');
      const bytes = pool.slice(poolAt, poolAt += 16); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const s = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
    },
    flowJson(system, input, signal) {
      signal.throwIfAborted();
      const began = now(), row = { role: input.frames ? 'review' : input.candidates ? 'node' : 'plan' };
      qa.requests.push(row);
      return new Promise((resolve, reject) => {
        const task = wx.request({ url: payload.endpoint, method: 'POST', timeout: 18000,
          header: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + payload.key },
          data: { model: payload.model, thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
            max_tokens: 4608, temperature: 0.2, stream: false,
            messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] },
          success(response) {
            row.status = response.statusCode;
            try {
              signal.throwIfAborted();
              if (response.statusCode !== 200) throw new Error('Model HTTP ' + response.statusCode);
              const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
              if (result.choices?.[0]?.finish_reason === 'length') throw new Error('MODEL_TRUNCATED');
              resolve(JSON.parse(result.choices?.[0]?.message?.content || ''));
            } catch (error) { reject(error); }
          }, fail(error) { reject(new Error(error.errMsg)); },
          complete() { active.delete(task); row.ms = Math.round(now() - began); signal.removeEventListener('abort', cancel); }
        });
        const cancel = () => task.abort(); active.add(task); signal.addEventListener('abort', cancel);
      });
    }
  };
  const InfiDaoLocalCore = page._createLocalBackendProbe(infidaoProbeHost);
  function controller() {
    let aborted = false; const listeners = new Set();
    return { signal: { get aborted() { return aborted; }, throwIfAborted() { if (aborted) throw Object.assign(new Error('CANCELLED'), { cancelled: true }); },
      addEventListener(type, fn) { listeners.add(fn); }, removeEventListener(type, fn) { listeners.delete(fn); } },
      abort() { aborted = true; listeners.forEach(fn => fn()); } };
  }
  const controls = new Set();
  const provider = {};
  for (const op of ['open', 'branch', 'next']) provider[op] = (input, hooks = {}) => {
    const control = controller(); controls.add(control);
    const record = { op, events: [] }, began = now(); qa.operations.push(record);
    const request = { op, requestId: infidaoProbeHost.randomUUID(), ...(op === 'open' ? { seed: input } : input) };
    let result;
    const pending = InfiDaoLocalCore.runFlow(request, 'native-local-owner', control.signal, event => {
      record.events.push({ type: event.type, ms: Math.round(now() - began), count: event.chain?.frames.length });
      hooks.onEvent?.(event); if (event.type === 'done') result = event.chain;
    }).then(() => {
      record.ms = Math.round(now() - began);
      if (!result) throw new Error('Missing completed node'); return result;
    }).finally(() => controls.delete(control));
    pending.cancel = () => control.abort(); return pending;
  };
  const wait = async (fn, timeout = 6000) => {
    const began = now(); while (!fn()) { if (now() - began > timeout) throw new Error('Page timed out: ' + qa.stage); await new Promise(resolve => setTimeout(resolve, 40)); }
  };
  qa.abort = () => { controls.forEach(c => c.abort()); active.forEach(task => task.abort()); };
  (async () => {
    let began = now();
    await new Promise((resolve, reject) => fs.unzip({ zipFilePath: root + '/assets.zip', targetPath: root, success: resolve, fail: reject }));
    qa.unzipMs = Math.round(now() - began);
    began = now(); const source = fs.readFileSync(root + '/corpus.json', 'utf8'); qa.readMs = Math.round(now() - began);
    began = now(); rows = JSON.parse(source); qa.parseMs = Math.round(now() - began);
    qa.records = rows.length; qa.platform = wx.getDeviceInfo().platform; qa.SDKVersion = wx.getAppBaseInfo().SDKVersion;
    qa.checks.push({ check: 'complete-corpus', pass: rows.length === payload.records });
    qa.stage = 'search';
    for (const sample of payload.queries) {
      const times = []; let found;
      for (let n = 0; n < 3; n++) {
        began = now(); found = InfiDaoLocalCore.rankLexicalCandidates(rows, sample.query, 36);
        times.push(Math.round((now() - began) * 10) / 10); await new Promise(resolve => setTimeout(resolve, 16));
      }
      const ids = found.map(row => row.id);
      const pass = JSON.stringify(ids) === JSON.stringify(sample.ids);
      qa.searches.push({ query: sample.query, ms: times, count: ids.length, parity: pass, first: found[0]?.text.slice(0, 60) });
      qa.checks.push({ check: 'search-parity:' + sample.query, pass });
    }
    const canonical = rows.find(row => row.id === 'rysxguji-daxue-1-3');
    const quote = '物有本末，事有终始。';
    const range = InfiDaoLocalCore.checkedQuote(canonical, quote);
    qa.checks.push({ check: 'local-canonical-range', pass: canonical.text.slice(range.quoteStart, range.quoteEnd) === quote });
    let rejected = 0;
    for (const [row, text] of [[canonical, '物有本末，事有始终。'], [undefined, quote], [canonical, String.fromCharCode(0xe000)]]) {
      try { InfiDaoLocalCore.checkedQuote(row, text); } catch (_) { rejected++; }
    }
    qa.checks.push({ check: 'forged-quotes-rejected', pass: rejected === 3 });
    pool = new Uint8Array(await new Promise((resolve, reject) => wx.getRandomValues({ length: 4096, success: value => resolve(value.randomValues), fail: reject })));
    InfiDaoLocalCore.setupFonts(page, root, qa.assets);
    Object.assign(page._provider, provider);
    qa.stage = 'fonts';
    const prepared = await page._chainFonts.prepare({ frames: [{ quote: '螣蛇无足而飞，梧鼠五技而穷。' }] });
    qa.checks.push({ check: 'native-fonts', pass: !prepared.fontUnavailable });
    if (prepared.fontUnavailable) throw new Error('Native font fixture did not prepare');
    // Bound the paid trial to its explicit operations; this is not a prefetch
    // throughput benchmark. Normal interaction/continuation is restored later.
    page._continuation.prefetch = () => {}; page.checkChainEnd = () => {};
    qa.stage = 'open';
    const previousId = page._session?.chainId, openingAt = now();
    await page.openChainSession('同时接了太多项目，每件都舍不得放下。');
    if (page.data.chainError) throw new Error(page.data.chainError);
    await wait(() => !page.data.chainBusy && page._session?.chainId !== previousId && page._session?.frames[0]?.ready);
    qa.firstReadyMs = Math.round(now() - openingAt);
    const parent = page._session, first = parent.frames[0];
    qa.opening = { quote: first.quote, meaning: first.meaning, reflection: first.reflection, fontUnavailable: parent.fontUnavailable };
    qa.checks.push({ check: 'native-open', pass: first.fullText.slice(first.quoteStart, first.quoteEnd) === first.quote && first.anchors.length > 0 });
    qa.stage = 'next'; await page.fetchNextChain();
    if (page.data.chainError) throw new Error(page.data.chainError);
    qa.checks.push({ check: 'native-next', pass: page._session.frames.length > 1 && page._session.frames[0].id === first.id });
    qa.stage = 'read'; page.settleReading(); await wait(() => page.data.phase === 'reading' && page.data.snapshotReady);
    const frame = page.data.chainFrame, anchor = frame.anchors[0];
    if (!anchor) throw new Error('No reviewed anchor');
    const parentId = page._session.chainId, snapshot = page.chainSnapshot();
    qa.stage = 'branch';
    await page.branchFromWord({ detail: { frameId: frame.id, anchorId: anchor.id } });
    await wait(() => !page.data.chainBusy && page._session.chainId !== parentId);
    const child = page._session;
    qa.branch = { quote: child.frames[0].quote, meaning: child.frames[0].meaning, reflection: child.frames[0].reflection };
    qa.checks.push({ check: 'native-branch', pass: child.frames[0].sourceId === anchor.target.sourceId && child.parentChainId === parentId });
    page.settleReading(); await wait(() => page.data.phase === 'reading' && page.data.snapshotReady);
    qa.stage = 'return'; const calls = qa.requests.length;
    await page.returnToChain(); await wait(() => page.data.phase === 'reading');
    qa.checks.push({ check: 'local-return', pass: page._session.chainId === parentId && page._timeline.position === snapshot.position && qa.requests.length === calls });
    qa.checks.push({ check: 'native-rendering', pass: page._renderer?.gl.getError() === 0 && page._timeline.loop && !page.data.graphicsError && !page._session.fontUnavailable });
    qa.state = page.getFlowState(); qa.stage = 'done';
  })().catch(error => {
    qa.error = error.message || error.errMsg; qa.stage = 'failed';
    qa.state = page.getFlowState(); qa.fonts = page._chainFonts?.stats();
    qa.graphicsFailure = String(page._graphicsFailure?.message || page._graphicsFailure || '');
  }).finally(() => {
    qa.abort(); page._continuation.setVisible(false); payload.key = ''; rows = []; qa.running = false;
  });
  return { started: true };
}`;

async function main() {
  loadEnvConfig(process.cwd());
  const { flowCorpus, checkedQuote } = await import('../src/lib/flow/candidates');
  const { rankLexicalCandidates } = await import('../src/lib/search/lexical');
  const { flowModelConfig } = await import('../src/lib/flow/model');
  const config = flowModelConfig();
  if (new URL(config.endpoint).origin !== 'https://api.deepseek.com') throw new Error('This fixed trial only supports the official DeepSeek endpoint');
  const corpus = await flowCorpus();
  checkedQuote(corpus.find(row => row.id === 'rysxguji-daxue-1-3'), '物有本末，事有终始。');
  const queries = ['知止而后有定', '物有本末', '待时而动', '人有不为也', '以直报怨', '和而不同']
    .map(query => ({ query, ids: rankLexicalCandidates(corpus, query, 36).map(row => row.id) }));
  const corpusFile = path.join(scratch, 'corpus.json');
  fs.writeFileSync(corpusFile, JSON.stringify(corpus));
  fs.cpSync('public/flow-fonts', path.join(scratch, 'flow-fonts'), { recursive: true });
  const archive = path.join(scratch, 'assets.zip');
  execFileSync('zip', ['-q', '-r', archive, 'corpus.json', 'flow-fonts'], { cwd: scratch });
  const adapters: Record<string, string> = {
    'node:crypto': 'export const randomUUID = () => infidaoProbeHost.randomUUID();',
    '@/lib/data/corpus': 'export const loadCorpus = () => infidaoProbeHost.loadCorpus();',
    './model': 'export const flowModelConfig = () => infidaoProbeHost.config(); export const flowJson = (system, input, signal) => infidaoProbeHost.flowJson(system, input, signal);',
  };
  const bundled = await build({ stdin: { contents: 'export {runFlow} from "./src/lib/flow/service"; export {checkedQuote} from "./src/lib/flow/candidates"; export {rankLexicalCandidates} from "./src/lib/search/lexical";',
    resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, minify: true, platform: 'browser', format: 'iife',
    globalName: 'InfiDaoLocalCore', target: 'es2018', plugins: [{ name: 'native-adapters', setup(b) {
      b.onResolve({ filter: /^(node:crypto|@\/lib\/data\/corpus|\.\/model)$/ }, args =>
        adapters[args.path] && (args.path !== './model' || args.importer.includes('/flow/')) ? { path: args.path, namespace: 'native-adapter' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'native-adapter' }, args => ({ contents: adapters[args.path], loader: 'js' }));
    } }] });
  const bundle = bundled.outputFiles[0]!.text;
  if (fs.existsSync(probeFile)) throw new Error('Another native probe bundle already exists');
  const privateConfig = JSON.parse(originalPrivate); privateConfig.setting.urlCheck = false; privateConfig.setting.compileHotReLoad = false;
  fs.writeFileSync(privateFile, JSON.stringify(privateConfig, null, 2) + '\n');
  // Compile the core as a real mini-program module, not runtime eval. The
  // temporary page hook contains no credentials and is removed after the trial.
  // FileSystemManager returns a buffer from a different JS realm in DevTools.
  // Copy the bytes into a local buffer; a typed-array view alone does not copy.
  fs.writeFileSync(probeFile, 'module.exports = function(infidaoProbeHost) { const structuredClone = value => JSON.parse(JSON.stringify(value));\n' + bundle +
    String.raw`
return { ...InfiDaoLocalCore, setupFonts(page, root, assets) {
  const fs = wx.getFileSystemManager(), origin = 'https://infidao-local-assets.invalid';
  const api = Object.create(wx);
  api.getStorageSync = key => key === 'infidao-flow-service' ? origin : wx.getStorageSync(key);
  api.request = options => {
    if (!options.url.startsWith(origin + '/flow-fonts/')) throw new Error('Unexpected content-server request');
    const name = options.url.slice((origin + '/flow-fonts/').length);
    const timer = setTimeout(() => {
      try {
        const binary = options.responseType === 'arraybuffer';
        const data = binary ? new Uint8Array(fs.readFileSync(root + '/flow-fonts/' + name)).slice().buffer : fs.readFileSync(root + '/flow-fonts/' + name, 'utf8');
        assets.push({ name, bytes: data.byteLength || data.length, binary: data instanceof ArrayBuffer });
        options.success({ statusCode: 200, data });
      } catch (error) { assets.push({ name, error: error.message || error.errMsg }); options.fail(error); }
      finally { if (options.complete) options.complete(); }
    }, 0);
    return { abort() { clearTimeout(timer); options.fail({ errMsg: 'request:fail abort' }); if (options.complete) options.complete(); } };
  };
  page._continuation.dispose(); page._networkBudget.abortPending(); page.initChains(api);
} };
};
`);
  installed = true;
  fs.writeFileSync(pageFile, originalPage.replace('  ...chainActions,\n', '  ...chainActions,\n' + probeHook));
  execFileSync(ide, ['-c', 'Codex', 'simulator_refresh', '--project', project], { stdio: 'pipe', timeout: 20000 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log(JSON.stringify({ records: corpus.length, corpusBytes: fs.statSync(corpusFile).size, assetsZipBytes: fs.statSync(archive).size, coreBytes: Buffer.byteLength(bundle) }));
  evaluate('function(){const p=getCurrentPages().slice(-1)[0];if(typeof p._createLocalBackendProbe!=="function")throw new Error("Probe module was not compiled");p._localBackendArchiveChunks=[];const fs=wx.getFileSystemManager(),root=wx.env.USER_DATA_PATH+"/infidao-local-backend-probe";try{fs.rmdirSync(root,true);}catch(_){}fs.mkdirSync(root,true);return {prepared:true};}');
  console.log(JSON.stringify({ stage: 'install-fixture' }));
  // The IDE protocol limits message sizes. Feed the local archive in bounded
  // binary chunks; this is fixture installation, not an HTTP content service.
  const zip = fs.readFileSync(archive);
  for (let offset = 0; offset < zip.length; offset += 48 * 1024) {
    evaluate('function(chunk){getCurrentPages().slice(-1)[0]._localBackendArchiveChunks.push(wx.base64ToArrayBuffer(chunk));return {appended:true};}',
      [zip.subarray(offset, offset + 48 * 1024).toString('base64')]);
    if (offset % (24 * 48 * 1024) === 0) console.log(JSON.stringify({ installedBytes: Math.min(offset + 48 * 1024, zip.length) }));
  }
  evaluate('function(size){const p=getCurrentPages().slice(-1)[0],bytes=new Uint8Array(size);let at=0;for(const chunk of p._localBackendArchiveChunks){bytes.set(new Uint8Array(chunk),at);at+=chunk.byteLength;}delete p._localBackendArchiveChunks;if(at!==size)throw new Error("Incomplete fixture");wx.getFileSystemManager().writeFileSync(wx.env.USER_DATA_PATH+"/infidao-local-backend-probe/assets.zip",bytes.buffer);return {fixtureBytes:at};}', [zip.length]);
  console.log(JSON.stringify({ stage: 'start-native-core' }));
  evaluate(runtime, [{ ...config, records: corpus.length, queries }]);
  const deadline = Date.now() + 100000; let result, lastStage;
  do {
    await new Promise(resolve => setTimeout(resolve, 2000));
    result = evaluate('function(){const qa=getCurrentPages().slice(-1)[0]._localBackendQa; if(!qa)return null; const {abort,...report}=qa; return report;}');
    if (!result) throw new Error('Native probe was unloaded');
    if (result.stage !== lastStage) { console.log(JSON.stringify({ stage: result.stage })); lastStage = result.stage; }
    if (Date.now() > deadline) throw new Error('Native trial timed out');
  } while (result.running);
  Object.assign(result, { corpusBytes: fs.statSync(corpusFile).size, assetsZipBytes: fs.statSync(archive).size, coreBytes: Buffer.byteLength(bundle) });
  if (result.stage === 'done') {
    const screenshot = output.replace(/\.json$/u, '') + '.jpg';
    execFileSync(ide, ['-c', 'Codex', 'simulator_screenshot', '--project', project, '--path', screenshot, '--wait', '1'], { stdio: 'pipe', timeout: 20000 });
    result.screenshot = screenshot;
  }
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.error || result.checks.some((check: { pass: boolean }) => !check.pass)) process.exitCode = 1;
}

main().catch(error => { console.error(String(error.message).slice(0, 500)); process.exitCode = 1; }).finally(() => {
  try { evaluate('function(){const p=getCurrentPages().slice(-1)[0];p._localBackendQa?.abort?.();p._continuation?.dispose();p._networkBudget?.abortPending();try{wx.getFileSystemManager().rmdirSync(wx.env.USER_DATA_PATH+"/infidao-local-backend-probe",true);}catch(_){}wx.reLaunch({url:"/pages/flow/index"});return {cleaned:true};}'); } catch (_) {}
  if (installed) {
    fs.writeFileSync(pageFile, fs.readFileSync(pageFile, 'utf8').replace(probeHook, ''));
    fs.unlinkSync(probeFile);
  }
  fs.writeFileSync(privateFile, originalPrivate);
  fs.rmSync(scratch, { recursive: true, force: true });
  if (installed) {
    try { execFileSync(ide, ['-c', 'Codex', 'simulator_refresh', '--project', project], { stdio: 'pipe', timeout: 20000 }); } catch (_) {}
  }
});
