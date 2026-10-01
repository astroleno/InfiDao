/** @jest-environment node */
import { flowJson } from '@/lib/flow/model';
jest.mock('@/lib/flow/model-budget', () => ({ chargeFlowModel: jest.fn() }));

test('distinguishes model deadlines from caller cancellation', async () => {
  const key = process.env.FLOW_API_KEY;
  process.env.FLOW_API_KEY = 'test-only';
  const timeout = new AbortController();
  const deadline = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async () => {
    timeout.abort(); throw new DOMException('Timeout', 'TimeoutError');
  });
  try {
    await expect(flowJson('', {}, new AbortController().signal)).rejects.toMatchObject({ code: 'MODEL_TIMEOUT', status: 504 });
    const caller = new AbortController();
    fetcher.mockImplementation(async () => { caller.abort(); throw new DOMException('Cancelled', 'AbortError'); });
    await expect(flowJson('', {}, caller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    deadline.mockRestore(); fetcher.mockRestore();
    if (key === undefined) delete process.env.FLOW_API_KEY; else process.env.FLOW_API_KEY = key;
  }
});
