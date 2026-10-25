import { type CachedKeepsake, type KeepsakeSource, type ReadingKeepsakeDraft } from './contracts';
import { sourceKey } from './reading-draft';

let opened: Promise<IDBDatabase> | null = null;
let channel: BroadcastChannel | null = null;
let watchingNetwork = false;
let flushing: Promise<void> | null = null;
let flushAgain = false;
type Invalidation = { noteId?: string; pathId?: string; scope?: string };
function watch() {
  if (!watchingNetwork && typeof window !== 'undefined') {
    watchingNetwork = true;
    window.addEventListener('online', () => { void flushInvalidatedKeepsakes().catch(() => {}); });
  }
  if (!channel && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('infidao-keepsake-invalidation');
    channel.onmessage = event => window.dispatchEvent(new CustomEvent('infidao-keepsakes-invalidated', { detail: event.data }));
  }
}
function announce(source: Invalidation) {
  watch();
  window.dispatchEvent(new CustomEvent('infidao-keepsakes-invalidated', { detail: source }));
  channel?.postMessage(source);
}
function database() {
  watch();
  if (!opened) opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('infidao-reading-keepsakes', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('exports', { keyPath: 'key' });
      db.createObjectStore('invalidations', { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opened = null; }; resolve(request.result); };
    request.onerror = () => { opened = null; reject(new Error('纪念卡无法保存在本机，请检查存储空间。')); };
    request.onblocked = () => { opened = null; reject(new Error('请关闭旧的纪念卡页面后重试。')); };
  });
  return opened;
}
async function transact<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const result = work(tx);
    tx.oncomplete = () => resolve(result.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('纪念卡缓存未保存，请检查存储空间。'));
  });
}
const all = () => transact<CachedKeepsake[]>(['exports'], 'readonly', tx => tx.objectStore('exports').getAll());
export const cacheKey = (scope: string, draft: ReadingKeepsakeDraft) => scope + ':' + draft.draftId;
export const listKeepsakeCache = async (scope: string) => (await all()).filter(item => item.scope === scope && !item.invalidated).sort((a, b) => b.updatedAt - a.updatedAt);
export const getKeepsakeCache = async (key: string) => {
  const item = await transact<CachedKeepsake | undefined>(['exports'], 'readonly', tx => tx.objectStore('exports').get(key));
  return item && !item.invalidated ? item : null;
};

export async function readKeepsakeCache(scope: string, source: KeepsakeSource) {
  const record = (await listKeepsakeCache(scope)).find(item => sourceKey(item.draft) === sourceKey(source));
  if (!record || record.invalidated || record.draft.sourceRef.noteRevision !== source.sourceRef.noteRevision) return null;
  return record;
}
export async function saveKeepsakeCache(record: CachedKeepsake) {
  const db = await database();
  // Source invalidation and a late result share a transaction, so a stale completion cannot resurrect an export.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['exports', 'invalidations'], 'readwrite');
    const checks = [
      { key: 'export:' + record.key, valid: (value: any) => !value },
      { key: 'scope:' + record.scope, valid: (value: any) => !value || (record.draft.createdAt || 0) > value.clearedAt },
      ...(record.draft.sourceRef.noteId ? [{ key: 'note:' + record.draft.sourceRef.noteId, valid: (value: any) => !value || value.revision === record.draft.sourceRef.noteRevision }] : []),
      ...(record.draft.sourceRef.pathId ? [{ key: 'path:' + record.draft.sourceRef.pathId, valid: (value: any) => !value || (record.draft.createdAt || 0) > value.removedAt }] : []),
    ];
    let remaining = checks.length, aborted = false;
    for (const check of checks) {
      const request = tx.objectStore('invalidations').get(check.key);
      request.onsuccess = () => {
        if (aborted) return;
        if (!check.valid(request.result)) { aborted = true; tx.abort(); return; }
        if (--remaining === 0) tx.objectStore('exports').put(record);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error('来源已修改或缓存未保存，请重新打开原文。'));
  });
  // Limit to 12 drafts / 80 MiB. Pending tasks and deletions are retained for cancellation rather than silently evicted.
  const records = (await all()).sort((a, b) => b.updatedAt - a.updatedAt);
  let bytes = 0;
  for (const [index, item] of records.entries()) {
    bytes += item.pages.reduce((sum, page) => sum + page.size, item.pdf?.size || 0);
    if ((index >= 12 || bytes > 80 * 1024 * 1024) && !item.invalidated && item.job?.status === 'ready') {
      await transact(['exports'], 'readwrite', tx => tx.objectStore('exports').put({ ...item, pages: [], pdf: null }));
    }
  }
}

export async function invalidateKeepsakes(source: { noteId?: string; pathId?: string }, revision?: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['exports', 'invalidations'], 'readwrite');
    if (source.noteId) tx.objectStore('invalidations').put({ id: 'note:' + source.noteId, revision: revision ?? null });
    if (source.pathId) tx.objectStore('invalidations').put({ id: 'path:' + source.pathId, removedAt: Date.now() });
    const request = tx.objectStore('exports').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const item = cursor.value as CachedKeepsake;
      if ((source.noteId && item.draft.sourceRef.noteId === source.noteId) || (source.pathId && item.draft.sourceRef.pathId === source.pathId)) {
        cursor.update({ ...item, pages: [], pdf: null, invalidated: true });
        tx.objectStore('invalidations').put({ id: 'export:' + item.key });
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
  });
  announce(source);
  // Note edits wait only for the local tombstone, never for the export service.
  void flushInvalidatedKeepsakes().catch(() => {});
}
export function flushInvalidatedKeepsakes(): Promise<void> {
  if (flushing) { flushAgain = true; return flushing; }
  flushing = (async () => {
    do {
      flushAgain = false;
      if (!await flushInvalidatedPass()) break;
    } while (flushAgain);
  })().finally(() => { flushing = null; });
  return flushing;
}
async function flushInvalidatedPass() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const { deleteKeepsake, revokeKeepsakeRequest } = await import('./client');
  for (const item of await all()) {
    if (!item.invalidated) continue;
    try {
      // Revoke an uncertain request before removing its local key. A late POST is then rejected atomically.
      if (item.request) await revokeKeepsakeRequest(item.request.requestId);
      else if (item.job) await deleteKeepsake(item.job.id);
      await transact(['exports'], 'readwrite', tx => tx.objectStore('exports').delete(item.key));
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        await transact(['exports'], 'readwrite', tx => tx.objectStore('exports').delete(item.key));
      } else return false;
    }
  }
  return true;
}
export async function clearKeepsakeCache(scope: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['exports', 'invalidations'], 'readwrite');
    tx.objectStore('invalidations').put({ id: 'scope:' + scope, clearedAt: Date.now() });
    const request = tx.objectStore('exports').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const item = cursor.value as CachedKeepsake;
      if (item.scope === scope) {
        cursor.update({ ...item, invalidated: true, pages: [], pdf: null });
        tx.objectStore('invalidations').put({ id: 'export:' + item.key });
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
  });
  announce({ scope });
  await flushInvalidatedKeepsakes();
  if ((await all()).some(item => item.scope === scope && item.invalidated)) throw new Error('本机图片已清理，后台记录待网络恢复后继续清理。');
}
