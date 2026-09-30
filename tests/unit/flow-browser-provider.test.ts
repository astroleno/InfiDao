/** @jest-environment node */
import { createRemoteFlowProvider } from '@/lib/flow-browser/provider';
const chain = { chainId: 'a', kind: 'remote', frames: [{ id: 'f', quote: '知止𠮷', fullText: '知止𠮷', quoteStart: 0, quoteEnd: 4, ready: false, anchors: [] }] };
const response = (chunks: Uint8Array[], status = 200) => ({ ok: status === 200, status, headers: { get: () => 'application/x-ndjson' },
  body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }),
  json: async () => ({ error: { code: 'BUSY', message: '稍后再试' } }),
}) as unknown as Response;
function fixture(chunks: Uint8Array[], status = 200) {
  const fetcher = jest.fn(async (url: any) => String(url).endsWith('/session') ? { ok: true } as Response : response(chunks, status));
  return { fetcher, provider: createRemoteFlowProvider({ fetch: fetcher }) };
}
const wire = (events: unknown[]) => new TextEncoder().encode(events.map(value => JSON.stringify(value)).join('\n') + '\n');
test('streaming Chinese and supplementary characters survive every byte boundary; head arrives before done', async () => {
  const complete = { ...chain, frames: [{ ...chain.frames[0], ready: true }] };
  const bytes = wire([{ type: 'head', requestId: 'r', chain }, { type: 'frame', requestId: 'r', chain: complete }, { type: 'done', requestId: 'r', chain: complete }]);
  for (let split = 1; split < bytes.length; split++) {
    const f = fixture([bytes.slice(0, split), bytes.slice(split)]), events: string[] = [];
    const result = await f.provider.open('', { requestId: 'r', onEvent: event => events.push(event.type) });
    expect(result.frames[0]?.quote).toBe('知止𠮷'); expect(events).toEqual(['head', 'frame', 'done']);
  }
});
test('a truncated reply rejects but leaves its emitted head available for recovery', async () => {
  const f = fixture([wire([{ type: 'head', requestId: 'r', chain }])]), events: unknown[] = [];
  await expect(f.provider.open('', { requestId: 'r', onEvent: event => events.push(event) })).rejects.toMatchObject({ code: 'INCOMPLETE' });
  expect(events).toHaveLength(1);
});
test('ignores other request IDs and rejects malformed quote identity', async () => {
  const f = fixture([wire([{ type: 'done', requestId: 'old', chain }, { type: 'done', requestId: 'r', chain: { ...chain, frames: [{ ...chain.frames[0], quote: '伪造' }] } }])]);
  await expect(f.provider.open('', { requestId: 'r' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
test('cancellation aborts a pending anonymous session request and never begins content generation', async () => {
  let signal!: AbortSignal;
  const fetcher = jest.fn((_url: any, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    signal = init!.signal!; signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const provider = createRemoteFlowProvider({ fetch: fetcher }), task = provider.open('');
  task.cancel(); await expect(task).rejects.toMatchObject({ cancelled: true });
  expect(signal.aborted).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
});
test('resume preserves chain identity and request ID and uses only same-origin credentials', async () => {
  const f = fixture([wire([{ type: 'done', requestId: 'resume-id', chain }])]);
  await f.provider.resume({ chainId: 'a' }, { requestId: 'resume-id' });
  const request = (f.fetcher.mock.calls as any)[1][1];
  expect(request.credentials).toBe('same-origin');
  expect(JSON.parse(request.body)).toEqual({ op: 'open', chainId: 'a', requestId: 'resume-id' });
  expect(request.headers['x-flow-session']).toBeUndefined();
});
test('HTTP budget errors retain the server code and message', async () => {
  const f = fixture([], 429);
  await expect(f.provider.open('')).rejects.toMatchObject({ code: 'BUSY', message: '稍后再试' });
});

test('transport failures show a readable message instead of Failed to fetch', async () => {
  const provider = createRemoteFlowProvider({ fetch: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
  await expect(provider.open('')).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE', message: expect.stringContaining('检查网络') });
});

test('malformed streamed JSON is reported as an incomplete service response', async () => {
  const f = fixture([new TextEncoder().encode('{broken}\n')]);
  await expect(f.provider.open('')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: '阅读服务的回复不完整，请重试。' });
});
