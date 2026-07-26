import { GrowthService } from "@/lib/growth/service";
import type { GrowthEvent } from "@/lib/growth/types";

const growthEvent: GrowthEvent = {
  id: "growth:test",
  traceId: "trace:test",
  userStateId: "user-state:test",
  workAgentId: "work:test",
  act: "grow",
  relationTheme: "寻求指引",
  branchLabel: "求取分寸",
  summary: "系统读到的倾向形成一次关系枝条。",
  confidence: 0.76,
  createdAt: "2026-06-11T00:00:00.000Z",
};

describe("growth service", () => {
  it("fails open when the backing store throws", () => {
    const service = new GrowthService({
      append: () => {
        throw new Error("store unavailable");
      },
      list: () => {
        throw new Error("store unavailable");
      },
      read: () => {
        throw new Error("store unavailable");
      },
    });

    expect(service.append("session:test", growthEvent)).toBeNull();
    expect(service.list("session:test")).toEqual([]);
    expect(service.read("growth:test")).toBeNull();
  });
});
