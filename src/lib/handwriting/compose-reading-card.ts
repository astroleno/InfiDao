import type { CardLayout, PreparedPage } from './contracts';

export type CompositionInput = { pages: Array<{ page: PreparedPage; image: Blob }>; layout: CardLayout };
export type CompositionResult = { pages: Blob[]; pdf: Blob; durationMs: number };

export async function composeReadingCard(input: CompositionInput, signal?: AbortSignal): Promise<CompositionResult> {
  signal?.throwIfAborted();
  const worker = new Worker(new URL('./compose.worker.ts', import.meta.url));
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => {
      finish();
      if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data as CompositionResult);
    };
    worker.onerror = () => { finish(); reject(new Error('这台浏览器暂时无法合成高清卡面，请更新浏览器后重试。')); };
    worker.postMessage(input);
  });
}
