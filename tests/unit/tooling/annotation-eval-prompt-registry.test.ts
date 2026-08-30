import {
  getPromptVariant,
  promptHash,
} from "../../../scripts/annotation-eval/prompt-registry";

describe("annotation eval prompt registry", () => {
  it("reproduces the frozen v3 hash", () => {
    const prompt = getPromptVariant("v3");

    expect(prompt.sha256).toBe(
      "736e3a223ed96798945c4a1a7de4aab82db34c78045a358af760acccd64c2baf",
    );
    expect(promptHash(prompt)).toBe(prompt.sha256);
  });

  it("returns deeply frozen prompt definitions", () => {
    const prompt = getPromptVariant("v4");

    expect(Object.isFrozen(prompt)).toBe(true);
    expect(Object.isFrozen(prompt.instructions)).toBe(true);
    expect(Object.isFrozen(prompt.expectedImprovements)).toBe(true);
    expect(Object.isFrozen(prompt.regressionRisks)).toBe(true);
  });

  it("records v4 as a conditional-constraint child of v3", () => {
    const prompt = getPromptVariant("v4");

    expect(prompt.parentId).toBe("v3");
    expect(prompt.instructions.join("\n")).toContain("只应用命中的规则");
    expect(prompt.instructions.join("\n")).toContain("未命中的规则不得写入答案");
    expect(prompt.instructions.join("\n")).toContain("若属于制度执行");
    expect(prompt.instructions.join("\n")).toContain("若属于关系支持或互惠");
  });

  it("rejects unknown prompt ids", () => {
    expect(() => getPromptVariant("v404")).toThrow("unknown prompt variant: v404");
  });
});
