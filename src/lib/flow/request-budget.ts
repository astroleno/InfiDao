import { randomUUID } from 'node:crypto';
import { FlowError } from './contracts';
import { MemoryDocumentBackend, type AtomicDocumentBackend } from './session-store';
import { createRedisDocumentBackend, flowRedis } from './session-store-server';

export type FlowBudgetLimits = {
  concurrentSite: number; concurrentOwner: number; concurrentIP: number;
  requestsSite: number; requestsOwner: number; requestsIP: number;
  modelsSite: number; modelsOwner: number; modelsIP: number;
};
type Counters = { minute: number; requests: number; day: number; models: number; updated: number };
type BudgetDocument = { active: Record<string, { owner: string; ip: string; expiresAt: number; reservedModels?: number }>; counters: Record<string, Counters> };
const limited = () => new FlowError('BUDGET_REACHED', '先读一会儿，稍后再展开新的联系。', 429);

export function flowBudgetLimits(): FlowBudgetLimits {
  const limit = (name: string, development: number) => {
    const raw = process.env[name];
    if (raw === undefined && process.env.NODE_ENV === 'production') throw new FlowError('BUDGET_UNCONFIGURED', '在线阅读尚未开放，已保存的经文仍可阅读。', 503);
    const value = raw === undefined ? development : Number(raw);
    if (raw?.trim() === '' || !Number.isInteger(value) || value < 0 || value > 1_000_000) throw new FlowError('BUDGET_UNCONFIGURED', '在线阅读尚未配置好。', 503);
    return value;
  };
  return {
    concurrentSite: limit('FLOW_MAX_ACTIVE_SITE', 8), concurrentOwner: limit('FLOW_MAX_ACTIVE_OWNER', 2), concurrentIP: limit('FLOW_MAX_ACTIVE_IP', 4),
    requestsSite: limit('FLOW_REQUESTS_MINUTE_SITE', 120), requestsOwner: limit('FLOW_REQUESTS_MINUTE_OWNER', 30), requestsIP: limit('FLOW_REQUESTS_MINUTE_IP', 60),
    modelsSite: limit('FLOW_MODEL_CALLS_DAY_SITE', 200), modelsOwner: limit('FLOW_MODEL_CALLS_DAY_OWNER', 100), modelsIP: limit('FLOW_MODEL_CALLS_DAY_IP', 150),
  };
}

export function createFlowBudget(backend: AtomicDocumentBackend, key: string, limits: FlowBudgetLimits, createId = randomUUID) {
  async function mutate<T>(change: (document: BudgetDocument, now: number) => T) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const saved = await backend.read(key);
      const document: BudgetDocument = saved.value ? JSON.parse(saved.value) : { active: {}, counters: {} };
      for (const [id, entry] of Object.entries(document.active)) if (entry.expiresAt <= saved.now) delete document.active[id];
      for (const [id, entry] of Object.entries(document.counters)) if (entry.updated + 2 * 86400_000 <= saved.now) delete document.counters[id];
      const result = change(document, saved.now);
      if (Object.keys(document.counters).length > 8192) throw limited();
      if (await backend.compareSwap(key, saved.value, JSON.stringify(document), 2 * 86400_000) === 'ok') return result;
    }
    throw limited();
  }
  function counter(document: BudgetDocument, id: string, now: number) {
    const minute = Math.floor(now / 60_000), day = Math.floor(now / 86400_000);
    const entry = document.counters[id] || { minute, day, requests: 0, models: 0, updated: now };
    if (entry.minute !== minute) { entry.minute = minute; entry.requests = 0; }
    if (entry.day !== day) { entry.day = day; entry.models = 0; }
    entry.updated = now; document.counters[id] = entry; return entry;
  }
  return {
    async acquire(owner: string, ip: string) {
      const token = createId();
      const scopes = ['site', 'owner:' + owner, 'ip:' + ip];
      await mutate((document, now) => {
        const active = Object.values(document.active);
        if (active.length >= limits.concurrentSite || active.filter(entry => entry.owner === owner).length >= limits.concurrentOwner ||
          active.filter(entry => entry.ip === ip).length >= limits.concurrentIP) throw limited();
        const counters = scopes.map(id => counter(document, id, now));
        const caps = [limits.requestsSite, limits.requestsOwner, limits.requestsIP];
        if (counters.some((entry, index) => entry.requests >= caps[index]!)) throw limited();
        counters.forEach(entry => entry.requests++);
        // Route execution has a 90 s deadline; this lease also clears on disconnect.
        document.active[token] = { owner, ip, expiresAt: now + 120_000 };
      });
      function held(document: BudgetDocument) {
        const active = Object.values(document.active);
        return [active, active.filter(entry => entry.owner === owner), active.filter(entry => entry.ip === ip)]
          .map(entries => entries.reduce((total, entry) => total + (entry.reservedModels || 0), 0));
      }
      const caps = [limits.modelsSite, limits.modelsOwner, limits.modelsIP];
      return {
        async reserveModels(count: number) {
          if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid model reservation');
          await mutate((document, now) => {
            const active = document.active[token];
            if (!active || active.owner !== owner || active.ip !== ip) throw limited();
            const counters = scopes.map(id => counter(document, id, now)), reserved = held(document);
            if (counters.some((entry, index) => entry.models + reserved[index]! + count > caps[index]!)) throw limited();
            active.reservedModels = (active.reservedModels || 0) + count;
          });
        },
        async chargeModel() {
          await mutate((document, now) => {
            const active = document.active[token];
            if (!active || active.owner !== owner || active.ip !== ip) throw limited();
            const counters = scopes.map(id => counter(document, id, now)), reserved = held(document);
            const consumesReservation = (active.reservedModels || 0) > 0;
            // Legacy/unreserved calls cannot spend another request's holds.
            const additional = consumesReservation ? 0 : 1;
            if (counters.some((entry, index) => entry.models + reserved[index]! + additional > caps[index]!)) throw limited();
            if (consumesReservation) active.reservedModels = active.reservedModels! - 1;
            counters.forEach(entry => entry.models++);
          });
        },
        async release() { await mutate(document => { delete document.active[token]; }); },
      };
    },
  };
}
const memory = new MemoryDocumentBackend();
export async function serverFlowBudget() {
  const limits = flowBudgetLimits();
  const namespace = process.env.FLOW_REDIS_NAMESPACE || (process.env.NODE_ENV === 'production' ? '' : 'infidao-dev');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) throw new FlowError('BUDGET_UNCONFIGURED', '在线阅读尚未配置好。', 503);
  const backend = process.env.FLOW_REDIS_URL ? createRedisDocumentBackend(await flowRedis()) : process.env.NODE_ENV !== 'production' ? memory : null;
  if (!backend) throw new FlowError('BUDGET_UNCONFIGURED', '在线阅读尚未配置好。', 503);
  return createFlowBudget(backend, namespace + ':flow:budget', limits);
}
