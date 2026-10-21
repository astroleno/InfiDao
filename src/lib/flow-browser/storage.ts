import type { FlowSelection } from '../flow/contracts';
import type { GraphNode, GraphEdge, GraphVisit } from './graph';

export type ReadingSnapshot = {
  position: number; rowOffset: number; ambientPhase: number; paused: boolean; sourceOpen: boolean;
  readingPositions: Record<string, number>; ribbon: unknown; version: 1; activeFrameId?: string; activeEntryKey?: string;
};
export type FlowPathRecord = {
  pathId: string; chain: any; snapshot: ReadingSnapshot; parentPathId: string | null; sourceLabel: string;
  parentEntry?: { fromFrameId: string; anchorId: string; label: string; selection?: FlowSelection; thought?: string };
  graph?: { edgeId: string; originPathId: string };
  completion?: 'pending' | 'complete' | 'stopped' | 'failed'; createdAt: number; updatedAt: number;
  recoveryError?: { code: string; message: string };
};
export type NoteContext = { quote: string; source: string; chapterLabel: string };
export type PersonalNote = { id: string; chainId: string; frameId: string; text: string; createdAt: number; updatedAt: number; pathId?: string; context?: NoteContext };
export type Bookmark = NoteContext & { kind: 'bookmark'; key: string; pathId: string; chainId: string; frameId: string; snapshot: ReadingSnapshot; createdAt: number; updatedAt: number };
type StoreName = 'paths' | 'notes' | 'meta' | 'graphNodes' | 'graphEdges' | 'graphVisits';
type Mutation = { store: StoreName; key: string; value?: any; remove?: boolean };
export type ReadingPersistence = {
  read: (store: StoreName, key: string) => Promise<any>;
  list: (store: StoreName) => Promise<any[]>;
  query?: (store: StoreName, index: string, key: string) => Promise<any[]>;
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
    const request = indexedDB.open('infidao-flow-reader', 4);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('paths')) db.createObjectStore('paths', { keyPath: 'pathId' });
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('graphNodes')) db.createObjectStore('graphNodes', { keyPath: 'id' });
      const nodes = request.transaction!.objectStore('graphNodes');
      if (!nodes.indexNames.contains('kind')) nodes.createIndex('kind', 'kind');
      if (!db.objectStoreNames.contains('graphEdges')) {
        const edges = db.createObjectStore('graphEdges', { keyPath: 'id' });
        edges.createIndex('fromNodeId', 'fromNodeId');
        edges.createIndex('toNodeId', 'toNodeId');
      }
      if (!db.objectStoreNames.contains('graphVisits')) {
        const visits = db.createObjectStore('graphVisits', { keyPath: 'id' });
        visits.createIndex('pathId', 'pathId');
        visits.createIndex('nodeId', 'nodeId');
      }
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
  async query(store, index, key) { const db = await database(); return requestResult(db.transaction(store, 'readonly').objectStore(store).index(index).getAll(key)); },
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
  const memory: Record<StoreName, Map<string, any>> = { paths: new Map(), notes: new Map(), meta: new Map(),
    graphNodes: new Map(), graphEdges: new Map(), graphVisits: new Map() };
  const touched: Record<StoreName, Set<string>> = { paths: new Set(), notes: new Set(), meta: new Set(),
    graphNodes: new Set(), graphEdges: new Set(), graphVisits: new Set() };
  const revisions = new Map<string, number>();
  let writes = Promise.resolve();
  function trim(store: Exclude<StoreName, 'meta'>, limit = store === 'paths' ? 8 : store === 'notes' ? 100 : 256) {
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
      trim('paths'); trim('notes'); trim('graphNodes'); trim('graphEdges'); trim('graphVisits');
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
  async function list(store: StoreName, query?: { index: string; key: string }) {
    const matches = (value: any) => !query || value?.[query.index] === query.key;
    const before = new Map(revisions);
    try {
      const values = query && persistence.query ? await persistence.query(store, query.index, query.key) : (await persistence.list(store)).filter(matches);
      const seen = new Set<string>();
      for (const value of values) {
        if (store === 'meta' && (value?.kind !== 'bookmark' || typeof value.key !== 'string')) continue;
        const key = store === 'paths' ? value.pathId : store === 'meta' ? value.key : value.id;
        seen.add(key);
        if (!touched[store].has(key) && before.get(store + ':' + key) === revisions.get(store + ':' + key)) memory[store].set(key, value);
      }
      // A successful listing also observes deletions from another tab. Never
      // discard session-only edits or writes which completed during the read.
      for (const [key, value] of memory[store]) {
        if (store === 'meta' && value?.kind !== 'bookmark') continue;
        if (!matches(value)) continue;
        if (!seen.has(key) && !touched[store].has(key) && before.get(store + ':' + key) === revisions.get(store + ':' + key)) memory[store].delete(key);
      }
    } catch { /* Include memory-only records. */ }
    const result = clone(Array.from(memory[store].values()).filter(matches));
    if (store !== 'meta') trim(store);
    return result;
  }
  const savePath = (record: FlowPathRecord) => write([{ store: 'paths', key: record.pathId, value: record }]);
  const saveNote = (note: PersonalNote) => write([{ store: 'notes', key: note.id, value: note }]);
  return {
    savePath, loadPath: (id: string): Promise<FlowPathRecord | null> => read('paths', id),
    graphNode: (id: string): Promise<GraphNode | null> => read('graphNodes', id),
    graphEdge: (id: string): Promise<GraphEdge | null> => read('graphEdges', id),
    graphEdgesFrom: (id: string): Promise<GraphEdge[]> => list('graphEdges', { index: 'fromNodeId', key: id }),
    listGraphNodes: (): Promise<GraphNode[]> => list('graphNodes'),
    listGraphEdges: (): Promise<GraphEdge[]> => list('graphEdges'),
    graphVisitsFor: (pathId: string): Promise<GraphVisit[]> => list('graphVisits', { index: 'pathId', key: pathId }),
    graphVersion: (): Promise<number | null> => read('meta', 'graph:version'),
    markGraphVersion: () => write([{ store: 'meta', key: 'graph:version', value: 4 }]),
    graphChoice: (key: string): Promise<string | null> => read('meta', 'graph:choice:' + key),
    chooseGraphEdge: (key: string, edgeId: string) => write([{ store: 'meta', key: 'graph:choice:' + key, value: edgeId }]),
    commitGraph: (batch: { paths: FlowPathRecord[]; nodes: GraphNode[]; edges: GraphEdge[]; visits: GraphVisit[] }) => write([
      ...batch.paths.map(value => ({ store: 'paths' as const, key: value.pathId, value })),
      ...batch.nodes.map(value => ({ store: 'graphNodes' as const, key: value.id, value })),
      ...batch.edges.map(value => ({ store: 'graphEdges' as const, key: value.id, value })),
      ...batch.visits.map(value => ({ store: 'graphVisits' as const, key: value.id, value })),
    ]),
    listPaths: async (): Promise<FlowPathRecord[]> => (await list('paths') as FlowPathRecord[]).sort((a, b) => b.updatedAt - a.updatedAt || a.pathId.localeCompare(b.pathId)),
    listAllNotes: async (): Promise<PersonalNote[]> => (await list('notes') as PersonalNote[]).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)),
    listBookmarks: async (): Promise<Bookmark[]> => (await list('meta') as unknown as Bookmark[]).filter(value => value?.kind === 'bookmark').sort((a, b) => b.createdAt - a.createdAt || a.key.localeCompare(b.key)),
    saveBookmark: (value: Bookmark) => write([{ store: 'meta', key: value.key, value }]),
    deleteBookmark: (key: string) => write([{ store: 'meta', key, remove: true }]),
    getBookmark: (key: string): Promise<Bookmark | null> => read('meta', key),
    hintSeen: async (): Promise<boolean> => !!await read('meta', 'library:hint-seen'),
    dismissHint: () => write([{ store: 'meta', key: 'library:hint-seen', value: true }]),
    async updateNote(id: string, text: string) {
      const previous = await read('notes', id) as PersonalNote | null;
      if (!previous) throw new Error('这条注脚已不存在。');
      if (!text.trim() || text.trim().length > 1000) throw new Error('请填写 1 至 1000 字的注脚。');
      return saveNote({ ...previous, text: text.trim(), updatedAt: Date.now() });
    },
    commitBranch: (parent: FlowPathRecord, child: FlowPathRecord) => write([
      { store: 'paths', key: parent.pathId, value: parent }, { store: 'paths', key: child.pathId, value: child },
    ]),
    async child(parentPathId: string, fromFrameId: string, anchorId: string): Promise<FlowPathRecord | null> {
      const all = await list('paths') as FlowPathRecord[];
      return all.filter(record => record.parentPathId === parentPathId && (record.parentEntry || record.chain.entry)?.fromFrameId === fromFrameId &&
        (record.parentEntry || record.chain.entry)?.anchorId === anchorId && record.chain.frames.every((frame: any) => frame.ready !== false))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
    },
    activate: (id: string) => write([{ store: 'meta', key: 'latest', value: id }]),
    latest: (): Promise<string | null> => read('meta', 'latest'),
    saveDraft: (value: string) => write([{ store: 'meta', key: 'thought-draft', value }]),
    loadDraft: (): Promise<string | null> => read('meta', 'thought-draft'),
    loadNoteDraft: (key: string): Promise<string | null> => read('meta', 'note-draft:' + key),
    saveNoteDraft: (key: string, value: string) => write([{ store: 'meta', key: 'note-draft:' + key, value }]),
    async clearNoteDraft(key: string, expected: string) {
      const storedKey = 'note-draft:' + key;
      const revisionKey = 'meta:' + storedKey;
      const before = revisions.get(revisionKey);
      // A delayed save must not erase text typed after it began.
      if (await read('meta', storedKey) !== expected || revisions.get(revisionKey) !== before) return { persisted: true };
      return write([{ store: 'meta', key: storedKey, remove: true }]);
    },
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
