import { AsyncLocalStorage } from 'node:async_hooks';
import { FlowError } from './contracts';
type ModelBudget = { chargeModel: () => Promise<void>; reserveModels: (count: number) => Promise<void> };
const context = new AsyncLocalStorage<ModelBudget>();
export function withFlowModelBudget<T>(budget: ModelBudget, work: () => Promise<T>) { return context.run(budget, work); }
export async function reserveFlowModels(count: number) {
  const budget = context.getStore();
  if (budget) await budget.reserveModels(count);
  else if (process.env.NODE_ENV === 'production') throw new FlowError('BUDGET_UNCONFIGURED', '在线阅读尚未开放。', 503);
}
export async function chargeFlowModel() {
  const budget = context.getStore();
  if (budget) await budget.chargeModel();
  else if (process.env.NODE_ENV === 'production') throw new FlowError('BUDGET_UNCONFIGURED', '在线阅读尚未开放。', 503);
}
