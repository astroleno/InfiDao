import type { UserStateSnapshot } from "@/lib/user-state/types";

export interface UserStateSessionStoreOptions {
  ttlMs?: number;
  maxEntries?: number;
}

interface StoredUserStateSnapshot {
  snapshot: UserStateSnapshot;
  expiresAt: number;
  insertedAt: number;
}

export const DEFAULT_USER_STATE_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_USER_STATE_MAX_ENTRIES = 100;

function cloneSnapshot(snapshot: UserStateSnapshot): UserStateSnapshot {
  return {
    ...snapshot,
    emotion: snapshot.emotion.map(signal => ({ ...signal })),
    intent: snapshot.intent.map(signal => ({ ...signal })),
    memoryAnchors: snapshot.memoryAnchors.map(anchor => ({ ...anchor })),
    personaHints: snapshot.personaHints.map(signal => ({ ...signal })),
  };
}

export function createUserStateSessionStore(options: UserStateSessionStoreOptions = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_USER_STATE_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_USER_STATE_MAX_ENTRIES;
  const entries = new Map<string, StoredUserStateSnapshot>();

  const prune = (now: number) => {
    for (const [id, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(id);
      }
    }

    while (entries.size > maxEntries) {
      const oldest = [...entries.entries()].sort(
        (left, right) => left[1].insertedAt - right[1].insertedAt,
      )[0]?.[0];

      if (!oldest) {
        break;
      }

      entries.delete(oldest);
    }
  };

  return {
    put(snapshot: UserStateSnapshot, now = Date.now()): void {
      prune(now);
      entries.set(snapshot.id, {
        snapshot: cloneSnapshot(snapshot),
        expiresAt: now + ttlMs,
        insertedAt: now,
      });
      prune(now);
    },

    get(snapshotId: string, now = Date.now()): UserStateSnapshot | null {
      prune(now);
      const entry = entries.get(snapshotId);
      return entry ? cloneSnapshot(entry.snapshot) : null;
    },

    listBySession(sessionId: string, now = Date.now()): UserStateSnapshot[] {
      prune(now);
      return [...entries.values()]
        .filter(entry => entry.snapshot.sessionId === sessionId)
        .sort((left, right) => left.insertedAt - right.insertedAt)
        .map(entry => cloneSnapshot(entry.snapshot));
    },

    clear(): void {
      entries.clear();
    },

    size(now = Date.now()): number {
      prune(now);
      return entries.size;
    },
  };
}

export const userStateSessionStore = createUserStateSessionStore();
