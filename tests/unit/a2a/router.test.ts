import { routeA2AEncounter } from "@/lib/a2a/router";
import type { UserStateSnapshot } from "@/lib/user-state/types";
import type { WorkAgentManifest } from "@/lib/work-agents/types";

const userState: UserStateSnapshot = {
  id: "user-state:test",
  sessionId: "session:test",
  utterance: "如何面对压力",
  emotion: [{ label: "pressure", confidence: 0.8, source: "query" }],
  intent: [{ label: "seek_guidance", confidence: 0.82, source: "query" }],
  memoryAnchors: [],
  personaHints: [],
  privacyMode: "ephemeral",
  createdAt: "2026-06-11T00:00:00.000Z",
};

const workAgent: WorkAgentManifest = {
  id: "work:classic:lunyu-1-1:abc123",
  kind: "classic_passage",
  title: "论语",
  source: "论语",
  canonicalRef: "classic:论语:学而篇:1:abc123",
  contentRef: {
    passageId: "lunyu-1-1",
    textHash: "abc123",
  },
  affectField: [{ label: "settling", confidence: 0.7, source: "passage" }],
  interpretiveFrames: [
    {
      id: "liu_jing_zhu_wo",
      label: "六经注我",
      description: "responds",
    },
  ],
  growthPolicy: {
    persist: "ephemeral_only",
    canGrow: true,
    allowedActs: ["encounter", "grow"],
    maxSummaryLength: 120,
  },
};

describe("A2A encounter router", () => {
  it("produces deterministic growth for the same encounter", () => {
    const first = routeA2AEncounter({
      userState,
      workAgent,
      createdAt: "2026-06-11T00:00:00.000Z",
    });
    const second = routeA2AEncounter({
      userState,
      workAgent,
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      enabled: true,
      growthEvent: {
        relationTheme: "寻求指引",
        branchLabel: "求取分寸",
        workAgentId: workAgent.id,
      },
    });
  });

  it("fails open when the work agent is invalid", () => {
    const result = routeA2AEncounter({
      userState,
      workAgent: { ...workAgent, id: "" },
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    expect(result).toEqual({
      enabled: false,
      reason: "work_agent_disabled",
    });
  });

  it("does not include raw utterance text in the growth summary", () => {
    const result = routeA2AEncounter({
      userState,
      workAgent,
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    expect(result.enabled).toBe(true);

    if (!result.enabled) {
      throw new Error("Expected growth event.");
    }

    expect(result.growthEvent.summary).not.toContain(userState.utterance);
    expect(result.growthEvent.summary).toContain("系统读到的倾向");
  });
});
