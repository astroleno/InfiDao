import { createUserStateSessionStore } from "@/lib/user-state/session-store";
import type { UserStateSnapshot } from "@/lib/user-state/types";

function snapshot(id: string, sessionId = "session:test"): UserStateSnapshot {
  return {
    id,
    sessionId,
    utterance: "如何面对压力",
    emotion: [{ label: "pressure", confidence: 0.8, source: "query" }],
    intent: [{ label: "seek_guidance", confidence: 0.82, source: "query" }],
    memoryAnchors: [],
    personaHints: [],
    privacyMode: "ephemeral",
    createdAt: "2026-06-11T00:00:00.000Z",
  };
}

describe("user-state session store", () => {
  it("expires snapshots by ttl", () => {
    const store = createUserStateSessionStore({ ttlMs: 100 });
    store.put(snapshot("user-state:1"), 1000);

    expect(store.get("user-state:1", 1050)).not.toBeNull();
    expect(store.get("user-state:1", 1200)).toBeNull();
  });

  it("returns defensive copies", () => {
    const store = createUserStateSessionStore();
    store.put(snapshot("user-state:1"), 1000);

    const stored = store.get("user-state:1", 1000);

    if (!stored) {
      throw new Error("Expected stored snapshot.");
    }

    stored.emotion[0]!.label = "mutated";

    expect(store.get("user-state:1", 1000)?.emotion[0]?.label).toBe("pressure");
  });

  it("evicts old entries over max size", () => {
    const store = createUserStateSessionStore({ maxEntries: 1 });
    store.put(snapshot("user-state:1"), 1000);
    store.put(snapshot("user-state:2"), 1001);

    expect(store.get("user-state:1", 1002)).toBeNull();
    expect(store.get("user-state:2", 1002)).not.toBeNull();
  });
});
