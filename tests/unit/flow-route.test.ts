/** @jest-environment node */
import { POST } from '@/app/api/flow/route';
import { createSessionToken } from '@/lib/flow/session-identity';
import { runFlow } from '@/lib/flow/service';
import { serverFlowBudget } from '@/lib/flow/request-budget';
import { chargeFlowModel } from '@/lib/flow/model-budget';
import type { FlowEvent } from '@/lib/flow/contracts';
jest.mock('@/lib/flow/service', () => ({ runFlow: jest.fn() }));
jest.mock('@/lib/flow/session-store-server', () => ({ serverSessionStore: jest.fn(async () => ({})) }));
jest.mock('@/lib/flow/request-budget', () => ({ serverFlowBudget: jest.fn() }));
const release = jest.fn(async () => {}), charge = jest.fn(async () => {}), acquire = jest.fn(async () => ({ release, chargeModel: charge }));
let originalResponse: typeof Response;
beforeAll(async () => {
  // The shared Jest setup substitutes a JSON-only Response. Streaming needs Node's native class.
  originalResponse = globalThis.Response;
  const native = await fetch('data:,');
  Object.assign(globalThis, { Response: native.constructor });
});
afterAll(() => { Object.assign(globalThis, { Response: originalResponse }); });
function request(body: unknown = { op: 'open', requestId: 'route-test' }, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/flow', { method: 'POST', body: JSON.stringify(body), headers: {
    origin: 'http://localhost', cookie: 'infidao_flow=' + createSessionToken(), accept: 'application/x-ndjson', ...headers,
  } });
}
beforeEach(() => { jest.clearAllMocks(); jest.mocked(serverFlowBudget).mockResolvedValue({ acquire }); });
test('rejects untrusted identities and origins before model execution', async () => {
  expect((await POST(request(undefined, { cookie: '', 'x-flow-session': 'a'.repeat(32) }))).status).toBe(401);
  expect((await POST(request(undefined, { origin: 'https://other.invalid' }))).status).toBe(403);
  expect(runFlow).not.toHaveBeenCalled(); expect(acquire).not.toHaveBeenCalled();
});
test('streams head before completion and charges each model invocation in request context', async () => {
  let complete!: () => void;
  const gate = new Promise<void>(resolve => { complete = resolve; });
  jest.mocked(runFlow).mockImplementation(async (_, __, ___, emit) => {
    await chargeFlowModel(); emit({ type: 'head', requestId: 'route-test', chain: {} } as FlowEvent);
    await gate; emit({ type: 'done', requestId: 'route-test', chain: {} } as FlowEvent);
  });
  const response = await POST(request()), reader = response.body!.getReader();
  expect(response.headers.get('x-accel-buffering')).toBe('no');
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"head"');
  expect(release).not.toHaveBeenCalled(); complete();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"done"');
  await reader.read(); expect(charge).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
});
test('stream cancellation aborts work and releases occupancy exactly once', async () => {
  let signal!: AbortSignal;
  jest.mocked(runFlow).mockImplementation(async (_, __, abortSignal, emit) => {
    signal = abortSignal; emit({ type: 'head', requestId: 'route-test', chain: {} } as FlowEvent);
    await new Promise<void>(resolve => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
  });
  const response = await POST(request()), reader = response.body!.getReader(); await reader.read(); await reader.cancel();
  expect(signal.aborted).toBe(true); expect(release).toHaveBeenCalledTimes(1);
});
test('keeps a readable error event and JSON compatibility without leaking implementation errors', async () => {
  jest.mocked(runFlow).mockRejectedValueOnce(new Error('private backend detail'));
  const response = await POST(request(undefined, { accept: 'application/json' })), body = await response.json();
  expect(body.events[0]).toMatchObject({ type: 'error', code: 'UNAVAILABLE' });
  expect(JSON.stringify(body)).not.toContain('private backend detail'); expect(release).toHaveBeenCalledTimes(1);
});
