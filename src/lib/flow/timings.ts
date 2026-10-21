import { AsyncLocalStorage } from 'node:async_hooks';
import type { FlowRequest } from './contracts';

type Phase = 'plan' | 'retrieve' | 'generate' | 'review' | 'model';
type Sample = { phase: Phase; durationMs: number; outcome: 'ok' | 'error' };
const timings = new AsyncLocalStorage<{ samples: Sample[]; counts: Record<string, number> }>();
const elapsed = (start: number) => Math.round((performance.now() - start) * 10) / 10;

// Opt-in, one bounded summary per request. Never log seeds, model text,
// request/session identifiers, IPs, credentials or arbitrary error messages.
export async function withFlowTimings<T>(operation: FlowRequest['op'], work: () => Promise<T>): Promise<T> {
  if (process.env.FLOW_TIMINGS !== '1') return work();
  const samples: Sample[] = [], start = performance.now();
  const counts: Record<string, number> = {};
  let outcome: Sample['outcome'] = 'error';
  try {
    const result = await timings.run({ samples, counts }, work);
    outcome = 'ok';
    return result;
  } finally {
    // Diagnostics must not change a successful response or mask its error.
    try { console.info('[flow-timings]', JSON.stringify({ operation, durationMs: elapsed(start), outcome, samples, counts })); } catch {}
  }
}

export async function measureFlowPhase<T>(phase: Phase, work: () => Promise<T>): Promise<T> {
  const context = timings.getStore();
  if (!context) return work();
  const { samples } = context;
  const start = performance.now();
  let outcome: Sample['outcome'] = 'error';
  try {
    const result = await work();
    outcome = 'ok';
    return result;
  } finally {
    if (samples.length < 32) samples.push({ phase, durationMs: elapsed(start), outcome });
  }
}

type Count = 'candidateCount' | 'candidateChars' | 'proposed' | 'verified' | 'accepted' | 'inputChars' | 'promptTokens' | 'completionTokens';
const countNames: Count[] = ['candidateCount', 'candidateChars', 'proposed', 'verified', 'accepted', 'inputChars', 'promptTokens', 'completionTokens'];
export function recordFlowCounts(values: Partial<Record<Count, number>>) {
  const context = timings.getStore();
  if (!context) return;
  for (const name of countNames) {
    const value = values[name];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000) {
      context.counts[name] = (context.counts[name] || 0) + value;
    }
  }
}
