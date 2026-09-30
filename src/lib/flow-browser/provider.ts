import type { FlowChain, FlowEvent, FlowRequest } from '@/lib/flow/contracts';
import { createPathId } from './storage';

export type BrowserFlowBatch = Omit<FlowChain, 'kind'> & {
  kind: 'curated' | 'remote';
  sequence?: string[];
  journey?: string;
};

export type BrowserFlowProvider = {
  kind: 'curated' | 'remote';
  open: (seed?: string) => Promise<BrowserFlowBatch>;
  branch: (input: { chainId: string; fromFrameId: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string } }) => Promise<BrowserFlowBatch>;
  next: (input: { chainId: string; cursor: string }) => Promise<BrowserFlowBatch>;
  restore: (chain: BrowserFlowBatch) => void;
};

type Hooks = { requestId?: string; onEvent?: (event: FlowEvent) => void };
type Cancellable<T> = Promise<T> & { cancel: () => void };
type OpenInput = string | Omit<Partial<FlowRequest>, 'op' | 'requestId'>;
export type RemoteFlowProvider = {
  kind: 'remote';
  open: (input?: OpenInput, hooks?: Hooks) => Cancellable<BrowserFlowBatch>;
  resume: (input: { chainId: string }, hooks?: Hooks) => Cancellable<BrowserFlowBatch>;
  branch: (input: Omit<FlowRequest, 'op' | 'requestId'>, hooks?: Hooks) => Cancellable<BrowserFlowBatch>;
  next: (input: { chainId: string; cursor: string }, hooks?: Hooks) => Cancellable<BrowserFlowBatch>;
  restore: (chain: BrowserFlowBatch) => void;
};
const providerError = (code: string, message: string) => Object.assign(new Error(message), { code });

export function createRemoteFlowProvider(options: { fetch?: typeof fetch; timeoutMs?: number; baseURL?: string } = {}): RemoteFlowProvider {
  const fetcher = options.fetch || globalThis.fetch.bind(globalThis), base = options.baseURL || '';
  let session: Promise<void> | null = null;
  let sessionAbort: AbortController | null = null, consumers = 0, sessionReady = false;
  async function ensureSession(signal: AbortSignal) {
    if (!session) {
      sessionAbort = new AbortController(); sessionReady = false;
      const pending = fetcher(base + '/api/flow/session', { method: 'POST', credentials: 'same-origin', signal: sessionAbort.signal, headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw providerError(body?.error?.code || 'SESSION_UNAVAILABLE', body?.error?.message || '暂时无法连接阅读服务。');
        }
        if (session === pending) sessionReady = true;
      }).catch(error => { if (session === pending) session = null; throw error; });
      session = pending;
    }
    consumers++;
    let abort!: () => void;
    try {
      signal.throwIfAborted();
      await Promise.race([session, new Promise<never>((_, reject) => {
        abort = () => reject(Object.assign(new Error('CANCELLED'), { cancelled: true }));
        signal.addEventListener('abort', abort, { once: true });
      })]);
    } finally {
      if (abort) signal.removeEventListener('abort', abort);
      consumers--;
      if (!consumers && !sessionReady) { sessionAbort?.abort(); session = null; }
    }
  }
  function run(op: FlowRequest['op'], input: Omit<Partial<FlowRequest>, 'op' | 'requestId'>, hooks: Hooks = {}): Cancellable<BrowserFlowBatch> {
    const controller = new AbortController(), requestId = hooks.requestId || createPathId();
    let timeout = false;
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, options.timeoutMs || 90_000);
    const promise = (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        await ensureSession(controller.signal); controller.signal.throwIfAborted();
        const response = await fetcher(base + '/api/flow', { method: 'POST', credentials: 'same-origin', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ ...input, op, requestId }) });
        if (!response.ok) {
          if (response.status === 401) session = null;
          const body = await response.json().catch(() => null);
          throw providerError(body?.error?.code || 'UNAVAILABLE', body?.error?.message || '这条联系暂未展开，原句仍可阅读。');
        }
        if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw providerError('INVALID_RESPONSE', '阅读服务的回复不完整，请重试。');
        reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let buffer = '', result: BrowserFlowBatch | null = null;
        function eventLine(line: string) {
          if (!line.trim()) return;
          if (line.length > 1024 * 1024) throw providerError('INVALID_RESPONSE', '这次回复过长，请重新展开。');
          const event = JSON.parse(line) as FlowEvent;
          if (event.requestId !== requestId) return;
          if (event.type === 'error') throw providerError(event.code, event.message);
          if (!['head', 'frame', 'done'].includes(event.type)) throw providerError('INVALID_RESPONSE', '阅读服务的回复不完整，请重试。');
          const chain = event.chain;
          if (!chain?.chainId || chain.kind !== 'remote' || !Array.isArray(chain.frames)) throw providerError('INVALID_RESPONSE', '经文尚未核验完整，请重试。');
          for (const frame of chain.frames) {
            if (!frame.id || typeof frame.fullText !== 'string' || !frame.quote || !Array.isArray(frame.anchors) ||
              typeof frame.ready !== 'boolean' || frame.fullText.slice(frame.quoteStart, frame.quoteEnd) !== frame.quote) {
              throw providerError('INVALID_RESPONSE', '经文尚未核验完整，请重试。');
            }
          }
          controller.signal.throwIfAborted();
          hooks.onEvent?.(event);
          if (event.type === 'done') result = chain;
        }
        for (;;) {
          const part = await reader.read(); controller.signal.throwIfAborted();
          buffer += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf('\n')) >= 0) { eventLine(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1); }
          if (buffer.length > 1024 * 1024) throw providerError('INVALID_RESPONSE', '这次回复过长，请重新展开。');
          if (part.done) break;
        }
        if (buffer.trim()) eventLine(buffer);
        if (!result) throw providerError('INCOMPLETE', '连接已中断，已到达的经文仍可阅读，可以重试补全。');
        return result;
      } catch (error) {
        if (timeout) throw providerError('TIMEOUT', '这条联系等待较久，已到达的经文仍可阅读，可以重试。');
        if (controller.signal.aborted) throw Object.assign(new Error('CANCELLED'), { cancelled: true });
        if (error instanceof TypeError) throw providerError('NETWORK_UNAVAILABLE', '暂时无法连接阅读服务，请检查网络后重试。已保存的经文仍可阅读。');
        if (error instanceof SyntaxError) throw providerError('INVALID_RESPONSE', '阅读服务的回复不完整，请重试。');
        throw error;
      } finally {
        clearTimeout(timer); await reader?.cancel().catch(() => {}); reader?.releaseLock();
      }
    })();
    return Object.assign(promise, { cancel: () => controller.abort() });
  }
  return { kind: 'remote', open: (input = '', hooks) => run('open', typeof input === 'string' ? { seed: input } : input, hooks),
    resume: (input, hooks) => run('open', input, hooks), branch: (input, hooks) => run('branch', input, hooks),
    next: (input, hooks) => run('next', input, hooks), restore() {} };
}

// The same reviewed local provider is used by the native preview. The browser
// package retains its source identity and exact prebuilt branch relationships.
export function createCuratedFlowProvider(): BrowserFlowProvider {
  const { createCuratedProvider } = require('../../../shared/flow/curated-provider') as {
    createCuratedProvider: () => BrowserFlowProvider;
  };
  return createCuratedProvider();
}

export function mergeFlowBatch(current: BrowserFlowBatch, batch: BrowserFlowBatch): BrowserFlowBatch {
  return require('../../../shared/flow/controller').mergeChain(current, batch);
}
