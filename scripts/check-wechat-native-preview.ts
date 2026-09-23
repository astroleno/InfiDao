// Manual integration of the packaged app. Credentials are supplied through a
// private argument file, used in the simulator, then removed in finally.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadEnvConfig } from '@next/env';
import { flowModelConfig } from '../src/lib/flow/model';
const ide = '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide';
const project = path.resolve('miniprogram'), privateFile = path.join(project, 'project.private.config.json');
const before = fs.readFileSync(privateFile, 'utf8');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'infidao-phone-check-'));
let injected = false, secret = '';
function tool(name: string, parameters: string[] = []) {
  const out = execFileSync(ide, ['-c', 'Codex', name, '--project', project, ...parameters], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 1024 * 1024 });
  const result = JSON.parse(out.slice(out.indexOf('{'))); if (!result.ok) throw new Error(result.message); return result.result;
}
function evaluate(source: string, args?: unknown[]) {
  const file = path.join(scratch, 'args.json'), parameters = ['--fn-source', source];
  if (args) { fs.writeFileSync(file, JSON.stringify(args), { mode: 0o600 }); parameters.push('--args-file', file); }
  try { return tool('automation_evaluate', parameters).result.result; }
  finally { if (fs.existsSync(file)) fs.unlinkSync(file); }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  loadEnvConfig(process.cwd()); secret = flowModelConfig().key;
  const privateConfig = JSON.parse(before); privateConfig.setting.urlCheck = false; privateConfig.setting.compileHotReLoad = false;
  fs.writeFileSync(privateFile, JSON.stringify(privateConfig, null, 2) + '\n');
  tool('simulator_open_page', ['--page', 'pages/connect/index']); await sleep(1200);
  evaluate('function(){return new Promise((resolve,reject)=>wx.reLaunch({url:"/pages/connect/index",success:()=>resolve(true),fail:reject}));}');
  evaluate('function(){if(wx.getStorageSync("infidao-native-preview-key-v1"))throw new Error("Existing preview credential; do not overwrite");return true;}');
  injected = true;
  evaluate('function(key){const p=getCurrentPages().slice(-1)[0];if(p.route!=="pages/connect/index")throw new Error("Wrong page");p.onKeyInput({detail:{value:key}});getApp()._nativePhoneQa={connecting:true};p.connect().then(()=>{getApp()._nativePhoneQa.connecting=false;getApp()._nativePhoneQa.connectError=p.data.error;});return {started:true};}', [secret]);
  let state, deadline = Date.now() + 50000;
  do {
    await sleep(1000);
    state = evaluate('function(){const p=getCurrentPages().slice(-1)[0];return {connection:getApp()._nativePhoneQa,route:p.route,error:p.data.error||p.data.chainError,ready:p._session?.frames[0]?.ready,kind:p._provider?.kind,busy:p.data.chainBusy};}');
    if (state.connection?.connectError || state.error) throw new Error(state.connection?.connectError || state.error);
    if (Date.now() > deadline) throw new Error('Packaged preview startup timed out');
  } while (state.route !== 'pages/flow/index' || !state.ready || state.busy);
  console.log(JSON.stringify({ stage: 'native-open', provider: state.kind }));
  evaluate(`function(){
    const p=getCurrentPages().slice(-1)[0],qa=getApp()._nativePhoneQa;
    qa.running=true;qa.checks=[{check:'packaged-native-provider',pass:p._provider.kind==='native'}];
    const fail=p.chainFailure;p.chainFailure=function(error,token){qa.failureCode=error.code;qa.failureFields=error.cause;return fail.call(this,error,token);};
    const wait=async(fn)=>{const at=Date.now();while(!fn()){
      if(p.data.chainError&&!p.data.chainBusy&&!p.data.chainPending){
        if(qa.stage==='next'||p._retryOperation?.type!=='next')throw new Error(p.data.chainError);
        qa.backgroundNextError=p.data.chainError;
      }
      if(Date.now()-at>60000)throw new Error('Timed out: '+qa.stage);await new Promise(r=>setTimeout(r,40));}};
    (async()=>{
      qa.stage='next';const first=p._session.frames[0];await p.fetchNextChain();await wait(()=>p._session.frames.length>=2);
      qa.checks.push({check:'append-preserves-current',pass:p._session.frames[0].id===first.id});
      qa.stage='reading';p.settleReading();await wait(()=>p.data.phase==='reading'&&p.data.snapshotReady);
      const frame=p.data.chainFrame,anchor=frame.anchors.find(a=>a.surface==='meaning')||frame.anchors[0];if(!anchor)throw new Error('No reviewed link');
      const parent=p._session.chainId,snapshot=p.chainSnapshot();qa.stage='branch';
      await p.branchFromWord({detail:{frameId:frame.id,anchorId:anchor.id}});await wait(()=>!p.data.chainBusy&&p._session.chainId!==parent);
      qa.checks.push({check:'branch-matches-word',pass:p._session.frames[0].sourceId===anchor.target.sourceId});
      p.settleReading();await wait(()=>p.data.phase==='reading'&&p.data.snapshotReady);
      qa.stage='return';await p.returnToChain();await wait(()=>p.data.phase==='reading');
      qa.checks.push({check:'return-preserves-position',pass:p._session.chainId===parent&&p._timeline.position===snapshot.position});
      qa.checks.push({check:'graphics-fonts-infinite',pass:p._renderer?.gl.getError()===0&&p._timeline.loop&&!p._session.fontUnavailable});
      qa.stage='lexical-center';
      const rowIndex=p._readingLines.findIndex(line=>line.passageId===first.id&&line.lineIndex===0);
      p.settleReading(rowIndex);await wait(()=>p.data.phase==='reading'&&p.data.snapshotReady);
      p.resumeFlow();await wait(()=>p.data.phase==='flow'&&!p.data.snapshotReady);
      const {projectedGlyphs}=require('flow/scene.js'),{CELL,CENTER_PHASE}=require('flow/timeline.js'),r=p._renderer;
      const boxes=projectedGlyphs(r.vertices,p._timeline.position/CELL-CENTER_PHASE,r.count,r.width,r.height,r.reading,p._timeline.rowOffset,p._timeline.loop);
      const box=boxes.find(b=>b.index===rowIndex&&b.charIndex===1);if(!box)throw new Error('No projected 止 glyph');
      const hit=r.hitText((box.left+box.right)/2,(box.top+box.bottom)/2);
      qa.checks.push({check:'exact-wheel-word',pass:hit?.label==='止'});
      qa.wordParent=p._session.chainId;qa.wordSnapshot=p.chainSnapshot();qa.wordSurface='#ribbon';
      // Use the actual CanvasTouch contract, not browser clientX/clientY.
      qa.point={identifier:1,x:(box.left+box.right)/2,y:(box.top+box.bottom)/2};
      qa.wordStarted=Date.now();qa.stage='await-wheel-tap';
      await wait(()=>p._session.chainId!==qa.wordParent&&!p.data.chainBusy&&!p.data.chainPending);
      qa.checks.push({check:'wheel-tap-branches-contextually',pass:p._session.entry.label==='止'&&p._session.parentChainId===qa.wordParent});
      qa.wordQuote=p._session.frames[0].quote;qa.wordSource=p._session.frames[0].source;
      qa.wordBranchMs=Date.now()-qa.wordStarted;
      p.settleReading();await wait(()=>p.data.phase==='reading'&&p.data.snapshotReady);
      p.openSource();await wait(()=>p.data.sourceOpen&&p.data.sourceMounted);
      qa.sourceParent=p._session.chainId;qa.sourceSnapshot=p.chainSnapshot();
      const original=p.data.chainFrame,parts=p.data.sourceParts;
      let index=parts.findIndex(part=>part.selection&&(part.selection.start<original.quoteStart||part.selection.end>original.quoteEnd)&&part.text.length>1);
      if(index<0)index=parts.findIndex(part=>part.selection&&part.text.length>1);
      if(index<0)index=parts.findIndex(part=>part.selection);
      qa.sourceAnchor=parts[index].anchorId;qa.sourceLabel=parts[index].text;qa.sourceIndex=index;qa.stage='await-source-event';
      await wait(()=>p._session.chainId!==qa.sourceParent&&!p.data.chainBusy&&!p.data.chainPending);
      qa.checks.push({check:'native-original-component-event',pass:p._session.entry.label===qa.sourceLabel&&p._session.parentChainId===qa.sourceParent});
      qa.stage='source-return';await p.returnToChain();await wait(()=>p.data.phase==='reading'&&p.data.sourceOpen);
      qa.checks.push({check:'original-link-return-preserves-position',pass:p._timeline.position===qa.sourceSnapshot.position});
      qa.stage='font-screenshot';await new Promise(resolve=>setTimeout(resolve,400));
      await wait(()=>qa.fontsCaptured);
      qa.stage='word-return';await p.returnToChain();await wait(()=>p.data.phase==='flow'&&!p.data.paused);
      qa.checks.push({check:'word-return-restores-flow-and-position',pass:p._session.chainId===qa.wordParent&&Math.abs(p._timeline.position-qa.wordSnapshot.position)<CELL*.05});
      qa.state=p.getFlowState();qa.stage='done';
    })().catch(e=>{qa.error=e.message;qa.stage='failed';qa.state=p.getFlowState();}).finally(()=>{p._continuation.setVisible(false);p._networkBudget.abortPending();qa.running=false;});return {started:true};
  }`);
  deadline = Date.now() + 200000; let result, lastStage;
  do {
    await sleep(1500); result = evaluate('function(){return getApp()._nativePhoneQa;}');
    if (result.stage !== lastStage) {
      console.log(JSON.stringify({ stage: result.stage })); lastStage = result.stage;
      if (result.stage === 'await-wheel-tap') {
        // DevTools' touchstart helper converts x/y-only input to client(0,0).
        // Deliver the phone's CanvasTouch shape to the actual page handler;
        // WebView pointer dispatch is checked separately through the native UI.
        evaluate('function(){const p=getCurrentPages().slice(-1)[0];p.onTouchStart({touches:[getApp()._nativePhoneQa.point],timeStamp:10});return true;}');
        const pressed = evaluate('function(){const p=getCurrentPages().slice(-1)[0];getApp()._nativePhoneQa.wordSnapshot=p.chainSnapshot();return p.data.wordHit?.label;}');
        if (pressed !== '止') throw new Error('Native touch did not lock the selected word');
        tool('simulator_screenshot', ['--path', '/tmp/infidao-word-pressed.jpg']);
        evaluate('function(){getCurrentPages().slice(-1)[0].onTouchEnd();return true;}');
      }
      if (result.stage === 'await-source-event') {
        // DevTools' page selector cannot address inner custom-component text.
        // Exercise that native component's event route explicitly instead of
        // pretending a tap on its surrounding view hits the selected word.
        evaluate('function(){const p=getCurrentPages().slice(-1)[0],qa=getApp()._nativePhoneQa,c=p.selectComponent("#source-links");if(!c)throw new Error("Missing native source component");c.choose({currentTarget:{dataset:{index:qa.sourceIndex}}});return {selected:qa.sourceLabel};}');
      }
      if (result.stage === 'font-screenshot') {
        const classic = tool('automation_element_action', ['--selector', '.source-fulltext', '--action', 'style', '--name', 'font-family']);
        const body = tool('automation_element_action', ['--selector', '.reading-meaning', '--action', 'style', '--name', 'font-family']);
        console.log(JSON.stringify({ stage: 'font-families', classic, body }));
        if (!String(classic).includes('RunZhiJiaKangXiZidian') || String(body).includes('RunZhi')) throw new Error('Classical and body font stacks were not separated');
        tool('simulator_screenshot', ['--path', '/tmp/infidao-classic-fonts.jpg']);
        evaluate('function(){getApp()._nativePhoneQa.fontsCaptured=true;return true;}');
      }
    }
    if (Date.now() > deadline) throw new Error('Packaged flow timed out');
  } while (result.running);
  fs.writeFileSync('/tmp/infidao-packaged-native-preview.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (result.error || result.checks.some((row: { pass: boolean }) => !row.pass)) process.exitCode = 1;
  else tool('simulator_screenshot', ['--path', '/tmp/infidao-packaged-native-preview.jpg', '--wait', '1']);
}
main().catch(error => { const text = String(error.stdout || error.message); console.error((secret ? text.replaceAll(secret, '[REDACTED]') : text).slice(0, 1600)); process.exitCode = 1; }).finally(() => {
  if (injected) {
    try { evaluate('function(){wx.removeStorageSync("infidao-native-preview-key-v1");const p=getCurrentPages().slice(-1)[0];p._continuation?.dispose();p._networkBudget?.abortPending();getApp()._nativePhoneQa=null;wx.reLaunch({url:"/pages/connect/index"});return {cleared:true};}'); } catch (_) {}
  }
  fs.writeFileSync(privateFile, before); fs.rmSync(scratch, { recursive: true, force: true }); secret = '';
});
