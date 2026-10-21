/** @jest-environment node */
import { withPreparedContinuation } from '@/lib/flow-browser/prepared-provider';
import type { BrowserFlowBatch, RemoteFlowProvider } from '@/lib/flow-browser/provider';

const input = { chainId: 'chain', cursor: 'cursor' };
const batch = { chainId: 'chain', kind: 'remote', frames: [{ ready: true, quote: '物有本末。' }], cursor: 'next' } as BrowserFlowBatch;
function fixture() {
  let resolve!: (value: BrowserFlowBatch) => void, reject!: (error: unknown) => void;
  const cancel = jest.fn(() => reject(Object.assign(new Error('cancelled'), { cancelled: true })));
  const task = Object.assign(new Promise<BrowserFlowBatch>((yes, no) => { resolve = yes; reject = no; }), { cancel });
  const next = jest.fn(() => task);
  const raw = { next, open: jest.fn(), branch: jest.fn(), resume: jest.fn() } as unknown as RemoteFlowProvider;
  let time = 0;
  return { provider: withPreparedContinuation(raw, () => time), raw, next, cancel, resolve, reject, expire: () => { time = 300_001; } };
}

test('one preparation is shared by an early click without extra calls or speculative events', async () => {
  const f = fixture(), onEvent = jest.fn();
  f.provider.prepareNext(input); f.provider.prepareNext(input);
  expect(f.next).toHaveBeenCalledTimes(1); expect(f.next).toHaveBeenCalledWith({ ...input, prefetch: true }, { onEvent: expect.any(Function) });
  const demand = f.provider.next(input, { onEvent });
  f.provider.cancelPreparation(); expect(f.cancel).not.toHaveBeenCalled();
  f.resolve(batch);
  expect(await demand).toEqual(batch); expect(onEvent).not.toHaveBeenCalled();
  expect(f.next).toHaveBeenCalledTimes(1);
});

test('ready cache is delivered as a copy; a second cursor does not consume it', async () => {
  const f = fixture(); f.provider.prepareNext(input); f.resolve(batch);
  const result = await f.provider.next(input); result.frames[0]!.quote = '改动';
  expect(batch.frames[0]!.quote).toBe('物有本末。');
  f.provider.next({ ...input, cursor: 'other' }); expect(f.next).toHaveBeenCalledTimes(2);
});

test('a semantic rejection is surfaced once on demand and never automatically retried', async () => {
  const f = fixture(); f.provider.prepareNext(input);
  f.reject(Object.assign(new Error('unverified'), { code: 'RELATION_UNVERIFIED' }));
  await Promise.resolve(); f.provider.prepareNext(input);
  await expect(f.provider.next(input)).rejects.toMatchObject({ code: 'RELATION_UNVERIFIED' });
  expect(f.next).toHaveBeenCalledTimes(1);
});

test('a declined background budget allows an explicit continuation with the normal hold', async () => {
  const f = fixture(); f.provider.prepareNext(input);
  f.reject(Object.assign(new Error('budget'), { code: 'BUDGET_REACHED' }));
  await Promise.resolve(); await Promise.resolve();
  await expect(f.provider.next(input)).rejects.toMatchObject({ code: 'BUDGET_REACHED' });
  expect(f.next).toHaveBeenCalledTimes(2); expect(f.next.mock.calls[1]).toEqual([input, undefined]);
});

test('a click already waiting on a declined preparation can use the normal foreground hold', async () => {
  const f = fixture(); f.provider.prepareNext(input);
  const demand = f.provider.next(input);
  const foreground = Object.assign(Promise.resolve(batch), { cancel: jest.fn() });
  f.next.mockReturnValueOnce(foreground);
  f.reject(Object.assign(new Error('preflight'), { code: 'BUDGET_REACHED' }));
  expect(await demand).toEqual(batch); expect(f.next).toHaveBeenCalledTimes(2);
});

test('cancellation prevents a declined preparation from starting a foreground fallback', async () => {
  const f = fixture(); f.provider.prepareNext(input); const demand = f.provider.next(input);
  demand.cancel(); await expect(demand).rejects.toMatchObject({ cancelled: true });
  expect(f.next).toHaveBeenCalledTimes(1);
});

test.each(['open', 'branch', 'resume'] as const)('%s cancels the old background work', method => {
  const f = fixture(); f.provider.prepareNext(input);
  (f.provider[method] as Function)('new'); expect(f.cancel).toHaveBeenCalledTimes(1);
});

test('manual cancellation and stale cache cannot deliver an old preparation', () => {
  const f = fixture(); f.provider.prepareNext(input); f.expire();
  void f.provider.next(input).catch(() => {});
  expect(f.cancel).toHaveBeenCalledTimes(1); expect(f.next).toHaveBeenCalledTimes(2);
});

test('cancelling a demanded preparation aborts the original request', async () => {
  const f = fixture(); f.provider.prepareNext(input); const demand = f.provider.next(input);
  demand.cancel(); await expect(demand).rejects.toMatchObject({ cancelled: true });
  expect(f.cancel).toHaveBeenCalledTimes(1);
});

test('an incomplete or wrong-chain result is never accepted into the prepared cache', async () => {
  const f = fixture(); f.provider.prepareNext(input); f.resolve({ ...batch, frames: [{ ...batch.frames[0]!, ready: false }] });
  await expect(f.provider.next(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('brief backgrounding retains an already verified result but cancels unfinished work', async () => {
  const ready = fixture(); ready.provider.prepareNext(input); ready.resolve(batch);
  await Promise.resolve(); await Promise.resolve();
  ready.provider.suspendPreparation(); expect(ready.cancel).not.toHaveBeenCalled();
  expect(await ready.provider.next(input)).toEqual(batch); expect(ready.next).toHaveBeenCalledTimes(1);
  const pending = fixture(); pending.provider.prepareNext(input); pending.provider.suspendPreparation();
  expect(pending.cancel).toHaveBeenCalledTimes(1);
});

test('taking over a preparation replays its last paragraph then forwards live progress under the demand id', async () => {
  const f = fixture(), onEvent = jest.fn();
  f.provider.prepareNext(input);
  const emit = (f.next.mock.calls[0] as unknown as [unknown, { onEvent: Function }])[1].onEvent;
  const partial = { ...batch, frames: [{ ...batch.frames[0]!, ready: false }] };
  emit({ type: 'head', requestId: 'preparing', chain: partial });
  expect(onEvent).not.toHaveBeenCalled();
  const demand = f.provider.next(input, { requestId: 'reading', onEvent });
  expect(onEvent).toHaveBeenLastCalledWith({ type: 'head', requestId: 'reading', chain: partial });
  emit({ type: 'progress', requestId: 'preparing', chain: partial });
  expect(onEvent.mock.calls.map(([event]) => event.requestId)).toEqual(['reading', 'reading']);
  demand.cancel();
  emit({ type: 'frame', requestId: 'preparing', chain: batch });
  await expect(demand).rejects.toMatchObject({ cancelled: true });
  expect(onEvent).toHaveBeenCalledTimes(2);
});
