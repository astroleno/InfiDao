// Manual, localhost-only probe. Uses fixed public fixtures, never user input.
// node scripts/probe-flow-stream.mjs; then scripts/check-wechat-stream.cjs
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const port = Number(process.env.FLOW_PROBE_PORT || 3211);
const key = process.env.FLOW_API_KEY || process.env.DEEPSEEK_API_KEY ||
  (process.env.LLM_MODEL_SECONDARY?.includes('deepseek') ? process.env.LLM_API_KEY_SECONDARY : '');
const base = process.env.FLOW_BASE_URL || process.env.DEEPSEEK_BASE_URL ||
  (process.env.LLM_MODEL_SECONDARY?.includes('deepseek') ? process.env.LLM_BASE_URL_SECONDARY : '') || 'https://api.deepseek.com';
const endpoint = /\/chat\/completions\/?$/.test(base) ? base : base.replace(/\/$/, '') + '/chat/completions';
const model = process.env.FLOW_MODEL || 'deepseek-flash';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
http.createServer(async (req, res) => {
  if (!['/transport', '/flash'].includes(req.url)) { res.writeHead(404).end(); return; }
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const began = performance.now();
  const emit = value => { if (!res.destroyed) res.write(JSON.stringify(value) + '\n'); };
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  try {
    if (req.url === '/transport') {
      for (const text of ['知止而後有定。', '物有本末，事有終始。', '𠮷，繁簡與標點。']) {
        const bytes = Buffer.from(JSON.stringify({ type: 'text', text }) + '\n');
        // Deliberately split a Chinese character between separate writes.
        const cut = bytes.indexOf(Buffer.from(text[0])) + 1;
        res.write(bytes.subarray(0, cut)); await sleep(150);
        if (res.destroyed) return;
        res.write(bytes.subarray(cut)); await sleep(300);
        if (res.destroyed) return;
      }
    } else {
      if (!key) throw new Error('Model credentials unavailable');
      const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, stream: true, thinking: { type: 'disabled' }, max_tokens: 400, temperature: 0.2,
          messages: [{ role: 'system', content: '依据提供的经典，写一段60至100字中文阅读短解。保留原义，不诊断读者，不编造引文，只输出正文。' },
            { role: 'user', content: '原文：物有本末，事有终始。知所先后，则近道矣。出处：《大学》。一念：我有很多事想做，却不知道先做哪一件。' }] }) });
      if (!response.ok) throw new Error('Model HTTP ' + response.status);
      const decoder = new TextDecoder(); let pending = '', finished = false;
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        let at;
        while ((at = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, at).trim(); pending = pending.slice(at + 1);
          if (!line.startsWith('data:')) continue;
          const value = line.slice(5).trim();
          if (value === '[DONE]') { finished = true; continue; }
          const event = JSON.parse(value);
          const choice = event.choices?.[0];
          if (choice?.delta?.content) emit({ type: 'text', text: choice.delta.content });
          if (choice?.finish_reason === 'length') throw new Error('Truncated output');
        }
      }
      if (!finished) throw new Error('Incomplete stream');
    }
    emit({ type: 'done', elapsedMs: Math.round(performance.now() - began) });
  } catch (error) { if (!controller.signal.aborted) emit({ type: 'error', message: error.message }); }
  finally { res.end(); }
}).listen(port, '127.0.0.1', () => console.log(JSON.stringify({ probe: 'ready', port, model, configured: !!key })));
