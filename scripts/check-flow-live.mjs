// Manual integration run, never part of CI: calls the configured model via
// the local application. Outputs contain only the fixture inputs and results.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const cases = JSON.parse(await fs.readFile('tests/fixtures/flow-contexts-v1.json', 'utf8'))
  .filter(item => !process.env.FLOW_TEST_CASES || process.env.FLOW_TEST_CASES.split(',').includes(item.id));
const owner = crypto.randomBytes(32).toString('hex');
const origin = process.env.FLOW_TEST_ORIGIN || 'http://127.0.0.1:3000';
const output = process.env.FLOW_TEST_OUTPUT || '/tmp/infidao-flow-live.json';
const results = [];
async function request(payload) {
  const began = performance.now();
  const response = await fetch(origin + '/api/flow', { method: 'POST', headers: {
    'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'x-flow-session': owner },
    body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }), signal: AbortSignal.timeout(45000) });
  const events = [], decoder = new TextDecoder(); let text = '', firstHeadMs, firstReadyMs;
  for await (const chunk of response.body) {
    text += decoder.decode(chunk, { stream: true });
    let at;
    while ((at = text.indexOf('\n')) >= 0) {
      const line = text.slice(0, at); text = text.slice(at + 1);
      if (!line) continue;
      const event = JSON.parse(line); events.push(event);
      if ((event.type === 'head' || event.type === 'frame') && firstHeadMs === undefined) firstHeadMs = Math.round(performance.now() - began);
      if (event.chain?.frames.some(frame => frame.ready) && firstReadyMs === undefined) firstReadyMs = Math.round(performance.now() - began);
    }
  }
  return { events, firstHeadMs, firstReadyMs, totalMs: Math.round(performance.now() - began) };
}
for (const item of cases) {
  try {
    const opening = await request({ op: 'open', seed: item.seed });
    const chain = opening.events.find(event => event.type === 'done')?.chain;
    const frame = chain?.frames.find(node => node.anchors.length);
    let branch;
    if (frame) branch = await request({ op: 'branch', chainId: chain.chainId, fromFrameId: frame.id, anchorId: frame.anchors[0].id });
    results.push({ ...item, opening, branch });
  } catch (error) { results.push({ ...item, error: error.message }); }
  await fs.writeFile(output, JSON.stringify(results, null, 2));
  console.log(item.id, results.at(-1).error || results.at(-1).opening.events.at(-1)?.type);
}
console.log('Saved', output);
