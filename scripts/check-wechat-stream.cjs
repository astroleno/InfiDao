// Runs the probe inside the real WeChat JS runtime, not a wx.request mock.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createEventDecoder } = require('../miniprogram/flow/remote-provider');
const ide = process.env.WECHAT_IDE || '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide';
const project = path.resolve('miniprogram');
const origin = 'http://127.0.0.1:' + (process.env.FLOW_PROBE_PORT || '3211');
const output = process.env.FLOW_PROBE_OUTPUT || '/tmp/infidao-wechat-stream.json';
const fn = `async function() {
  const results = [];
  for (const mode of ['transport', 'flash', 'cancel']) {
    results.push(await new Promise(resolve => {
      const began = Date.now(), events = [], chunks = []; let text = '', settled = false, timer;
      const done = extra => { if (settled) return; settled = true; clearTimeout(timer); resolve({ mode, chunks, events, text, elapsedMs: Date.now()-began, ...extra }); };
      const decoder = (${createEventDecoder.toString()})(event => { events.push({ type: event.type, at: Date.now()-began }); if (event.text) text += event.text; });
      const task = wx.request({ url: ${JSON.stringify(origin)} + (mode === 'flash' ? '/flash' : '/transport'),
        enableChunked: true, responseType: 'arraybuffer', timeout: 25000,
        success(result) { try { if (!chunks.length) decoder.push(result.data, true); else decoder.push(null, true); done({ status: result.statusCode, success: true }); } catch (error) { done({ error: error.message }); } },
        fail(error) { done({ error: error.errMsg, cancelled: mode === 'cancel' && /abort/i.test(error.errMsg) }); }
      });
      if (typeof task.onChunkReceived !== 'function') { task.abort(); done({ error: 'No onChunkReceived' }); return; }
      task.onChunkReceived(({data}) => { if (settled) return; chunks.push({ bytes: data.byteLength, at: Date.now()-began }); try { decoder.push(data); } catch (error) { task.abort(); done({error: error.message}); } });
      if (mode === 'cancel') timer = setTimeout(() => task.abort(), 200);
    }));
  }
  return { platform: wx.getDeviceInfo().platform, results };
}`;
const raw = execFileSync(ide, ['-c', 'Codex', 'automation_evaluate', '--project', project, '--fn-source', fn], { encoding: 'utf8', timeout: 60000 });
const parsed = JSON.parse(raw.slice(raw.indexOf('{')));
const result = parsed.result?.result?.result;
fs.writeFileSync(output, JSON.stringify(result || parsed, null, 2));
console.log(JSON.stringify(result ? { platform: result.platform, results: result.results.map(item => ({ mode: item.mode,
  chunks: item.chunks.length, firstTextMs: item.events.find(event => event.type === 'text')?.at,
  totalMs: item.elapsedMs, text: item.text, success: item.success, cancelled: item.cancelled, error: item.error })) } : parsed, null, 2));
const expected = '知止而後有定。物有本末，事有終始。𠮷，繁簡與標點。';
if (!result?.results?.every(item => item.mode === 'cancel' ? item.cancelled && !item.events.some(event => event.type === 'done') :
  item.success && item.events.some(event => event.type === 'done') && item.chunks.length > 1 &&
  (item.mode !== 'transport' || item.text === expected))) process.exitCode = 1;
