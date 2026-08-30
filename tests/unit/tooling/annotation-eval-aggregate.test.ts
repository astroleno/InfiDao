import {
  aggregateEvaluation,
  decidePromotion,
  distribution,
  exactTwoSidedP,
  normalizeJudgmentRows,
  renderEvaluationReport,
} from "../../../scripts/annotation-eval/aggregate";
import type { CandidateScore, Generation } from "../../../scripts/annotation-eval/contract";

const perfectScore: CandidateScore = {
  passageFidelity: 5,
  queryRelevance: 5,
  dualDirection: 5,
  interpretiveDepth: 5,
  semanticPrecision: 5,
  hardFails: [],
  failureTags: [],
};

const referenceScore: CandidateScore = {
  passageFidelity: 4,
  queryRelevance: 4,
  dualDirection: 4,
  interpretiveDepth: 4,
  semanticPrecision: 4,
  hardFails: [],
  failureTags: [],
};

function judgmentShape(field: "scores" | "candidates" | "direct") {
  const base = {
    caseId: "case-1",
    ranking: ["A", "B"],
    caseAmbiguity: { ambiguous: false, reason: "边界明确" },
    note: "A 更完整",
  };
  const scores = { A: perfectScore, B: referenceScore };
  if (field === "scores") return { ...base, scores };
  if (field === "candidates") return { ...base, candidates: scores };
  return { ...base, ...scores };
}

const generationMetrics = {
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
};

function generation(variant: string, valid = true): Generation {
  return {
    partition: "holdout",
    round: 1,
    caseId: "case-1",
    variant,
    promptHash: "a".repeat(64),
    model: "deepseek-v4-flash",
    thinking: "disabled",
    temperature: 0.35,
    maxTokens: 240,
    attempt: 1,
    valid,
    ...(valid
      ? { output: { sixToMe: "前向", meToSix: "反向" }, metrics: generationMetrics }
      : { error: "invalid JSON" }),
  };
}

describe("annotation eval aggregation", () => {
  it.each(["scores", "candidates", "direct"] as const)(
    "normalizes %s judge score shapes",
    shape => {
      const rows = normalizeJudgmentRows([judgmentShape(shape)]);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.scores.A).toEqual(perfectScore);
      expect(rows[0]!.scores.B).toEqual(referenceScore);
    },
  );

  it("applies exact promotion boundaries", () => {
    expect(
      decidePromotion({
        validJsonRate: 1,
        average25: 24.2,
        passageFidelity: 4.7,
        semanticPrecision: 4.7,
        hardFailReviews: 0,
        gapToGeneratorConsensus: 0.75,
        knownGoldenRegression: 0.5,
      }).promotionPassed,
    ).toBe(true);
    expect(
      decidePromotion({
        validJsonRate: 1,
        average25: 24.199,
        passageFidelity: 4.7,
        semanticPrecision: 4.7,
        hardFailReviews: 0,
        gapToGeneratorConsensus: 0.75,
        knownGoldenRegression: 0.5,
      }).promotionPassed,
    ).toBe(false);
    expect(
      decidePromotion({
        validJsonRate: 1,
        average25: 24.2,
        passageFidelity: 4.7,
        semanticPrecision: 4.7,
        hardFailReviews: 1,
        gapToGeneratorConsensus: 0.75,
        knownGoldenRegression: 0.5,
      }).promotionPassed,
    ).toBe(false);
    const unknownRegression = decidePromotion({
      validJsonRate: 1,
      average25: 25,
      passageFidelity: 5,
      semanticPrecision: 5,
      hardFailReviews: 0,
      gapToGeneratorConsensus: 0,
      knownGoldenRegression: null,
    });
    expect(unknownRegression.promotionPassed).toBe(false);
    expect(unknownRegression.gates.knownGoldenRegression).toMatchObject({
      actual: null,
      pass: false,
    });
  });

  it("calculates interpolated distributions", () => {
    expect(distribution([1, 2, 3, 10])).toEqual({
      mean: 4,
      p50: 2.5,
      p95: 8.95,
      min: 1,
      max: 10,
    });
  });

  it("calculates exact two-sided binomial probabilities", () => {
    expect(exactTwoSidedP(26, 2)).toBeCloseTo(0.000003, 6);
    expect(exactTwoSidedP(16, 10)).toBeCloseTo(0.32694, 5);
  });

  it("maps anonymous scores back to candidates and renders the gate", () => {
    const result = aggregateEvaluation({
      evalId: "annotation-holdout-v2",
      partition: "holdout",
      promptHash: "a".repeat(64),
      targetCandidate: "deepseek_v4",
      referenceCandidates: ["codex_sol"],
      generations: [generation("deepseek_v4"), generation("codex_sol")],
      mappings: [
        { round: 1, caseId: "case-1", label: "A", candidate: "deepseek_v4" },
        { round: 1, caseId: "case-1", label: "B", candidate: "codex_sol" },
      ],
      judgeBatches: [{ judge: "sol", round: 1, rows: [judgmentShape("scores")] }],
      knownGoldenRegression: 0,
      referenceOutputCount: 7,
    });

    expect(result.promotionPassed).toBe(true);
    expect(result.protocol.generatedOutputs).toBe(9);
    expect(result.protocol.candidateReviews).toBe(2);
    expect(result.ranking[0]).toMatchObject({ candidate: "deepseek_v4", average25: 25 });
    expect(result.generatorConsensusAverage25).toBe(20);
    const report = renderEvaluationReport(result);
    expect(report).toContain("Promotion: **pass**");
    expect(report).toContain("## Ranking");
    expect(report).toContain("| deepseek_v4 | 25.000 | 1 | 1.000 | 0 |");
    expect(report).toContain("## Pairwise");
    expect(report).toContain("codex_sol");
    expect(report).toContain("## DeepSeek streaming metrics");
    expect(report).toContain("| First content | 20.000 | 20.000 | 20.000 | 20.000 | 20.000 |");
  });
});
