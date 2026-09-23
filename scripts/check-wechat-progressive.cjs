// Native integration against a local real-model /api/flow server.
// Requires the project compiled with the current sources and localhost enabled
// only in the developer's private configuration. Never stores API credentials.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ide = process.env.WECHAT_IDE || '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide';
const project = path.resolve('miniprogram');
function evaluate(fn) {
  const raw = execFileSync(ide, ['-c', 'Codex', 'automation_evaluate', '--project', project, '--fn-source', fn.toString()], { encoding: 'utf8', timeout: 20000 });
  const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.result.result.result;
}
async function main() {
  const start = evaluate(function () {
    const p = getCurrentPages().slice(-1)[0];
    if (!p?._alive) throw new Error('No live flow page; reLaunch before running');
    if (p._progressiveQa?.running) throw new Error('A native check is already running');
    const qa = p._progressiveQa = { running: true, stage: 'open', requests: [], checks: [], beforeOrigin: wx.getStorageSync('infidao-flow-service') || '' };
    p._continuation.dispose(); p._networkBudget.abortPending();
    wx.setStorageSync('infidao-flow-service', 'http://127.0.0.1:3000'); p.initChains(wx);
    const began = Date.now();
    for (const method of ['open', 'branch', 'next']) {
      const original = p._provider[method].bind(p._provider);
      p._provider[method] = (input, hooks = {}) => {
        const row = { method, input, beganMs: Date.now() - began, events: [] }; qa.requests.push(row);
        const request = original(input, { ...hooks, onEvent(event) {
          row.events.push({ type: event.type, ms: Date.now() - began - row.beganMs, count: event.chain?.frames.length,
            ready: event.chain?.frames.every(frame => frame.ready), quote: event.chain?.frames[0]?.quote });
          hooks.onEvent?.(event);
        } });
        request.then(() => { row.doneMs = Date.now() - began - row.beganMs; }, error => { row.error = error.message; });
        return request;
      };
    }
    const wait = async (check, timeout = 16000) => {
      const at = Date.now(); while (!check()) {
        if (Date.now() - at > timeout) throw new Error('Timed out in ' + qa.stage);
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    };
    const same = (expected, actual) => expected.position === actual.position && expected.rowOffset === actual.rowOffset &&
      expected.paused === actual.paused && expected.sourceOpen === actual.sourceOpen &&
      expected.readingScroll === actual.readingScroll && JSON.stringify(expected.ribbon) === JSON.stringify(actual.ribbon);
    (async () => {
      await p.openChainSession('');
      await wait(() => p._session?.kind === 'remote' && !p.data.chainBusy && p._session.frames[0].ready);
      qa.firstReadyMs = Date.now() - began;
      qa.stage = 'append';
      const first = p._session.frames[0];
      const originalText = first.quote, originalId = first.id;
      await p.fetchNextChain();
      await wait(() => p._session.frames.length >= 2);
      qa.checks.push({ check: 'next-appends', pass: p._session.frames[0].id === originalId && p._session.frames[0].quote === originalText && p._timeline.loop });
      qa.stage = 'read';
      p.settleReading(); await wait(() => p.data.phase === 'reading' && p.data.snapshotReady, 5000);
      const frame = p.data.chainFrame;
      const anchor = frame.anchors.find(item => item.surface === 'meaning') || frame.anchors[0];
      if (!anchor) throw new Error('No reviewed anchor on current first node');
      const parentId = p._session.chainId, parentSnapshot = p.chainSnapshot();
      qa.parent = { id: parentId, quote: frame.quote, snapshot: parentSnapshot };
      qa.stage = 'branch';
      await p.branchFromWord({ detail: { frameId: frame.id, anchorId: anchor.id } });
      await wait(() => p._session.chainId !== parentId && !p.data.chainBusy);
      const childId = p._session.chainId;
      p.settleReading(); await wait(() => p.data.phase === 'reading' && p.data.snapshotReady, 5000);
      p.scrollReader(30);
      await new Promise(resolve => setTimeout(resolve, 200));
      const childSnapshot = p.chainSnapshot();
      qa.child = { id: childId, quote: p.data.chainFrame.quote, reflection: p.data.chainFrame.reflection, snapshot: childSnapshot };
      qa.checks.push({ check: 'branch-target', pass: p._session.frames[0].sourceId === anchor.target.sourceId });
      qa.stage = 'return';
      await p.returnToChain(); await wait(() => p.data.phase === 'reading', 5000);
      await new Promise(resolve => setTimeout(resolve, 200));
      qa.checks.push({ check: 'parent-restored', pass: p._session.chainId === parentId && same(parentSnapshot, p.chainSnapshot()) });
      qa.stage = 'revisit';
      const edgeCalls = () => qa.requests.filter(row => row.method === 'branch' && row.input.chainId === parentId &&
        row.input.fromFrameId === frame.id && row.input.anchorId === anchor.id).length;
      const calls = edgeCalls();
      await p.branchFromWord({ detail: { frameId: frame.id, anchorId: anchor.id } });
      await wait(() => p.data.phase === 'reading', 5000);
      await new Promise(resolve => setTimeout(resolve, 200));
      qa.checks.push({ check: 'child-restored', pass: p._session.chainId === childId && same(childSnapshot, p.chainSnapshot()) });
      qa.restoredChild = p.chainSnapshot();
      qa.checks.push({ check: 'revisit-no-generation', pass: edgeCalls() === calls });
      qa.checks.push({ check: 'graphics-and-fullscreen', pass: p._renderer.gl.getError() === 0 && p._timeline.loop && p.data.sceneHeight > 600 });
      qa.state = p.getFlowState(); qa.stage = 'done';
    })().catch(error => { qa.error = error.message; qa.stage = 'failed'; }).finally(() => {
      p._continuation.setVisible(false);
      if (qa.beforeOrigin) wx.setStorageSync('infidao-flow-service', qa.beforeOrigin);
      else wx.removeStorageSync('infidao-flow-service');
      qa.running = false;
    });
    return { started: true };
  });
  console.log(JSON.stringify(start));
  let result, lastStage;
  const deadline = Date.now() + 70000;
  do {
    await new Promise(resolve => setTimeout(resolve, 2000));
    result = evaluate(function () { return getCurrentPages().slice(-1)[0]._progressiveQa; });
    if (result.stage !== lastStage) { console.log(JSON.stringify({ stage: result.stage, firstReadyMs: result.firstReadyMs })); lastStage = result.stage; }
    if (Date.now() > deadline) throw new Error('Native check exceeded 70 seconds');
  } while (result.running);
  fs.writeFileSync(process.env.FLOW_NATIVE_OUTPUT || '/tmp/infidao-native-progressive.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ stage: result.stage, firstReadyMs: result.firstReadyMs, checks: result.checks, error: result.error,
    requests: result.requests.map(row => ({ method: row.method, doneMs: row.doneMs, error: row.error,
      events: row.events.map(event => ({ type: event.type, ms: event.ms, ready: event.ready })) })) }, null, 2));
  if (result.error || result.checks.some(check => !check.pass)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
