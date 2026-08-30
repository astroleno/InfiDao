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

  it("records v5 as the evidence-driven precision child of v4", () => {
    const prompt = getPromptVariant("v5");
    const instructions = prompt.instructions.join("\n");

    expect(prompt.parentId).toBe("v4");
    expect(prompt.frozen).toBe(true);
    expect(instructions).toContain("并列要素");
    expect(instructions).toContain("示例也不例外");
    expect(instructions).toContain("不得据此断定人的动机");
    expect(instructions).toContain("如何改变对原文的理解");
    expect(promptHash(prompt)).toBe(prompt.sha256);
  });

  it("records v6 as the compressed precision child of v4", () => {
    const prompt = getPromptVariant("v6");
    const instructions = prompt.instructions.join("\n");

    expect(prompt.parentId).toBe("v4");
    expect(prompt.frozen).toBe(true);
    expect(instructions).toContain("全组功能与关系");
    expect(instructions).toContain("不得推断说话者的动机");
    expect(instructions).toContain("不是再给一遍行动建议");
    expect(instructions.length).toBeLessThan(getPromptVariant("v5").instructions.join("\n").length);
    expect(promptHash(prompt)).toBe(prompt.sha256);
  });

  it("rejects unknown prompt ids", () => {
    expect(() => getPromptVariant("v404")).toThrow("unknown prompt variant: v404");
  });
});
