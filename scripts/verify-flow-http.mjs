// Exercise one bounded, real online opening through the running app and proxy.
import { randomUUID } from 'node:crypto';
const base = process.argv[2]?.replace(/\/$/, '');
if (!base || !/^https?:\/\//.test(base)) throw new Error('Pass the preview origin');
const headers = { origin: base, 'content-type': 'application/json' };
const session = await fetch(base + '/api/flow/session', { method: 'POST', headers, body: '{}' });
const cookie = session.headers.get('set-cookie')?.split(';')[0];
if (!session.ok || !cookie) throw new Error('Anonymous session issue failed: ' + session.status);
const requestId = randomUUID(), start = Date.now();
const response = await fetch(base + '/api/flow', { method: 'POST', headers: { ...headers, cookie, accept: 'application/x-ndjson' },
  body: JSON.stringify({ op: 'open', requestId }) });
if (!response.ok || !response.body || response.headers.get('x-accel-buffering') !== 'no') throw new Error('Streaming route failed: ' + response.status);
const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
const observed = []; let pending = '';
for (;;) {
  const { done, value } = await reader.read();
  pending += decoder.decode(value || new Uint8Array(), { stream: !done });
  let split;
  while ((split = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, split); pending = pending.slice(split + 1);
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.requestId !== requestId) throw new Error('Crossed stream identity');
    observed.push({ type: event.type, elapsedMs: Date.now() - start, code: event.code,
      chainId: event.chain?.chainId, ready: event.chain?.frames?.[0]?.ready });
  }
  if (done) break;
}
if (pending.trim()) throw new Error('Incomplete final event');
if (observed.map(event => event.type).join(',') !== 'head,frame,done' || !observed[2].ready ||
  observed[0].elapsedMs >= observed[2].elapsedMs) throw new Error('Online stream incomplete: ' + JSON.stringify(observed));
console.log(JSON.stringify({ origin: base, events: observed }));
