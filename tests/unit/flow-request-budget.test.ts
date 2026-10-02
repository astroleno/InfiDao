/** @jest-environment node */
import { createFlowBudget, flowBudgetLimits, type FlowBudgetLimits } from '@/lib/flow/request-budget';
import { MemoryDocumentBackend } from '@/lib/flow/session-store';
import { chargeFlowModel, reserveFlowModels, withFlowModelBudget } from '@/lib/flow/model-budget';

const limits: FlowBudgetLimits = { concurrentSite: 3, concurrentOwner: 1, concurrentIP: 2,
  requestsSite: 20, requestsOwner: 10, requestsIP: 10, modelsSite: 4, modelsOwner: 2, modelsIP: 3 };
function setup(overrides: Partial<FlowBudgetLimits> = {}) {
  let now = 1_800_000_000_000;
  const backend = new MemoryDocumentBackend(() => now);
  const worker = () => createFlowBudget(backend, 'test:budget', { ...limits, ...overrides });
  return { worker, backend, advance(ms: number) { now += ms; } };
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
  const generate = () => withFlowModelBudget(a, async () => { await chargeFlowModel(); calls++; });
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
    await expect(reserveFlowModels(2)).rejects.toMatchObject({ code: 'BUDGET_UNCONFIGURED' });
    process.env.FLOW_MAX_ACTIVE_SITE = ' ';
    expect(flowBudgetLimits).toThrow('在线阅读尚未配置好');
  } finally { process.env = original; }
});

test('reservation is atomic across workers and cannot be stolen by unreserved calls', async () => {
  const f = setup({ modelsSite: 3, modelsOwner: 3, modelsIP: 3 });
  const a = await f.worker().acquire('a', 'a'), b = await f.worker().acquire('b', 'b');
  const results = await Promise.allSettled([a.reserveModels(3), b.reserveModels(3)]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  const winner = results[0]!.status === 'fulfilled' ? a : b, loser = winner === a ? b : a;
  await expect(loser.chargeModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  const before = JSON.parse((await f.backend.read('test:budget')).value!);
  expect(before.counters.site.models).toBe(0);
  await winner.chargeModel(); await winner.chargeModel(); await winner.chargeModel();
  await expect(winner.chargeModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
});

test.each(['owner', 'ip'] as const)('holds also enforce the %s cap independently', async scope => {
  const f = setup({ concurrentOwner: 2, modelsSite: 20, modelsOwner: scope === 'owner' ? 3 : 20, modelsIP: scope === 'ip' ? 3 : 20 });
  const a = await f.worker().acquire('a', 'a');
  const b = await f.worker().acquire(scope === 'owner' ? 'a' : 'b', scope === 'ip' ? 'a' : 'b');
  await a.reserveModels(2);
  await expect(b.reserveModels(2)).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await b.reserveModels(1); await b.chargeModel(); await a.chargeModel(); await a.chargeModel();
});

test.each(['release', 'expiry'] as const)('%s returns unused holds but never refunds actual calls', async ending => {
  const f = setup({ modelsSite: 3, modelsOwner: 3, modelsIP: 3 });
  const a = await f.worker().acquire('a', 'a');
  await a.reserveModels(3); await a.chargeModel();
  if (ending === 'release') await a.release(); else f.advance(120_001);
  const b = await f.worker().acquire('a', 'a');
  await expect(b.reserveModels(3)).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await b.reserveModels(2); await b.chargeModel(); await b.chargeModel();
  await expect(a.reserveModels(1)).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await expect(a.chargeModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
});

test('live holds survive the UTC day boundary while daily actual usage resets', async () => {
  const f = setup({ modelsSite: 3, modelsOwner: 3, modelsIP: 3 });
  const now = (await f.backend.read('test:budget')).now;
  f.advance(86400_000 - now % 86400_000 - 1000);
  const a = await f.worker().acquire('a', 'a');
  await a.reserveModels(3); await a.chargeModel();
  f.advance(2000);
  const b = await f.worker().acquire('b', 'b');
  await expect(b.reserveModels(2)).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  await b.reserveModels(1); await b.chargeModel(); await a.chargeModel(); await a.chargeModel();
  expect(JSON.parse((await f.backend.read('test:budget')).value!).counters.site.models).toBe(3);
});

test('a failed optional repair hold preserves the mandatory review allowance', async () => {
  const a = await setup({ modelsSite: 3, modelsOwner: 3, modelsIP: 3 }).worker().acquire('a', 'a');
  await withFlowModelBudget(a, async () => {
    await reserveFlowModels(3); await chargeFlowModel(); await chargeFlowModel();
    await expect(reserveFlowModels(1)).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
    await chargeFlowModel();
    await expect(chargeFlowModel()).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  });
});
