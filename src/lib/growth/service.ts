import type { GrowthEvent } from "@/lib/growth/types";
import { growthSessionStore } from "@/lib/growth/session-store";

export interface GrowthStoreLike {
  append(sessionId: string, event: GrowthEvent, now?: number): void;
  list(sessionId: string, now?: number): GrowthEvent[];
  read(eventId: string, now?: number): GrowthEvent | null;
}

export class GrowthService {
  constructor(private readonly store: GrowthStoreLike = growthSessionStore) {}

  append(sessionId: string, event: GrowthEvent, now = Date.now()): GrowthEvent | null {
    try {
      this.store.append(sessionId, event, now);
      return { ...event };
    } catch {
      return null;
    }
  }

  list(sessionId: string, now = Date.now()): GrowthEvent[] {
    try {
      return this.store.list(sessionId, now).map(event => ({ ...event }));
    } catch {
      return [];
    }
  }

  read(eventId: string, now = Date.now()): GrowthEvent | null {
    try {
      const event = this.store.read(eventId, now);
      return event ? { ...event } : null;
    } catch {
      return null;
    }
  }
}

export const growthService = new GrowthService();
