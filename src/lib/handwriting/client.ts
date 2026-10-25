import type { CreateKeepsakeJob, HandwritingCapabilities, KeepsakeJob } from './contracts';

export class KeepsakeRequestError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message); }
}
let session: Promise<void> | null = null;
async function request<T>(url: string, options: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    options.signal?.throwIfAborted();
    const response = await fetch(url, { ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) session = null;
      throw new KeepsakeRequestError(body?.error?.code || 'UNAVAILABLE', body?.error?.message || '暂时无法连接，草稿仍在本机。', response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof KeepsakeRequestError || options.signal?.aborted) throw error;
    throw new KeepsakeRequestError('CONNECTION_UNCERTAIN', '连接暂时中断，请核对原任务后继续。');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
export async function ensureKeepsakeSession() {
  if (!session) session = request('/api/flow/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(() => {}).catch(error => { session = null; throw error; });
  await session;
}
let capabilitiesPending: Promise<HandwritingCapabilities> | null = null;
export function handwritingCapabilities() {
  if (!capabilitiesPending) capabilitiesPending = request<HandwritingCapabilities>('/api/handwriting/capabilities', {}, 35_000)
    .catch(async error => {
      if (!(error instanceof KeepsakeRequestError) || error.status !== 401) throw error;
      await ensureKeepsakeSession();
      return request<HandwritingCapabilities>('/api/handwriting/capabilities', {}, 35_000);
    })
    .finally(() => { capabilitiesPending = null; });
  return capabilitiesPending;
}
export const getKeepsake = (id: string, signal?: AbortSignal) => request<KeepsakeJob>(`/api/handwriting/jobs/${encodeURIComponent(id)}`, signal ? { signal } : {});
export const findKeepsake = (requestId: string) => request<KeepsakeJob>(`/api/handwriting/jobs?requestId=${encodeURIComponent(requestId)}`);
export const cancelKeepsake = (id: string) => request<KeepsakeJob>(`/api/handwriting/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
export const retryKeepsake = (id: string) => request<KeepsakeJob>(`/api/handwriting/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
export const deleteKeepsake = (id: string) => request(`/api/handwriting/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const revokeKeepsakeRequest = (requestId: string) => request(`/api/handwriting/jobs?requestId=${encodeURIComponent(requestId)}`, { method: 'DELETE' });
export async function submitKeepsake(input: CreateKeepsakeJob): Promise<KeepsakeJob> {
  // Always query this same request after uncertainty; never allocate a fresh key here.
  try { return await findKeepsake(input.requestId); }
  catch (error) { if (!(error instanceof KeepsakeRequestError) || error.status !== 404) throw error; }
  return request<KeepsakeJob>('/api/handwriting/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}
