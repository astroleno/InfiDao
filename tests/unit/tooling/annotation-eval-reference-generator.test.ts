import {
  REFERENCE_CANDIDATES,
  ReferenceGenerationSchema,
  buildReferenceBatchPrompt,
  buildReferenceUserPrompt,
  parseReferenceBatch,
} from "../../../scripts/annotation-eval/reference-generator";
import { parseEvalFixture } from "../../../scripts/annotation-eval/contract";

const fixture = parseEvalFixture({
  schemaVersion: 1,
  evalId: "holdout-test",
  partition: "holdout",
  sealed: true,
  cases: [
    {
      id: "case-a",
      sourceId: "source-a",
      category: "uncertainty",
      scenario: "未知",
      query: "如何判断？",
      source: "论语",
      passage: "知之为知之。",
      style: "克制。",
      evaluationConstraints: {
        mustPreserve: ["SECRET_EXPECTATION"],
        sixToMe: ["前向要求"],
        meToSix: ["反向要求"],
        forbiddenClaims: ["禁说"],
        acceptableVariants: ["可接受"],
      },
      referenceAnswer: { sixToMe: "REFERENCE_SIX", meToSix: "REFERENCE_ME" },
    },
  ],
});

describe("annotation eval reference generators", () => {
  it("registers the exact six frozen reference generators", () => {
    expect(REFERENCE_CANDIDATES.map(candidate => candidate.id)).toEqual([
      "codex-luna-max",
      "codex-terra-max",
      "codex-sol-xhigh",
      "codex-sol-max",
      "kimi-for-coding",
      "kimi-k3",
    ]);
  });

  it("builds generator prompts without judge constraints or reference answers", () => {
    const prompt = buildReferenceBatchPrompt(fixture);

    expect(prompt).toContain("case-a");
    expect(prompt).toContain("知之为知之");
    expect(prompt).not.toContain("SECRET_EXPECTATION");
    expect(prompt).not.toContain("REFERENCE_SIX");
    expect(prompt).not.toContain("evaluationConstraints");
    expect(prompt).not.toContain("referenceAnswer");
  });

  it("keeps Kimi system instructions out of the user message", () => {
    const prompt = buildReferenceUserPrompt(fixture, "case-a");

    expect(prompt).toContain("case-a");
    expect(prompt).toContain("知之为知之");
    expect(prompt).not.toContain("你是古典文本双向注释生成器");
  });

  it("requires one and only one valid output per fixture case", () => {
    expect(
      parseReferenceBatch(
        { outputs: [{ caseId: "case-a", sixToMe: "前向", meToSix: "反向" }] },
        fixture,
      ),
    ).toEqual([{ caseId: "case-a", output: { sixToMe: "前向", meToSix: "反向" } }]);
    expect(() => parseReferenceBatch({ outputs: [] }, fixture)).toThrow(
      "reference batch case coverage mismatch",
    );
    expect(() =>
      parseReferenceBatch(
        {
          outputs: [
            { caseId: "case-a", sixToMe: "前向", meToSix: "反向" },
            { caseId: "case-a", sixToMe: "重复", meToSix: "重复" },
          ],
        },
        fixture,
      ),
    ).toThrow("duplicate reference case: case-a");
  });

  it("validates raw reference rows independently from DeepSeek generations", () => {
    expect(
      ReferenceGenerationSchema.parse({
        partition: "holdout",
        round: 1,
        caseId: "case-a",
        candidate: "codex-sol-max",
        model: "gpt-5.6-sol",
        effort: "max",
        valid: true,
        output: { sixToMe: "前向", meToSix: "反向" },
        metrics: { totalMs: 1000 },
      }).valid,
    ).toBe(true);
  });
});
