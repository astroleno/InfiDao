import { createGrowthSessionStore } from "@/lib/growth/session-store";
import type { GrowthEvent } from "@/lib/growth/types";

function event(id: string): GrowthEvent {
  return {
    id,
    traceId: `trace:${id}`,
    userStateId: "user-state:test",
    workAgentId: "work:test",
    act: "grow",
    relationTheme: "寻求指引",
    branchLabel: "求取分寸",
    summary: "系统读到的倾向形成一次关系枝条。",
    confidence: 0.76,
    createdAt: "2026-06-11T00:00:00.000Z",
  };
}

describe("growth session store", () => {
  it("expires events by ttl", () => {
    const store = createGrowthSessionStore({ ttlMs: 100 });
    store.append("session:test", event("growth:1"), 1000);

    expect(store.list("session:test", 1050)).toHaveLength(1);
    expect(store.list("session:test", 1200)).toHaveLength(0);
  });

  it("evicts old events beyond the per-session max", () => {
    const store = createGrowthSessionStore({ maxEventsPerSession: 1 });
    store.append("session:test", event("growth:1"), 1000);
    store.append("session:test", event("growth:2"), 1001);

    expect(store.list("session:test", 1002).map(item => item.id)).toEqual(["growth:2"]);
  });

  it("returns defensive copies", () => {
    const store = createGrowthSessionStore();
    store.append("session:test", event("growth:1"), 1000);

    const stored = store.read("growth:1", 1000);

    if (!stored) {
      throw new Error("Expected stored growth event.");
    }

    stored.summary = "mutated";

    expect(store.read("growth:1", 1000)?.summary).toBe(
      "系统读到的倾向形成一次关系枝条。",
    );
  });

  it("stores summaries and ids without raw utterance fields", () => {
    const store = createGrowthSessionStore();
    store.append("session:test", event("growth:1"), 1000);

    expect(JSON.stringify(store.list("session:test", 1000))).not.toContain("utterance");
    expect(JSON.stringify(store.list("session:test", 1000))).not.toContain("如何面对压力");
  });
});
