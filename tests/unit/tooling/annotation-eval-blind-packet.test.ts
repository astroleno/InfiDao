import {
  assertBlindPacketHasNoIdentityLeaks,
  buildBlindPacket,
  type BuildBlindPacketInput,
} from "../../../scripts/annotation-eval/blind-packet";
import { parseEvalFixture } from "../../../scripts/annotation-eval/contract";

function buildInput(round = 1): BuildBlindPacketInput {
  const fixture = parseEvalFixture({
    schemaVersion: 1,
    evalId: "annotation-dev-v2",
    partition: "dev",
    sealed: false,
    cases: [
      {
        id: "dev-1",
        sourceId: "rysxguji-lunyu-7-26",
        category: "uncertainty",
        scenario: "证据不足",
        query: "怎样保留疑问？",
        source: "论语",
        passage: "多闻阙疑，慎言其余。",
        style: "直接、清楚。",
        evaluationConstraints: {
          mustPreserve: ["保留疑问"],
          sixToMe: ["区分证据"],
          meToSix: ["增加验证机制"],
          forbiddenClaims: ["不得假装确定"],
          acceptableVariants: ["说明未知"],
        },
      },
      {
        id: "dev-2",
        sourceId: "rysxguji-daxue-1-2",
        category: "resource-priority",
        scenario: "项目排序",
        query: "怎样判断先后？",
        source: "大学",
        passage: "物有本末，事有终始。",
        style: "克制、清晰。",
        evaluationConstraints: {
          mustPreserve: ["区分本末"],
          sixToMe: ["回答优先级"],
          meToSix: ["增加机会成本"],
          forbiddenClaims: ["不得只看紧急程度"],
          acceptableVariants: ["识别瓶颈"],
        },
      },
    ],
  });
  return {
    fixture,
    round,
    candidateOutputs: {
      deepseek_v4: {
        "dev-1": { sixToMe: "d1 前向", meToSix: "d1 反向" },
        "dev-2": { sixToMe: "d2 前向", meToSix: "d2 反向" },
      },
      codex_sol: {
        "dev-1": { sixToMe: "c1 前向", meToSix: "c1 反向" },
        "dev-2": { sixToMe: "c2 前向", meToSix: "c2 反向" },
      },
    },
  };
}

describe("annotation eval blind packets", () => {
  it("is deterministic for the same eval round", () => {
    expect(buildBlindPacket(buildInput())).toEqual(buildBlindPacket(buildInput()));
  });

  it("varies mappings by round while preserving complete labels", () => {
    const round1 = buildBlindPacket(buildInput(1));
    const round2 = buildBlindPacket(buildInput(2));

    expect(round1.mapping).not.toEqual(round2.mapping);
    expect(round1.mapping).toHaveLength(4);
    expect(round1.packet.every(testCase => Object.keys(testCase.candidates).sort().join("") === "AB")).toBe(
      true,
    );
  });

  it.each([
    "deepseek_v4",
    "codex_",
    "kimi_",
    "promptHash",
    "referenceAnswer",
    "expectations",
  ])("rejects %s identity leakage", marker => {
    const { packet } = buildBlindPacket(buildInput());
    packet[0].candidates.A.sixToMe = `泄漏 ${marker}`;

    expect(() => assertBlindPacketHasNoIdentityLeaks(packet)).toThrow(marker);
  });

  it("rejects missing candidate output for any case", () => {
    const input = buildInput();
    delete input.candidateOutputs.deepseek_v4["dev-2"];

    expect(() => buildBlindPacket(input)).toThrow("missing candidate output: deepseek_v4/dev-2");
  });
});
