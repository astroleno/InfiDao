import {
  AggregateResultSchema,
  CandidateScoreSchema,
  SCORE_DIMENSIONS,
  parseJudgment,
  type CandidateScore,
  type Generation,
  type Judgment,
} from "./contract";
import type { BlindMapping } from "./blind-packet";

export interface PromotionMetrics {
  validJsonRate: number;
  average25: number;
  passageFidelity: number;
  semanticPrecision: number;
  hardFailReviews: number;
  gapToGeneratorConsensus: number;
  knownGoldenRegression: number;
}

export interface EvaluationGate {
  actual: number;
  pass: boolean;
  target?: number;
  targetMinimum?: number;
  targetMaximum?: number;
}

export interface JudgeBatch {
  judge: string;
  round: number;
  rows: unknown;
}

export interface AggregateInput {
  evalId: string;
  partition: "dev" | "holdout" | "golden";
  promptHash: string;
  targetCandidate: string;
  referenceCandidates: string[];
  generations: Generation[];
  mappings: BlindMapping[];
  judgeBatches: JudgeBatch[];
  knownGoldenRegression: number;
}

interface CandidateReview extends CandidateScore {
  judge: string;
  round: number;
  caseId: string;
  candidate: string;
  total: number;
  rank: number;
}

export interface CandidateSummary {
  candidate: string;
  totalPoints: number;
  maxPoints: number;
  average25: number;
  firstPlaceVotes: number;
  averageRank: number;
  hardFailReviews: number;
  hardFailFlags: number;
  dimensions: Record<(typeof SCORE_DIMENSIONS)[number], number>;
  rounds: Record<string, number>;
  failureTags: Record<string, number>;
}

export interface MetricDistribution {
  mean: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
}

export interface EvaluationResult {
  schemaVersion: 1;
  evalId: string;
  partition: "dev" | "holdout" | "golden";
  promptHash: string;
  targetCandidate: string;
  protocol: {
    generatedOutputs: number;
    candidateReviews: number;
    dimensionScores: number;
    judges: string[];
    rounds: number[];
  };
  ranking: CandidateSummary[];
  generatorConsensusAverage25: number;
  gapToGeneratorConsensus: number;
  pairwise: Array<{
    generator: string;
    targetWins: number;
    generatorWins: number;
    ties: number;
    exactTwoSidedP: number;
  }>;
  gates: Record<string, EvaluationGate>;
  promotionPassed: boolean;
  metrics: {
    samples: number;
    firstContentMs: MetricDistribution;
    totalMs: MetricDistribution;
    promptTokens: MetricDistribution;
    completionTokens: MetricDistribution;
    totalTokens: MetricDistribution;
    visibleCharacters: MetricDistribution;
  };
}

const roundNumber = (value: number, digits = 3): number => Number(value.toFixed(digits));
const mean = (values: number[]): number => {
  if (values.length === 0) throw new Error("cannot calculate mean of empty values");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export function distribution(values: number[]): MetricDistribution {
  if (values.length === 0) throw new Error("cannot calculate distribution of empty values");
  const data = [...values].sort((left, right) => left - right);
  const quantile = (q: number): number => {
    const index = (data.length - 1) * q;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return data[lower]!;
    return data[lower]! + (data[upper]! - data[lower]!) * (index - lower);
  };
  return {
    mean: roundNumber(mean(data)),
    p50: roundNumber(quantile(0.5)),
    p95: roundNumber(quantile(0.95)),
    min: data[0]!,
    max: data[data.length - 1]!,
  };
}

function binomialCoefficient(n: number, k: number): number {
  const short = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= short; index += 1) {
    result = (result * (n - short + index)) / index;
  }
  return result;
}

export function exactTwoSidedP(leftWins: number, rightWins: number): number {
  const n = leftWins + rightWins;
  if (n === 0) return 1;
  const tail = Math.min(leftWins, rightWins);
  let probability = 0;
  for (let index = 0; index <= tail; index += 1) {
    probability += binomialCoefficient(n, index) / 2 ** n;
  }
  return roundNumber(Math.min(1, 2 * probability), 6);
}

export function decidePromotion(metrics: PromotionMetrics): {
  gates: Record<string, EvaluationGate>;
  promotionPassed: boolean;
} {
  const gates: Record<string, EvaluationGate> = {
    validJsonRate: {
      actual: metrics.validJsonRate,
      target: 1,
      pass: metrics.validJsonRate === 1,
    },
    average25: {
      actual: metrics.average25,
      targetMinimum: 24.2,
      pass: metrics.average25 >= 24.2,
    },
    passageFidelity: {
      actual: metrics.passageFidelity,
      targetMinimum: 4.7,
      pass: metrics.passageFidelity >= 4.7,
    },
    semanticPrecision: {
      actual: metrics.semanticPrecision,
      targetMinimum: 4.7,
      pass: metrics.semanticPrecision >= 4.7,
    },
    hardFailReviews: {
      actual: metrics.hardFailReviews,
      targetMaximum: 0,
      pass: metrics.hardFailReviews === 0,
    },
    gapToGeneratorConsensus: {
      actual: metrics.gapToGeneratorConsensus,
      targetMaximum: 0.75,
      pass: metrics.gapToGeneratorConsensus <= 0.75,
    },
    knownGoldenRegression: {
      actual: metrics.knownGoldenRegression,
      targetMaximum: 0.5,
      pass: metrics.knownGoldenRegression <= 0.5,
    },
  };
  return { gates, promotionPassed: Object.values(gates).every(gate => gate.pass) };
}

export function normalizeJudgmentRows(value: unknown): Judgment[] {
  if (!Array.isArray(value)) throw new Error("judgment rows must be an array");
  return value.map(rawValue => {
    if (typeof rawValue !== "object" || rawValue === null) {
      throw new Error("judgment row must be an object");
    }
    const raw = rawValue as Record<string, unknown>;
    const directScores = Object.fromEntries(
      Object.entries(raw).filter(([key, score]) =>
        /^[A-Z]$/u.test(key) && CandidateScoreSchema.safeParse(score).success,
      ),
    );
    const scores = raw.scores ?? raw.candidates ?? directScores;
    return parseJudgment({
      caseId: String(raw.caseId ?? raw.case ?? ""),
      scores,
      ranking: raw.ranking,
      caseAmbiguity: raw.caseAmbiguity,
      note: raw.note ?? "",
    });
  });
}

function scoreTotal(score: CandidateScore): number {
  return SCORE_DIMENSIONS.reduce((sum, dimension) => sum + score[dimension], 0);
}

function candidateSummary(candidate: string, reviews: CandidateReview[]): CandidateSummary {
  const rows = reviews.filter(review => review.candidate === candidate);
  if (rows.length === 0) throw new Error(`candidate has no reviews: ${candidate}`);
  const tagCounts: Record<string, number> = {};
  for (const row of rows) {
    for (const tag of row.failureTags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }
  const rounds = [...new Set(rows.map(row => row.round))].sort((left, right) => left - right);
  return {
    candidate,
    totalPoints: rows.reduce((sum, row) => sum + row.total, 0),
    maxPoints: rows.length * 25,
    average25: roundNumber(mean(rows.map(row => row.total))),
    firstPlaceVotes: rows.filter(row => row.rank === 1).length,
    averageRank: roundNumber(mean(rows.map(row => row.rank))),
    hardFailReviews: rows.filter(row => row.hardFails.length > 0).length,
    hardFailFlags: rows.reduce((sum, row) => sum + row.hardFails.length, 0),
    dimensions: Object.fromEntries(
      SCORE_DIMENSIONS.map(dimension => [
        dimension,
        roundNumber(mean(rows.map(row => row[dimension]))),
      ]),
    ) as CandidateSummary["dimensions"],
    rounds: Object.fromEntries(
      rounds.map(round => [
        String(round),
        roundNumber(mean(rows.filter(row => row.round === round).map(row => row.total))),
      ]),
    ),
    failureTags: Object.fromEntries(
      Object.entries(tagCounts).sort((left, right) => right[1] - left[1]),
    ),
  };
}

export function aggregateEvaluation(input: AggregateInput): EvaluationResult {
  const mapping = new Map(
    input.mappings.map(row => [`${row.round}:${row.caseId}:${row.label}`, row.candidate]),
  );
  if (mapping.size !== input.mappings.length) throw new Error("duplicate blind mapping key");
  const reviews: CandidateReview[] = [];
  for (const batch of input.judgeBatches) {
    for (const row of normalizeJudgmentRows(batch.rows)) {
      for (const [label, score] of Object.entries(row.scores)) {
        const candidate = mapping.get(`${batch.round}:${row.caseId}:${label}`);
        if (!candidate) throw new Error(`missing blind mapping: ${batch.round}/${row.caseId}/${label}`);
        reviews.push({
          judge: batch.judge,
          round: batch.round,
          caseId: row.caseId,
          candidate,
          ...score,
          total: scoreTotal(score),
          rank: row.ranking.indexOf(label) + 1,
        });
      }
    }
  }
  const candidates = [...new Set(input.mappings.map(row => row.candidate))];
  const ranking = candidates.map(candidate => candidateSummary(candidate, reviews));
  ranking.sort(
    (left, right) =>
      right.totalPoints - left.totalPoints ||
      left.hardFailReviews - right.hardFailReviews ||
      left.averageRank - right.averageRank,
  );
  const target = ranking.find(row => row.candidate === input.targetCandidate);
  if (!target) throw new Error(`target candidate not reviewed: ${input.targetCandidate}`);
  const referenceReviews = reviews.filter(review =>
    input.referenceCandidates.includes(review.candidate),
  );
  if (referenceReviews.length === 0) throw new Error("reference candidates have no reviews");
  const generatorConsensusAverage25 = roundNumber(
    mean(referenceReviews.map(review => review.total)),
  );
  const gapToGeneratorConsensus = roundNumber(
    generatorConsensusAverage25 - target.average25,
  );
  const targetGenerations = input.generations.filter(
    generation => generation.variant === input.targetCandidate,
  );
  if (targetGenerations.length === 0) throw new Error("target candidate has no generations");
  const validTargetGenerations = targetGenerations.filter(
    generation => generation.valid && generation.metrics && generation.output,
  );
  if (validTargetGenerations.length === 0) throw new Error("target candidate has no valid generations");
  const decision = decidePromotion({
    validJsonRate: validTargetGenerations.length / targetGenerations.length,
    average25: target.average25,
    passageFidelity: target.dimensions.passageFidelity,
    semanticPrecision: target.dimensions.semanticPrecision,
    hardFailReviews: target.hardFailReviews,
    gapToGeneratorConsensus,
    knownGoldenRegression: input.knownGoldenRegression,
  });

  const roundCases = [...new Set(reviews.map(review => `${review.round}:${review.caseId}`))];
  const pairwise = input.referenceCandidates.map(generator => {
    let targetWins = 0;
    let generatorWins = 0;
    let ties = 0;
    for (const roundCase of roundCases) {
      const score = (candidate: string): number =>
        reviews
          .filter(
            review => `${review.round}:${review.caseId}` === roundCase && review.candidate === candidate,
          )
          .reduce((sum, review) => sum + review.total, 0);
      const targetScore = score(input.targetCandidate);
      const generatorScore = score(generator);
      if (targetScore > generatorScore) targetWins += 1;
      else if (generatorScore > targetScore) generatorWins += 1;
      else ties += 1;
    }
    return {
      generator,
      targetWins,
      generatorWins,
      ties,
      exactTwoSidedP: exactTwoSidedP(targetWins, generatorWins),
    };
  });

  const metricValues = validTargetGenerations.map(generation => ({
    metrics: generation.metrics!,
    visibleCharacters:
      generation.output!.sixToMe.length + generation.output!.meToSix.length,
  }));
  const numeric = (selector: (row: (typeof metricValues)[number]) => number | null): number[] =>
    metricValues.map(selector).filter((value): value is number => value !== null);
  const result: EvaluationResult = {
    schemaVersion: 1,
    evalId: input.evalId,
    partition: input.partition,
    promptHash: input.promptHash,
    targetCandidate: input.targetCandidate,
    protocol: {
      generatedOutputs: input.generations.length,
      candidateReviews: reviews.length,
      dimensionScores: reviews.length * SCORE_DIMENSIONS.length,
      judges: [...new Set(input.judgeBatches.map(batch => batch.judge))],
      rounds: [...new Set(input.judgeBatches.map(batch => batch.round))].sort(
        (left, right) => left - right,
      ),
    },
    ranking,
    generatorConsensusAverage25,
    gapToGeneratorConsensus,
    pairwise,
    gates: decision.gates,
    promotionPassed: decision.promotionPassed,
    metrics: {
      samples: validTargetGenerations.length,
      firstContentMs: distribution(numeric(row => row.metrics.firstContentMs)),
      totalMs: distribution(numeric(row => row.metrics.totalMs)),
      promptTokens: distribution(numeric(row => row.metrics.promptTokens)),
      completionTokens: distribution(numeric(row => row.metrics.completionTokens)),
      totalTokens: distribution(numeric(row => row.metrics.totalTokens)),
      visibleCharacters: distribution(numeric(row => row.visibleCharacters)),
    },
  };
  AggregateResultSchema.parse(result);
  return result;
}

export function renderEvaluationReport(result: EvaluationResult): string {
  const target = result.ranking.find(row => row.candidate === result.targetCandidate);
  if (!target) throw new Error("evaluation result has no target summary");
  const gateLines = Object.entries(result.gates).map(
    ([name, gate]) => `- ${name}: ${gate.actual} — ${gate.pass ? "pass" : "fail"}`,
  );
  return [
    `# ${result.evalId}`,
    "",
    `Promotion: **${result.promotionPassed ? "pass" : "blocked"}**`,
    "",
    `- Target: ${result.targetCandidate}`,
    `- Average: ${target.average25}/25`,
    `- Generator consensus: ${result.generatorConsensusAverage25}/25`,
    `- Gap: ${result.gapToGeneratorConsensus}`,
    "",
    "## Gates",
    "",
    ...gateLines,
    "",
  ].join("\n");
}
