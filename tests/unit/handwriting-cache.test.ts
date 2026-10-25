/** @jest-environment node */
import { invalidateKeepsakes } from '@/lib/handwriting/cache';
import { revokeKeepsakeRequest } from '@/lib/handwriting/client';

jest.mock('@/lib/handwriting/client', () => ({ revokeKeepsakeRequest: jest.fn(() => new Promise(() => {})), deleteKeepsake: jest.fn() }));

test('note invalidation commits locally without waiting for a stalled export service', async () => {
  const names = ['window', 'indexedDB', 'BroadcastChannel', 'navigator'] as const;
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const pending = { key: 'scope:draft', invalidated: true, request: { requestId: 'existing-request' } };
  function database() {
    return {
      close() {},
      onversionchange: null,
      transaction() {
        const tx: { oncomplete?: () => void; objectStore: () => unknown } = { objectStore: () => ({}) };
        const request = (result: unknown) => {
          const item: { result: unknown; onsuccess?: () => void } = { result };
          queueMicrotask(() => { item.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); });
          return item;
        };
        tx.objectStore = () => ({ put() {}, openCursor: () => request(null), getAll: () => request([pending]) });
        return tx;
      },
    };
  }
  Object.defineProperties(globalThis, {
    window: { value: new EventTarget(), configurable: true },
    BroadcastChannel: { value: undefined, configurable: true },
    navigator: { value: { onLine: true }, configurable: true },
    indexedDB: { value: { open() {
      const request: { result: ReturnType<typeof database>; onsuccess?: () => void } = { result: database() };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    } }, configurable: true },
  });
  try {
    const quick = await Promise.race([
      invalidateKeepsakes({ noteId: 'selected-note' }, 'new-revision').then(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100)),
    ]);
    expect(quick).toBe(true);
    await new Promise(resolve => setImmediate(resolve));
    expect(revokeKeepsakeRequest).toHaveBeenCalledWith('existing-request');
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name);
    }
  }
});
