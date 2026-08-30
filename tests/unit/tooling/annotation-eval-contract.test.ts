import fs from "node:fs";
import path from "node:path";
import {
  assertDisjointPartitions,
  assertFixtureHash,
  fixtureHash,
  parseEvalFixture,
  parseGeneration,
  parseJudgment,
  type EvalCase,
} from "../../../scripts/annotation-eval/contract";

const constraints = {
  mustPreserve: ["保留原文的核心关系"],
  sixToMe: ["直接回答问题"],
  meToSix: ["增加一个现代机制"],
  forbiddenClaims: ["不得虚构原意"],
  acceptableVariants: ["可使用条件表达"],
};

function buildCase(id: string, overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id,
    sourceId: `source-${id}`,
    category: "uncertainty",
    scenario: `场景-${id}`,
    query: `问题-${id}`,
    source: "论语",
    passage: `原文-${id}，后句-${id}。`,
    style: "直接、清楚、可落地。",
    evaluationConstraints: constraints,
    ...overrides,
  };
}

function buildFixture(partition: "dev" | "holdout" | "golden", cases: EvalCase[]) {
  return {
    schemaVersion: 1,
    evalId: `annotation-${partition}-v2`,
    partition,
    sealed: partition !== "dev",
    cases,
  };
}

describe("annotation eval contracts", () => {
  it("parses a valid fixture", () => {
    const fixture = parseEvalFixture(buildFixture("dev", [buildCase("dev-1")]));

    expect(fixture.partition).toBe("dev");
    expect(fixture.cases).toHaveLength(1);
  });

  it("rejects duplicate case ids", () => {
    expect(() =>
      parseEvalFixture(buildFixture("dev", [buildCase("same"), buildCase("same")])),
    ).toThrow("duplicate case id: same");
  });

  it("rejects duplicate normalized queries in one fixture", () => {
    expect(() =>
      parseEvalFixture(
        buildFixture("dev", [
          buildCase("dev-1", { query: "同一个问题？" }),
          buildCase("dev-2", { query: " 同一个问题 " }),
        ]),
      ),
    ).toThrow("duplicate normalized query");
  });

  it("rejects query overlap across partitions", () => {
    const dev = parseEvalFixture(
      buildFixture("dev", [buildCase("dev-1", { query: "如何判断证据？" })]),
    );
    const holdout = parseEvalFixture(
      buildFixture("holdout", [buildCase("holdout-1", { query: " 如何判断证据 " })]),
    );

    expect(() => assertDisjointPartitions([dev, holdout])).toThrow(
      "partition overlap: normalized query",
    );
  });

  it("rejects passage-clause overlap across partitions", () => {
    const dev = parseEvalFixture(
      buildFixture("dev", [buildCase("dev-1", { passage: "共同句子，开发后句。" })]),
    );
    const holdout = parseEvalFixture(
      buildFixture("holdout", [buildCase("holdout-1", { passage: "开头不同；共同句子。" })]),
    );

    expect(() => assertDisjointPartitions([dev, holdout])).toThrow(
      "partition overlap: passage clause",
    );
  });

  it("accepts integer judgment scores from one through five", () => {
    expect(() =>
      parseJudgment({
        caseId: "dev-1",
        scores: {
          A: {
            passageFidelity: 5,
            queryRelevance: 4,
            dualDirection: 5,
            interpretiveDepth: 4,
            semanticPrecision: 5,
            hardFails: [],
            failureTags: [],
          },
        },
        ranking: ["A"],
        caseAmbiguity: { ambiguous: false, reason: "边界明确" },
        note: "符合约束",
      }),
    ).not.toThrow();
  });

  it("rejects out-of-range judgment scores", () => {
    expect(() =>
      parseJudgment({
        caseId: "dev-1",
        scores: {
          A: {
            passageFidelity: 6,
            queryRelevance: 4,
            dualDirection: 5,
            interpretiveDepth: 4,
            semanticPrecision: 5,
            hardFails: [],
            failureTags: [],
          },
        },
        ranking: ["A"],
        caseAmbiguity: { ambiguous: false, reason: "边界明确" },
        note: "非法分数",
      }),
    ).toThrow();
  });

  it("rejects a generation with output fields beyond the two-field contract", () => {
    expect(() =>
      parseGeneration({
        partition: "dev",
        round: 1,
        caseId: "dev-1",
        variant: "v4",
        promptHash: "a".repeat(64),
        model: "deepseek-v4-flash",
        thinking: "disabled",
        temperature: 0.35,
        maxTokens: 240,
        attempt: 1,
        valid: true,
        output: { sixToMe: "前向", meToSix: "反向", extra: "泄漏" },
        metrics: {
          headersMs: 10,
          firstEventMs: 11,
          firstReasoningMs: null,
          firstContentMs: 20,
          totalMs: 100,
          finishReason: "stop",
          reasoningCharacters: 0,
          promptTokens: 100,
          completionTokens: 50,
          reasoningTokens: 0,
          totalTokens: 150,
          cachedPromptTokens: 0,
          cost: null,
        },
      }),
    ).toThrow();
  });

  it("validates the frozen project fixtures and their hashes", () => {
    const readFixture = (name: string) =>
      parseEvalFixture(
        JSON.parse(
          fs.readFileSync(
            path.join(process.cwd(), "tests/fixtures/annotation-eval", name),
            "utf8",
          ),
        ) as unknown,
      );
    const dev = readFixture("dev-v2.json");
    const holdout = readFixture("holdout-v2.json");
    const golden = readFixture("golden-v1.json");

    expect(() => assertFixtureHash(dev)).not.toThrow();
    expect(() => assertFixtureHash(holdout)).not.toThrow();
    expect(() => assertFixtureHash(golden)).not.toThrow();
    expect(fixtureHash(holdout)).toBe(holdout.fixtureSha256);
    expect(() => assertDisjointPartitions([dev, holdout, golden])).not.toThrow();
    expect(golden.cases.every(testCase => testCase.referenceAnswer)).toBe(true);
  });

  it("has exactly three dev and two holdout cases in every routed category", () => {
    const read = (name: string) =>
      parseEvalFixture(
        JSON.parse(
          fs.readFileSync(
            path.join(process.cwd(), "tests/fixtures/annotation-eval", name),
            "utf8",
          ),
        ) as unknown,
      );
    const counts = (name: string) =>
      Object.fromEntries(
        read(name).cases.reduce<Map<string, number>>((map, testCase) => {
          map.set(testCase.category, (map.get(testCase.category) ?? 0) + 1);
          return map;
        }, new Map()),
      );

    expect(counts("dev-v2.json")).toEqual({
      uncertainty: 3,
      "resource-priority": 3,
      "institution-execution": 3,
      "agency-environment": 3,
      "relationship-consent": 3,
      "change-experiment": 3,
    });
    expect(counts("holdout-v2.json")).toEqual({
      uncertainty: 2,
      "resource-priority": 2,
      "institution-execution": 2,
      "agency-environment": 2,
      "relationship-consent": 2,
      "change-experiment": 2,
    });
  });

  it("anchors every frozen passage to its declared corpus source", () => {
    const corpus = new Map(
      fs
        .readFileSync(
          path.join(process.cwd(), "data/rysxguji/guji-core-v1.jsonl"),
          "utf8",
        )
        .trim()
        .split("\n")
        .map(line => {
          const row = JSON.parse(line) as { id: string; source: string; text: string };
          return [row.id, row] as const;
        }),
    );
    for (const filename of ["dev-v2.json", "holdout-v2.json", "golden-v1.json"]) {
      const fixture = parseEvalFixture(
        JSON.parse(
          fs.readFileSync(
            path.join(process.cwd(), "tests/fixtures/annotation-eval", filename),
            "utf8",
          ),
        ) as unknown,
      );
      for (const testCase of fixture.cases) {
        const source = corpus.get(testCase.sourceId);
        expect(source?.source).toBe(testCase.source);
        for (const clause of testCase.passage.split(/[，。；！？、：]/u).filter(Boolean)) {
          expect(source?.text).toContain(clause);
        }
      }
    }
  });
});
