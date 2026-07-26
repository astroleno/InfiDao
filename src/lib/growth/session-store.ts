import type { GrowthEvent } from "@/lib/growth/types";

export interface GrowthSessionStoreOptions {
  ttlMs?: number;
  maxEventsPerSession?: number;
  maxSessions?: number;
}

interface StoredGrowthEvent {
  sessionId: string;
  event: GrowthEvent;
  expiresAt: number;
  insertedAt: number;
}

export const DEFAULT_GROWTH_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_GROWTH_MAX_EVENTS_PER_SESSION = 20;
export const DEFAULT_GROWTH_MAX_SESSIONS = 100;

function cloneEvent(event: GrowthEvent): GrowthEvent {
  return { ...event };
}

export function createGrowthSessionStore(options: GrowthSessionStoreOptions = {}) {
  const ttlMs = options.ttlMs ?? DEFAULT_GROWTH_TTL_MS;
  const maxEventsPerSession =
    options.maxEventsPerSession ?? DEFAULT_GROWTH_MAX_EVENTS_PER_SESSION;
  const maxSessions = options.maxSessions ?? DEFAULT_GROWTH_MAX_SESSIONS;
  const entries = new Map<string, StoredGrowthEvent>();

  const pruneExpired = (now: number) => {
    for (const [eventId, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(eventId);
      }
    }
  };

  const pruneSessionSize = (sessionId: string) => {
    const sessionEntries = [...entries.entries()]
      .filter(([, entry]) => entry.sessionId === sessionId)
      .sort((left, right) => left[1].insertedAt - right[1].insertedAt);

    while (sessionEntries.length > maxEventsPerSession) {
      const oldest = sessionEntries.shift();

      if (!oldest) {
        break;
      }

      entries.delete(oldest[0]);
    }
  };

  const pruneSessionCount = () => {
    const sessionIds = [...new Set([...entries.values()].map(entry => entry.sessionId))];

    if (sessionIds.length <= maxSessions) {
      return;
    }

    const sessionsByOldestEntry = sessionIds
      .map(sessionId => {
        const oldest = [...entries.values()]
          .filter(entry => entry.sessionId === sessionId)
          .sort((left, right) => left.insertedAt - right.insertedAt)[0];
        return { sessionId, insertedAt: oldest?.insertedAt ?? Number.MAX_SAFE_INTEGER };
      })
      .sort((left, right) => left.insertedAt - right.insertedAt);

    for (const session of sessionsByOldestEntry.slice(0, sessionIds.length - maxSessions)) {
      for (const [eventId, entry] of entries) {
        if (entry.sessionId === session.sessionId) {
          entries.delete(eventId);
        }
      }
    }
  };

  const prune = (now: number, sessionId?: string) => {
    pruneExpired(now);

    if (sessionId) {
      pruneSessionSize(sessionId);
    }

    pruneSessionCount();
  };

  return {
    append(sessionId: string, event: GrowthEvent, now = Date.now()): void {
      prune(now, sessionId);
      entries.set(event.id, {
        sessionId,
        event: cloneEvent(event),
        expiresAt: now + ttlMs,
        insertedAt: now,
      });
      prune(now, sessionId);
    },

    list(sessionId: string, now = Date.now()): GrowthEvent[] {
      prune(now, sessionId);
      return [...entries.values()]
        .filter(entry => entry.sessionId === sessionId)
        .sort((left, right) => left.insertedAt - right.insertedAt)
        .map(entry => cloneEvent(entry.event));
    },

    read(eventId: string, now = Date.now()): GrowthEvent | null {
      prune(now);
      const entry = entries.get(eventId);
      return entry ? cloneEvent(entry.event) : null;
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

export const growthSessionStore = createGrowthSessionStore();
