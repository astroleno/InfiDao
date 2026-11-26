/** @jest-environment node */
import { POST } from '@/app/api/flow/route';
import { createSessionToken } from '@/lib/flow/session-identity';
import { runFlow } from '@/lib/flow/service';
import { serverFlowBudget } from '@/lib/flow/request-budget';
import { chargeFlowModel, reserveFlowModels } from '@/lib/flow/model-budget';
import { measureFlowPhase, withFlowTimings } from '@/lib/flow/timings';
import type { FlowChain, FlowEvent } from '@/lib/flow/contracts';
jest.mock('@/lib/flow/service', () => ({ runFlow: jest.fn() }));
jest.mock('@/lib/flow/session-store-server', () => ({ serverSessionStore: jest.fn(async () => ({})) }));
jest.mock('@/lib/flow/request-budget', () => ({ serverFlowBudget: jest.fn() }));
const release = jest.fn(async () => {}), charge = jest.fn(async () => {}), reserveModels = jest.fn(async (_count: number) => {});
const acquire = jest.fn(async () => ({ release, chargeModel: charge, reserveModels }));
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
    await reserveFlowModels(2);
    await chargeFlowModel(); emit({ type: 'head', requestId: 'route-test', chain: {} } as FlowEvent);
    await gate; emit({ type: 'done', requestId: 'route-test', chain: {} } as FlowEvent);
  });
  const response = await POST(request()), reader = response.body!.getReader();
  expect(response.headers.get('x-accel-buffering')).toBe('no');
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"head"');
  expect(release).not.toHaveBeenCalled(); complete();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"done"');
  await reader.read(); expect(charge).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
  expect(reserveModels).toHaveBeenCalledWith(2);
});
test('stream cancellation aborts work and releases occupancy exactly once', async () => {
  let signal!: AbortSignal;
  jest.mocked(runFlow).mockImplementation(async (_, __, abortSignal, emit) => {
    await reserveFlowModels(2);
    signal = abortSignal; emit({ type: 'head', requestId: 'route-test', chain: {} } as FlowEvent);
    await new Promise<void>(resolve => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
  });
  const response = await POST(request()), reader = response.body!.getReader(); await reader.read(); await reader.cancel();
  expect(signal.aborted).toBe(true); expect(release).toHaveBeenCalledTimes(1);
  expect(reserveModels).toHaveBeenCalledWith(2);
});
test('keeps a readable error event and JSON compatibility without leaking implementation errors', async () => {
  jest.mocked(runFlow).mockRejectedValueOnce(new Error('private backend detail'));
  const response = await POST(request(undefined, { accept: 'application/json' })), body = await response.json();
  expect(body.events[0]).toMatchObject({ type: 'error', code: 'UNAVAILABLE' });
  expect(JSON.stringify(body)).not.toContain('private backend detail'); expect(release).toHaveBeenCalledTimes(1);
});

describe('first quote timings', () => {
  const previous = process.env.FLOW_TIMINGS;
  beforeEach(() => { process.env.FLOW_TIMINGS = '1'; });
  afterEach(() => {
    if (previous === undefined) delete process.env.FLOW_TIMINGS;
    else process.env.FLOW_TIMINGS = previous;
    jest.restoreAllMocks();
  });

  const quoteEvent = (type: 'head' | 'progress' | 'frame' | 'done', quote = 'private quote'): FlowEvent => ({
    type, requestId: 'private request', chain: { frames: [{ quote }] } as FlowChain,
  });

  test.each([
    { first: 'head', accept: 'application/x-ndjson', fromStart: 10, fromReview: null },
    { first: 'progress', accept: 'application/x-ndjson', fromStart: 35, fromReview: 15 },
    { first: 'frame', accept: 'application/x-ndjson', fromStart: 70, fromReview: 50 },
    { first: 'done', accept: 'application/x-ndjson', fromStart: 90, fromReview: 70 },
    { first: 'frame', accept: 'application/json', fromStart: null, fromReview: null },
  ] as const)('measures the first $first quote for $accept', async ({ first, accept, fromStart, fromReview }) => {
    let now = 100;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    const log = jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.mocked(runFlow).mockImplementation((_, __, ___, emit) => withFlowTimings('open', async () => {
      now = 110;
      emit(quoteEvent('head', first === 'head' ? undefined : ' '));
      now = 120;
      await measureFlowPhase('review', async () => {
        now = 135;
        emit(quoteEvent('progress', first === 'progress' ? undefined : ''));
        now = 150;
      });
      now = 170;
      if (first !== 'done') emit(quoteEvent('frame'));
      now = 190;
      emit(quoteEvent('done'));
    }));
    const response = await POST(request(undefined, { accept }));
    expect(await response.text()).toContain('"done"');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![1]).not.toContain('private');
    expect(JSON.parse(log.mock.calls[0]![1] as string)).toMatchObject({ firstQuoteMs: fromStart, reviewToFirstQuoteMs: fromReview });
  });

  test('does not count a quote offered after stream cancellation', async () => {
    const log = jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.mocked(runFlow).mockImplementation((_, __, signal, emit) => withFlowTimings('open', () => measureFlowPhase('review', async () => {
      emit(quoteEvent('head', ''));
      await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      emit(quoteEvent('frame'));
    })));
    const response = await POST(request());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![1] as string)).toMatchObject({ firstQuoteMs: null, reviewToFirstQuoteMs: null });
  });
});
