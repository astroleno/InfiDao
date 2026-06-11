import {
  assertAgentMessage,
  createAgentMessage,
  createTraceId,
  isAgentMessage,
} from "@/lib/a2a/message";
import { isAgentMessageAct } from "@/lib/a2a/types";

describe("A2A agent messages", () => {
  it("accepts known message acts and rejects unknown acts", () => {
    expect(isAgentMessageAct("encounter")).toBe(true);
    expect(isAgentMessageAct("grow")).toBe(true);
    expect(isAgentMessageAct("diagnose")).toBe(false);
    expect(isAgentMessageAct(null)).toBe(false);
  });

  it("creates stable messages for the same trace and timestamp", () => {
    const traceId = createTraceId(["user-state:1", "work:1"], "2026-06-11T00:00:00.000Z");
    const first = createAgentMessage({
      traceId,
      from: "user-state:1",
      to: "work:1",
      act: "encounter",
      createdAt: "2026-06-11T00:00:00.000Z",
      payload: {
        userStateId: "user-state:1",
        workAgentId: "work:1",
      },
    });
    const second = createAgentMessage({
      traceId,
      from: "user-state:1",
      to: "work:1",
      act: "encounter",
      createdAt: "2026-06-11T00:00:00.000Z",
      payload: {
        userStateId: "user-state:1",
        workAgentId: "work:1",
      },
    });

    expect(first).toEqual(second);
    expect(isAgentMessage(first)).toBe(true);
  });

  it("rejects malformed payload envelopes", () => {
    expect(
      isAgentMessage({
        id: "msg:1",
        traceId: "trace:1",
        from: "user",
        to: "work",
        act: "encounter",
        createdAt: "2026-06-11T00:00:00.000Z",
      }),
    ).toBe(false);

    expect(() => assertAgentMessage({ act: "grow" })).toThrow("Malformed A2A agent message");
  });
});
