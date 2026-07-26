import { extractUserStateSnapshot } from "@/lib/user-state/extractor";

describe("user-state extractor", () => {
  it("handles empty input deterministically", () => {
    const snapshot = extractUserStateSnapshot({
      utterance: "   ",
      sessionId: "session:test",
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    expect(snapshot).toMatchObject({
      sessionId: "session:test",
      utterance: "",
      privacyMode: "ephemeral",
      emotion: [],
      intent: [],
      memoryAnchors: [],
    });
  });

  it("detects emotionally loaded guidance input", () => {
    const snapshot = extractUserStateSnapshot({
      utterance: "最近压力很大，我该如何安顿自己？",
      sessionId: "session:test",
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    expect(snapshot.emotion).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "pressure",
          confidence: expect.any(Number),
          source: "query",
        }),
      ]),
    );
    expect(snapshot.intent[0]).toMatchObject({
      label: "seek_guidance",
      source: "query",
    });
  });

  it("extracts memory anchors as labels rather than raw private text", () => {
    const raw = "我想起小时候和父母在很长很长的一段家庭争执里说过的话";
    const snapshot = extractUserStateSnapshot({
      utterance: raw,
      sessionId: "session:test",
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    expect(snapshot.intent).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "remember" })]),
    );
    expect(snapshot.memoryAnchors).toEqual([
      expect.objectContaining({
        label: "family",
        source: "query",
      }),
    ]);
    expect(snapshot.memoryAnchors.map(anchor => anchor.label).join(" ")).not.toContain(
      "小时候和父母",
    );
  });

  it("detects mixed Chinese and English signals", () => {
    const snapshot = extractUserStateSnapshot({
      utterance: "I feel uncertain，但还想继续探索下一句",
      sessionId: "session:test",
      createdAt: "2026-06-11T00:00:00.000Z",
    });

    expect(snapshot.emotion).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "uncertainty" })]),
    );
    expect(snapshot.intent).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "continue_exploration" })]),
    );
  });
});
