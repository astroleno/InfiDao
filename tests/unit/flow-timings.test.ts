/** @jest-environment node */
import { measureFlowPhase, withFlowTimings } from '@/lib/flow/timings';

const previous = process.env.FLOW_TIMINGS;
afterEach(() => {
  if (previous === undefined) delete process.env.FLOW_TIMINGS;
  else process.env.FLOW_TIMINGS = previous;
  jest.restoreAllMocks();
});

test('disabled timing has no output and preserves results', async () => {
  delete process.env.FLOW_TIMINGS;
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  expect(await withFlowTimings('open', () => measureFlowPhase('plan', async () => 'private result'))).toBe('private result');
  expect(log).not.toHaveBeenCalled();
});

test('records nested phases without content and isolates concurrent requests', async () => {
  process.env.FLOW_TIMINGS = '1';
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  await Promise.all([
    withFlowTimings('open', () => measureFlowPhase('plan', () => measureFlowPhase('model', async () => 'private seed'))),
    withFlowTimings('branch', () => measureFlowPhase('review', async () => 'private reflection')),
  ]);
  const reports = log.mock.calls.map(call => JSON.parse(call[1] as string));
  expect(reports).toHaveLength(2);
  expect(reports.find(report => report.operation === 'open').samples.map((sample: { phase: string }) => sample.phase)).toEqual(['model', 'plan']);
  expect(reports.find(report => report.operation === 'branch').samples.map((sample: { phase: string }) => sample.phase)).toEqual(['review']);
  expect(JSON.stringify(reports)).not.toContain('private');
  for (const report of reports) {
    expect(report.outcome).toBe('ok');
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  }
});

test('failures are measured without exposing or replacing errors', async () => {
  process.env.FLOW_TIMINGS = '1';
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  const error = new Error('private upstream body');
  await expect(withFlowTimings('next', () => measureFlowPhase('model', async () => { throw error; }))).rejects.toBe(error);
  const report = JSON.parse(log.mock.calls[0]![1] as string);
  expect(report.outcome).toBe('error');
  expect(report.samples[0].outcome).toBe('error');
  expect(JSON.stringify(report)).not.toContain(error.message);
  log.mockImplementation(() => { throw new Error('log unavailable'); });
  expect(await withFlowTimings('open', async () => 42)).toBe(42);
});
