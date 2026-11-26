import { AsyncLocalStorage } from 'node:async_hooks';
import type { FlowEvent, FlowRequest } from './contracts';

type Phase = 'plan' | 'retrieve' | 'generate' | 'review' | 'model';
type Sample = { phase: Phase; durationMs: number; outcome: 'ok' | 'error' };
type FlowTimingContext = {
  samples: Sample[];
  counts: Record<string, number>;
  reviewStart?: number;
  firstQuote?: number;
  reviewToFirstQuoteMs?: number;
};
const timings = new AsyncLocalStorage<FlowTimingContext>();
const elapsed = (start: number, end = performance.now()) => Math.round((end - start) * 10) / 10;

// Opt-in, one bounded summary per request. Never log seeds, model text,
// request/session identifiers, IPs, credentials or arbitrary error messages.
export async function withFlowTimings<T>(operation: FlowRequest['op'], work: () => Promise<T>): Promise<T> {
  if (process.env.FLOW_TIMINGS !== '1') return work();
  const start = performance.now();
  const context: FlowTimingContext = { samples: [], counts: {} };
  let outcome: Sample['outcome'] = 'error';
  try {
    const result = await timings.run(context, work);
    outcome = 'ok';
    return result;
  } finally {
    // Diagnostics must not change a successful response or mask its error.
    const { samples, counts, firstQuote } = context;
    // Phase durations include their model calls. The first-quote milestones
    // end at NDJSON enqueue and exclude network delivery and browser paint.
    const firstQuoteMs = firstQuote === undefined ? null : elapsed(start, firstQuote);
    const reviewToFirstQuoteMs = context.reviewToFirstQuoteMs ?? null;
    try {
      console.info('[flow-timings]', JSON.stringify({ operation, durationMs: elapsed(start), outcome, samples, counts, firstQuoteMs, reviewToFirstQuoteMs }));
    } catch {}
  }
}

export async function measureFlowPhase<T>(phase: Phase, work: () => Promise<T>): Promise<T> {
  const context = timings.getStore();
  if (!context) return work();
  const { samples } = context;
  const start = performance.now();
  if (phase === 'review') context.reviewStart ??= start;
  let outcome: Sample['outcome'] = 'error';
  try {
    const result = await work();
    outcome = 'ok';
    return result;
  } finally {
    if (samples.length < 32) samples.push({ phase, durationMs: elapsed(start), outcome });
  }
}

// Called synchronously after a successful stream enqueue in the flow context.
export function recordFlowStreamEmission(event: FlowEvent) {
  const context = timings.getStore();
  if (!context || context.firstQuote !== undefined || event.type === 'error') return;
  if (event.chain.frames.some(frame => frame.quote.trim().length > 0)) {
    context.firstQuote = performance.now();
    if (context.reviewStart !== undefined) {
      context.reviewToFirstQuoteMs = elapsed(context.reviewStart, context.firstQuote);
    }
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
