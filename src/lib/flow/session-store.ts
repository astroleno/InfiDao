import { FlowError, type FlowChain, type FlowFrame } from './contracts';
import { retainSemantics, type SemanticEntry } from './semantic-index';

export const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
export const OPERATION_LEASE_MS = 45_000;
export type StoredChain = {
  owner: string; chain: FlowChain; terms: string[]; seen: string[];
  nodes: Record<string, FlowFrame>; branches: Record<string, string>;
  initial?: FlowChain; fromQuote?: string; generationKey: string; updated: number;
};
export type OperationLease = { key: string; holder: string; version: number; expiresAt: number };
type Operation = { version: number; holder: string; expiresAt: number; updated: number; chainId?: string; result?: FlowChain };
type SessionDocument = {
  schemaVersion: 1; revision: number; chains: Record<string, StoredChain>; operations: Record<string, Operation>;
  requests: Record<string, { fingerprint: string; key: string; updated: number }>;
  semantics?: SemanticEntry[];
};
export type AtomicDocumentBackend = {
  read: (key: string) => Promise<{ value: string | null; now: number }>;
  compareSwap: (key: string, expected: string | null, value: string, ttlMs: number, lease?: OperationLease) => Promise<'ok' | 'conflict' | 'lost'>;
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const fresh = (): SessionDocument => ({ schemaVersion: 1, revision: 0, chains: {}, operations: {}, requests: {} });
const lost = () => new FlowError('OPERATION_EXPIRED', '这次展开已经停止，请重新尝试。', 409);
const expired = () => new FlowError('CHAIN_EXPIRED', '当前经文暂时无法在线接续，原文仍可阅读。', 410);
const ownsLease = (document: SessionDocument, lease: OperationLease, now: number) => {
  const operation = document.operations[lease.key];
  return operation?.holder === lease.holder && operation.version === lease.version && operation.expiresAt > now;
};

export class MemoryDocumentBackend implements AtomicDocumentBackend {
  private documents = new Map<string, { value: string; expiresAt: number }>();
  constructor(private now: () => number = Date.now, private limit = 128) {}
  async read(key: string) {
    const now = this.now();
    const document = this.documents.get(key);
    if (document && document.expiresAt <= now) this.documents.delete(key);
    return { value: this.documents.get(key)?.value ?? null, now };
  }
  async compareSwap(key: string, expected: string | null, value: string, ttlMs: number, lease?: OperationLease): Promise<'ok' | 'conflict' | 'lost'> {
    // No await between reading and writing: this is the memory implementation's atomic boundary.
    const now = this.now(), saved = this.documents.get(key);
    const current = saved && saved.expiresAt > now ? saved.value : null;
    if (lease && (!current || !ownsLease(JSON.parse(current), lease, now))) return 'lost';
    if (current !== expected) return 'conflict';
    if (!current && this.documents.size >= this.limit) {
      for (const [id, document] of this.documents) if (document.expiresAt <= now) this.documents.delete(id);
      if (this.documents.size >= this.limit) throw new FlowError('STORE_FULL', '阅读服务暂时繁忙，请稍后再试。', 503);
    }
    this.documents.set(key, { value, expiresAt: now + ttlMs });
    return 'ok';
  }
  clear() { this.documents.clear(); }
}

export function createSessionStore(backend: AtomicDocumentBackend, options: { createId: () => string; prefix?: string; leaseMs?: number } ) {
  const prefix = options.prefix || 'flow:session:';
  const leaseMs = options.leaseMs || OPERATION_LEASE_MS;
  function prune(document: SessionDocument, now: number) {
    document.semantics = retainSemantics(document.semantics || [], [], now);
    for (const [key, chain] of Object.entries(document.chains)) if (chain.updated + SESSION_TTL_MS <= now) delete document.chains[key];
    for (const [key, operation] of Object.entries(document.operations)) if (operation.updated + SESSION_TTL_MS <= now) delete document.operations[key];
    for (const [key, request] of Object.entries(document.requests)) if (request.updated + SESSION_TTL_MS <= now) delete document.requests[key];
  }
  async function mutate<T>(owner: string, change: (document: SessionDocument, now: number) => T, lease?: OperationLease): Promise<T> {
    const key = prefix + owner;
    for (let attempt = 0; attempt < 20; attempt++) {
      const saved = await backend.read(key), document: SessionDocument = saved.value ? JSON.parse(saved.value) : fresh();
      if (document.schemaVersion !== 1) throw new FlowError('SESSION_VERSION', '这次在线阅读的格式已经变化，已保存的经文仍可阅读。', 409);
      prune(document, saved.now);
      if (lease && !ownsLease(document, lease, saved.now)) throw lost();
      const result = change(document, saved.now);
      document.revision++;
      if (Object.keys(document.chains).length > 128 || Object.keys(document.operations).length > 2048 || Object.keys(document.requests).length > 4096) {
        throw new FlowError('SESSION_FULL', '这次阅读的在线记录已满，已保存的经文仍可阅读。', 429);
      }
      const value = JSON.stringify(document);
      if (value.length > 4 * 1024 * 1024) throw new FlowError('SESSION_FULL', '这次阅读的在线记录已满，已保存的经文仍可阅读。', 429);
      const committed = await backend.compareSwap(key, saved.value, value, SESSION_TTL_MS, lease);
      if (committed === 'lost') throw lost();
      if (committed === 'ok') return result;
    }
    throw new FlowError('CHAIN_BUSY', '这条联系正在展开，请稍后再试。', 409);
  }
  async function getChain(owner: string, id: string | undefined) {
    if (!id) throw expired();
    const { value, now } = await backend.read(prefix + owner);
    const document: SessionDocument | null = value ? JSON.parse(value) : null;
    if (document && document.schemaVersion !== 1) throw new FlowError('SESSION_VERSION', '这次在线阅读的格式已经变化，已保存的经文仍可阅读。', 409);
    const chain = document?.chains[id];
    if (!chain || chain.owner !== owner || chain.updated + SESSION_TTL_MS <= now) throw expired();
    return clone(chain);
  }
  return {
    getChain,
    reserve(owner: string, input: { requestId: string; fingerprint: string; key: string }) {
      return mutate(owner, (document, now) => {
        const requestKey = 'request:' + input.requestId;
        const previous = document.requests[requestKey];
        if (previous && (previous.fingerprint !== input.fingerprint || previous.key !== input.key)) {
          throw new FlowError('REQUEST_REUSED', '这次请求的内容发生变化，请重新展开。', 409);
        }
        const operation = document.operations[input.key];
        if (operation?.result) {
          document.requests[requestKey] = { fingerprint: input.fingerprint, key: input.key, updated: now };
          return { result: clone(operation.result), lease: null, chain: null, semantics: clone(document.semantics || []) };
        }
        if (operation && operation.expiresAt > now) throw new FlowError('CHAIN_BUSY', '这条联系正在展开。', 409);
        const next: Operation = { ...operation, version: (operation?.version || 0) + 1, holder: options.createId(), expiresAt: now + leaseMs, updated: now };
        document.operations[input.key] = next;
        document.requests[requestKey] = { fingerprint: input.fingerprint, key: input.key, updated: now };
        const chain = next.chainId ? document.chains[next.chainId] : null;
        return { lease: { key: input.key, holder: next.holder, version: next.version, expiresAt: next.expiresAt }, result: null,
          chain: chain ? clone(chain) : null, semantics: clone(document.semantics || []) };
      });
    },
    commitHead(owner: string, lease: OperationLease, state: StoredChain, parent?: { id: string; edge: string }) {
      return mutate(owner, (document, now) => {
        if (state.owner !== owner) throw expired();
        if (parent) {
          const ancestor = document.chains[parent.id];
          if (!ancestor || ancestor.owner !== owner) throw expired();
          const mapped = ancestor.branches[parent.edge];
          if (mapped && mapped !== state.chain.chainId) throw new FlowError('BRANCH_CHANGED', '这处联系已经展开，请返回后重试。', 409);
          ancestor.branches[parent.edge] = state.chain.chainId;
          ancestor.updated = now;
        }
        const existing = document.chains[state.chain.chainId];
        const saved = { ...clone(state), branches: { ...state.branches, ...existing?.branches }, updated: now };
        document.chains[state.chain.chainId] = saved;
        document.operations[lease.key]!.chainId = state.chain.chainId;
        return clone(saved);
      }, lease);
    },
    commitComplete(owner: string, lease: OperationLease, state: StoredChain, expectedCursor: string | null) {
      return mutate(owner, (document, now) => {
        const current = document.chains[state.chain.chainId];
        if (!current || current.owner !== owner) throw expired();
        if (current.chain.cursor !== expectedCursor) throw new FlowError('CURSOR_CHANGED', '阅读进度已更新，请继续当前经文。', 409);
        // A child can be created from the committed head during generation.
        // Always retain those freshly committed edges, not a worker's old copy.
        const saved = { ...clone(state), branches: { ...current.branches }, updated: now };
        document.semantics = retainSemantics(document.semantics || [], state.chain.frames, now);
        document.chains[state.chain.chainId] = saved;
        const operation = document.operations[lease.key]!;
        operation.result = clone(state.chain); operation.chainId = state.chain.chainId;
        operation.expiresAt = 0; operation.updated = now;
        return clone(saved.chain);
      }, lease);
    },
    renew(owner: string, lease: OperationLease) {
      return mutate(owner, (document, now) => {
        const operation = document.operations[lease.key]!;
        operation.expiresAt = now + leaseMs; operation.updated = now;
        return { ...lease, expiresAt: operation.expiresAt };
      }, lease);
    },
    async release(owner: string, lease: OperationLease) {
      try {
        return await mutate(owner, (document, now) => {
          const operation = document.operations[lease.key]!;
          operation.expiresAt = 0; operation.updated = now;
          return true;
        }, lease);
      } catch (error) { if (error instanceof FlowError && error.code === 'OPERATION_EXPIRED') return false; throw error; }
    },
  };
}
export type FlowSessionStore = ReturnType<typeof createSessionStore>;
