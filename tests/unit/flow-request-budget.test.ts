/** @jest-environment node */
import { createFlowBudget, flowBudgetLimits, type FlowBudgetLimits } from '@/lib/flow/request-budget';
import { MemoryDocumentBackend } from '@/lib/flow/session-store';
import { chargeFlowModel, withFlowModelBudget } from '@/lib/flow/model-budget';

const limits: FlowBudgetLimits = { concurrentSite: 3, concurrentOwner: 1, concurrentIP: 2,
  requestsSite: 20, requestsOwner: 10, requestsIP: 10, modelsSite: 4, modelsOwner: 2, modelsIP: 3 };
function setup(overrides: Partial<FlowBudgetLimits> = {}) {
  let now = 1_800_000_000_000;
  const backend = new MemoryDocumentBackend(() => now);
  const worker = () => createFlowBudget(backend, 'test:budget', { ...limits, ...overrides });
  return { worker, advance(ms: number) { now += ms; } };
}
test('independent workers share concurrency limits; disconnect releases only its own lease', async () => {
  const f = setup(), a = f.worker(), b = f.worker();
  const results = await Promise.allSettled([a.acquire('one', 'ip'), b.acquire('one', 'ip')]);
  expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
  const first = (results.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof a.acquire>>>).value;
  const second = await b.acquire('two', 'ip');
  await expect(a.acquire('three', 'ip')).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await first.release(); const third = await b.acquire('one', 'ip'); await first.release();
  await expect(a.acquire('one', 'other-ip')).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await Promise.all([second.release(), third.release()]);
});
test('model charges are atomic across workers and run before model work', async () => {
  const f = setup(), a = await f.worker().acquire('one', 'ip'), b = await f.worker().acquire('two', 'ip');
  let calls = 0;
  const generate = () => withFlowModelBudget(a.chargeModel, async () => { await chargeFlowModel(); calls++; });
  await generate(); await generate();
  await expect(generate()).rejects.toMatchObject({ code: 'BUDGET_REACHED' }); expect(calls).toBe(2);
  await b.chargeModel(); await expect(b.chargeModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
});
test('expired leases cannot charge; request windows reset without resetting daily model totals', async () => {
  const f = setup({ requestsOwner: 1 });
  const first = await f.worker().acquire('one', 'ip'); await first.chargeModel(); await first.release();
  await expect(f.worker().acquire('one', 'ip')).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  f.advance(60_000); const second = await f.worker().acquire('one', 'ip'); await second.chargeModel();
  await expect(second.chargeModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  f.advance(120_001); await expect(second.chargeModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  f.advance(86400_000); const nextDay = await f.worker().acquire('one', 'ip'); await nextDay.chargeModel();
});
test('site caps also apply when owners and IPs differ, and zero disables new work', async () => {
  const f = setup({ modelsSite: 1, concurrentSite: 2 });
  const a = await f.worker().acquire('a', 'a'), b = await f.worker().acquire('b', 'b');
  await expect(f.worker().acquire('c', 'c')).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await a.chargeModel(); await expect(b.chargeModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await expect(setup({ concurrentSite: 0 }).worker().acquire('a', 'a')).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
});
test('production requires explicit valid limits and a charging context', async () => {
  const original = process.env;
  process.env = { ...original, NODE_ENV: 'production' }; delete process.env.FLOW_MAX_ACTIVE_SITE;
  try {
    expect(flowBudgetLimits).toThrow('在线阅读尚未开放');
    await expect(chargeFlowModel()).rejects.toMatchObject({ code: 'BUDGET_UNCONFIGURED' });
    process.env.FLOW_MAX_ACTIVE_SITE = ' ';
    expect(flowBudgetLimits).toThrow('在线阅读尚未配置好');
  } finally { process.env = original; }
});
