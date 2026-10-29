import type { BrowserFlowBatch, RemoteFlowProvider } from './provider';
import { currentContentPacks } from './content-preference';
import type { FlowEvent } from '../flow/contracts';

type NextInput = { chainId: string; cursor: string };
const copy = (chain: BrowserFlowBatch) => structuredClone(chain);

/** One verified continuation, scoped to this provider and exact source cursor. */
export function withPreparedContinuation(provider: RemoteFlowProvider, now = Date.now) {
  type Hooks = Parameters<RemoteFlowProvider['next']>[1];
  type Slot = { key: string; created: number; task: ReturnType<RemoteFlowProvider['next']>; consumed: boolean; finished: boolean;
    subscribe: (hooks: Hooks) => void };
  let slot: Slot | null = null;
  let attempted: string | null = null;
  const keyOf = (input: NextInput) => JSON.stringify([input.chainId, input.cursor, currentContentPacks()]);
  const cancelPreparation = () => {
    const previous = slot; slot = null;
    // A consumed request is now owned and cancelled by the reading controller.
    if (previous && !previous.consumed) previous.task.cancel();
  };
  return {
    ...provider,
    cancelPreparation,
    suspendPreparation() { if (slot && !slot.finished) cancelPreparation(); },
    prepareNext(input: NextInput) {
      const key = keyOf(input);
      if (attempted === key) return;
      cancelPreparation(); attempted = key;
      let progress: FlowEvent | undefined, listener: Hooks;
      const forward = (event: FlowEvent) => {
        if (listener?.onEvent) listener.onEvent({ ...structuredClone(event), requestId: listener.requestId || event.requestId });
      };
      const request = provider.next({ ...input, prefetch: true }, { onEvent(event) {
        if (!['head', 'progress', 'frame'].includes(event.type)) return;
        progress = structuredClone(event);
        forward(event);
      } });
      const task = Object.assign(request.then(chain => {
        if (chain.chainId !== input.chainId || chain.frames.some(frame => frame.ready === false)) {
          throw Object.assign(new Error('经文尚未核验完整，可以继续阅读原句。'), { code: 'INVALID_RESPONSE' });
        }
        return chain;
      }), { cancel: () => request.cancel() });
      const pending: Slot = { key, created: now(), task, consumed: false, finished: false,
        subscribe(hooks) { listener = hooks; if (progress && listener) forward(progress); } };
      slot = pending;
      // A background failure never becomes an error overlay or an automatic
      // retry. The next explicit action may try normally under the same caps.
      void task.then(() => { pending.finished = true; }, error => {
        pending.finished = true;
        // The extra foreground hold may decline preparation while two calls
        // remain available for an explicit continuation. Other failures are
        // delivered on demand, without silently repeating semantic work.
        if (slot === pending && error.code === 'BUDGET_REACHED') slot = null;
      });
    },
    next(input: NextInput, hooks?: Parameters<RemoteFlowProvider['next']>[1]) {
      const pending = slot;
      if (pending?.key === keyOf(input) && now() - pending.created < 5 * 60_000) {
        slot = null; pending.consumed = true;
        // Preparation stays invisible until demand takes ownership. Replay its
        // latest verified paragraph, then forward the remaining live progress.
        pending.subscribe(hooks);
        let owned = pending.task, cancelled = false;
        const result = pending.task.then(copy).catch(error => {
          if (error.code !== 'BUDGET_REACHED' || cancelled) throw error;
          // Preparation may still be waiting for its stricter preflight when
          // the reader clicks. That declined hold spent no model calls.
          owned = provider.next(input, hooks);
          return owned;
        });
        return Object.assign(result, { cancel: () => { cancelled = true; pending.subscribe(undefined); owned.cancel(); } });
      }
      cancelPreparation();
      return provider.next(input, hooks);
    },
    open(...args: Parameters<RemoteFlowProvider['open']>) { cancelPreparation(); return provider.open(...args); },
    resume(...args: Parameters<RemoteFlowProvider['resume']>) { cancelPreparation(); return provider.resume(...args); },
    branch(...args: Parameters<RemoteFlowProvider['branch']>) { cancelPreparation(); return provider.branch(...args); },
  };
}
