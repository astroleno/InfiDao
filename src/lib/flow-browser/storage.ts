export type ReadingSnapshot = {
  position: number; rowOffset: number; ambientPhase: number; paused: boolean; sourceOpen: boolean;
  readingPositions: Record<string, number>; ribbon: unknown; version: 1;
};
export type FlowPathRecord = {
  pathId: string; chain: any; snapshot: ReadingSnapshot; parentPathId: string | null; sourceLabel: string;
  completion?: 'pending' | 'complete' | 'stopped' | 'failed'; createdAt: number; updatedAt: number;
};
export type PersonalNote = { id: string; chainId: string; frameId: string; text: string; createdAt: number; updatedAt: number };
type StoreName = 'paths' | 'notes' | 'meta';
type Mutation = { store: StoreName; key: string; value?: any; remove?: boolean };
export type ReadingPersistence = {
  read: (store: StoreName, key: string) => Promise<any>;
  list: (store: StoreName) => Promise<any[]>;
  write: (mutations: Mutation[]) => Promise<void>;
};
const clone = <T,>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value));

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('READING_STORAGE_FAILED'));
  });
}
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('READING_STORAGE_FAILED'));
    tx.onerror = () => reject(tx.error || new Error('READING_STORAGE_FAILED'));
  });
}
let databasePromise: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (!databasePromise) databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('READING_STORAGE_UNAVAILABLE')); return; }
    const request = indexedDB.open('infidao-flow-reader', 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('paths')) db.createObjectStore('paths', { keyPath: 'pathId' });
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('READING_STORAGE_FAILED'));
    request.onblocked = () => { blocked = true; reject(new Error('READING_STORAGE_BLOCKED')); };
  }).catch(error => { databasePromise = null; throw error; });
  return databasePromise;
}
const indexedDBPersistence: ReadingPersistence = {
  async read(store, key) { const db = await database(); return requestResult(db.transaction(store, 'readonly').objectStore(store).get(key)); },
  async list(store) { const db = await database(); return requestResult(db.transaction(store, 'readonly').objectStore(store).getAll()); },
  async write(mutations) {
    const db = await database(), tx = db.transaction([...new Set(mutations.map(item => item.store))], 'readwrite');
    const done = transactionDone(tx);
    try {
      for (const item of mutations) {
        const store = tx.objectStore(item.store);
        if (item.remove) store.delete(item.key);
        else if (item.store === 'meta') store.put(item.value, item.key);
        else store.put(item.value);
      }
    } catch (error) { tx.abort(); await done.catch(() => {}); throw error; }
    await done;
  },
};

/** Session overlays also retain tombstones: failed writes must never resurrect stale disk records. */
export function createReadingStorage(persistence: ReadingPersistence = indexedDBPersistence) {
  const memory = { paths: new Map<string, FlowPathRecord>(), notes: new Map<string, PersonalNote>(), meta: new Map<string, any>() };
  const touched = { paths: new Set<string>(), notes: new Set<string>(), meta: new Set<string>() };
  const revisions = new Map<string, number>();
  let writes = Promise.resolve();
  function trim(store: 'paths' | 'notes', limit = store === 'paths' ? 8 : 100) {
    for (const key of memory[store].keys()) {
      if (memory[store].size <= limit) break;
      if (!touched[store].has(key)) memory[store].delete(key);
    }
  }
  function write(mutations: Mutation[]) {
    const copies = clone(mutations);
    const versions = new Map<string, number>();
    for (const item of copies) {
      const key = item.store + ':' + item.key, version = (revisions.get(key) || 0) + 1;
      revisions.set(key, version); versions.set(key, version);
      touched[item.store].add(item.key);
      if (item.remove) memory[item.store].delete(item.key);
      else memory[item.store].set(item.key, item.value);
    }
    const result = writes.then(() => persistence.write(copies)).then(() => {
      for (const item of copies) {
        const key = item.store + ':' + item.key;
        if (revisions.get(key) === versions.get(key)) touched[item.store].delete(item.key);
      }
      trim('paths'); trim('notes');
      return { persisted: true };
    }, error => ({ persisted: false, error }));
    writes = result.then(() => {});
    return result;
  }
  async function read(store: StoreName, key: string) {
    if (touched[store].has(key)) return clone(memory[store].get(key) ?? null);
    const revision = revisions.get(store + ':' + key);
    try {
      const value = await persistence.read(store, key);
      if (!touched[store].has(key) && revisions.get(store + ':' + key) === revision) {
        if (value != null) memory[store].set(key, value); else memory[store].delete(key);
      }
    } catch { /* Existing session state remains usable when IndexedDB fails. */ }
    const value = clone(memory[store].get(key) ?? null);
    if (store !== 'meta') trim(store);
    return value;
  }
  async function list(store: 'paths' | 'notes') {
    const before = new Map(revisions);
    try {
      const values = await persistence.list(store);
      for (const value of values) {
        const key = store === 'paths' ? value.pathId : value.id;
        if (!touched[store].has(key) && before.get(store + ':' + key) === revisions.get(store + ':' + key)) memory[store].set(key, value);
      }
    } catch { /* Include memory-only records. */ }
    const result = clone(Array.from((memory[store] as Map<string, FlowPathRecord | PersonalNote>).values()));
    trim(store);
    return result;
  }
  const savePath = (record: FlowPathRecord) => write([{ store: 'paths', key: record.pathId, value: record }]);
  const saveNote = (note: PersonalNote) => write([{ store: 'notes', key: note.id, value: note }]);
  return {
    savePath, loadPath: (id: string): Promise<FlowPathRecord | null> => read('paths', id),
    commitBranch: (parent: FlowPathRecord, child: FlowPathRecord) => write([
      { store: 'paths', key: parent.pathId, value: parent }, { store: 'paths', key: child.pathId, value: child },
    ]),
    async child(parentPathId: string, fromFrameId: string, anchorId: string): Promise<FlowPathRecord | null> {
      const all = await list('paths') as FlowPathRecord[];
      return all.filter(record => record.parentPathId === parentPathId && record.chain.entry?.fromFrameId === fromFrameId &&
        record.chain.entry?.anchorId === anchorId && record.chain.frames.every((frame: any) => frame.ready !== false))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
    },
    activate: (id: string) => write([{ store: 'meta', key: 'latest', value: id }]),
    latest: (): Promise<string | null> => read('meta', 'latest'),
    saveDraft: (value: string) => write([{ store: 'meta', key: 'thought-draft', value }]),
    loadDraft: (): Promise<string | null> => read('meta', 'thought-draft'),
    saveNote,
    async listNotes(chainId: string, frameId: string): Promise<PersonalNote[]> {
      return (await list('notes') as PersonalNote[]).filter(note => note.chainId === chainId && note.frameId === frameId).sort((a, b) => a.createdAt - b.createdAt);
    },
    async deleteNote(id: string) {
      const previous = await read('notes', id) as PersonalNote | null;
      if (!previous) return { deleted: false, persisted: true, previous: null };
      const result = await write([{ store: 'notes', key: id, remove: true }]);
      return { ...result, deleted: true, previous };
    },
    restoreNote: saveNote,
  };
}

export function createPathId() {
  return globalThis.crypto?.randomUUID?.() || `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export const readingStorage = createReadingStorage();
export const { savePath, loadPath, commitBranch, saveNote, listNotes, deleteNote, restoreNote, saveDraft, loadDraft } = readingStorage;
