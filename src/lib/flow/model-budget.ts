import { AsyncLocalStorage } from 'node:async_hooks';
import { FlowError } from './contracts';
const context = new AsyncLocalStorage<() => Promise<void>>();
export function withFlowModelBudget<T>(charge: () => Promise<void>, work: () => Promise<T>) { return context.run(charge, work); }
export async function chargeFlowModel() {
  const charge = context.getStore();
  if (charge) await charge();
  else if (process.env.NODE_ENV === 'production') throw new FlowError('BUDGET_UNCONFIGURED', '在线阅读尚未开放。', 503);
}
