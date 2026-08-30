import crypto from "node:crypto";
import { z } from "zod";

export const SCORE_DIMENSIONS = [
  "passageFidelity",
  "queryRelevance",
  "dualDirection",
  "interpretiveDepth",
  "semanticPrecision",
] as const;

export const EVAL_CATEGORIES = [
  "uncertainty",
  "resource-priority",
  "institution-execution",
  "agency-environment",
  "relationship-consent",
  "change-experiment",
] as const;

const NonEmptyString = z.string().trim().min(1);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const MillisecondsSchema = z.number().finite().nonnegative().nullable();
const TokenCountSchema = z.number().int().nonnegative().nullable();

export const EvaluationConstraintsSchema = z
  .object({
    mustPreserve: z.array(NonEmptyString).min(1),
    sixToMe: z.array(NonEmptyString).min(1),
    meToSix: z.array(NonEmptyString).min(1),
    forbiddenClaims: z.array(NonEmptyString),
    acceptableVariants: z.array(NonEmptyString),
  })
  .strict();

export const AnnotationOutputSchema = z
  .object({
    sixToMe: NonEmptyString,
    meToSix: NonEmptyString,
  })
  .strict();

export const EvalCaseSchema = z
  .object({
    id: NonEmptyString,
    sourceId: NonEmptyString,
    category: NonEmptyString,
    scenario: NonEmptyString,
    query: NonEmptyString,
    source: NonEmptyString,
    passage: NonEmptyString,
    style: NonEmptyString,
    evaluationConstraints: EvaluationConstraintsSchema,
    referenceAnswer: AnnotationOutputSchema.optional(),
  })
  .strict();

export const EvalFixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    evalId: NonEmptyString,
    partition: z.enum(["dev", "holdout", "golden"]),
    sealed: z.boolean(),
    fixtureSha256: Sha256Schema.optional(),
    cases: z.array(EvalCaseSchema).min(1),
  })
  .strict();

export const PromptVariantSchema = z
  .object({
    id: NonEmptyString,
    parentId: NonEmptyString.nullable(),
    description: NonEmptyString,
    hypothesis: NonEmptyString,
    expectedImprovements: z.array(NonEmptyString),
    regressionRisks: z.array(NonEmptyString),
    system: NonEmptyString,
    instructions: z.array(NonEmptyString).min(1),
    sha256: Sha256Schema,
    frozen: z.boolean(),
  })
  .strict();

export const GenerationMetricsSchema = z
  .object({
    headersMs: MillisecondsSchema,
    firstEventMs: MillisecondsSchema,
    firstReasoningMs: MillisecondsSchema,
    firstContentMs: MillisecondsSchema,
    totalMs: z.number().finite().nonnegative(),
    finishReason: z.string().nullable(),
    reasoningCharacters: z.number().int().nonnegative(),
    promptTokens: TokenCountSchema,
    completionTokens: TokenCountSchema,
    reasoningTokens: TokenCountSchema,
    totalTokens: TokenCountSchema,
    cachedPromptTokens: TokenCountSchema,
    cost: z.number().finite().nonnegative().nullable(),
  })
  .strict();

export const GenerationSchema = z
  .object({
    partition: z.enum(["dev", "holdout", "golden"]),
    round: z.number().int().positive(),
    caseId: NonEmptyString,
    variant: NonEmptyString,
    promptHash: Sha256Schema,
    model: NonEmptyString,
    thinking: z.literal("disabled"),
    temperature: z.number().finite(),
    maxTokens: z.number().int().positive(),
    attempt: z.number().int().min(1).max(3),
    valid: z.boolean(),
    output: AnnotationOutputSchema.optional(),
    metrics: GenerationMetricsSchema.optional(),
    error: z.string().optional(),
  })
  .strict()
  .superRefine((generation, context) => {
    if (generation.valid && (!generation.output || !generation.metrics)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "valid generation requires output and metrics",
      });
    }
    if (!generation.valid && !generation.error) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "invalid generation requires error",
      });
    }
  });

export const CandidateScoreSchema = z
  .object({
    passageFidelity: z.number().int().min(1).max(5),
    queryRelevance: z.number().int().min(1).max(5),
    dualDirection: z.number().int().min(1).max(5),
    interpretiveDepth: z.number().int().min(1).max(5),
    semanticPrecision: z.number().int().min(1).max(5),
    hardFails: z.array(NonEmptyString),
    failureTags: z.array(NonEmptyString).default([]),
  })
  .strict();

export const JudgmentSchema = z
  .object({
    caseId: NonEmptyString,
    scores: z.record(z.string().regex(/^[A-Z]$/u), CandidateScoreSchema),
    ranking: z.array(z.string().regex(/^[A-Z]$/u)).min(1),
    caseAmbiguity: z
      .object({
        ambiguous: z.boolean(),
        reason: NonEmptyString,
      })
      .strict(),
    note: z.string(),
  })
  .strict()
  .superRefine((judgment, context) => {
    const labels = Object.keys(judgment.scores).sort();
    const ranking = [...judgment.ranking].sort();
    if (new Set(judgment.ranking).size !== judgment.ranking.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "ranking contains duplicates" });
    }
    if (labels.join("") !== ranking.join("")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ranking labels must match score labels",
      });
    }
  });

export const BlindCandidateSchema = AnnotationOutputSchema;
export const BlindCaseSchema = z
  .object({
    caseId: NonEmptyString,
    scenario: NonEmptyString,
    query: NonEmptyString,
    source: NonEmptyString,
    passage: NonEmptyString,
    style: NonEmptyString,
    evaluationConstraints: EvaluationConstraintsSchema,
    candidates: z.record(z.string().regex(/^[A-Z]$/u), BlindCandidateSchema),
  })
  .strict();
export const BlindPacketSchema = z.array(BlindCaseSchema).min(1);

export const GateSchema = z
  .object({
    actual: z.number().finite().nullable(),
    pass: z.boolean(),
    targetMinimum: z.number().finite().optional(),
    targetMaximum: z.number().finite().optional(),
    target: z.number().finite().optional(),
  })
  .strict();

export const AggregateResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    evalId: NonEmptyString,
    partition: z.enum(["dev", "holdout", "golden"]),
    promptHash: Sha256Schema,
    promotionPassed: z.boolean(),
    gates: z.record(NonEmptyString, GateSchema),
  })
  .passthrough();

export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalFixture = z.infer<typeof EvalFixtureSchema>;
export type PromptVariant = z.infer<typeof PromptVariantSchema>;
export type AnnotationOutput = z.infer<typeof AnnotationOutputSchema>;
export type Generation = z.infer<typeof GenerationSchema>;
export type GenerationMetrics = z.infer<typeof GenerationMetricsSchema>;
export type CandidateScore = z.infer<typeof CandidateScoreSchema>;
export type Judgment = z.infer<typeof JudgmentSchema>;
export type BlindCase = z.infer<typeof BlindCaseSchema>;
export type AggregateResult = z.infer<typeof AggregateResultSchema>;

export function normalizeEvalText(value: string): string {
  return value.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");
}

export function normalizedPassageClauses(value: string): string[] {
  return value
    .split(/[，。；！？、：]/u)
    .map(normalizeEvalText)
    .filter(clause => clause.length >= 2);
}

export function parseEvalFixture(value: unknown): EvalFixture {
  const fixture = EvalFixtureSchema.parse(value);
  const ids = new Set<string>();
  const queries = new Set<string>();
  for (const testCase of fixture.cases) {
    if (ids.has(testCase.id)) throw new Error(`duplicate case id: ${testCase.id}`);
    ids.add(testCase.id);
    const query = normalizeEvalText(testCase.query);
    if (queries.has(query)) throw new Error(`duplicate normalized query: ${query}`);
    queries.add(query);
  }
  return fixture;
}

export function fixtureHash(fixture: EvalFixture): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: fixture.schemaVersion,
        evalId: fixture.evalId,
        partition: fixture.partition,
        sealed: fixture.sealed,
        cases: fixture.cases,
      }),
    )
    .digest("hex");
}

export function assertFixtureHash(fixture: EvalFixture): void {
  if (!fixture.fixtureSha256) throw new Error(`fixture hash missing: ${fixture.evalId}`);
  const actual = fixtureHash(fixture);
  if (actual !== fixture.fixtureSha256) {
    throw new Error(`fixture hash mismatch: ${fixture.evalId}`);
  }
}

export function parseGeneration(value: unknown): Generation {
  return GenerationSchema.parse(value);
}

export function parseJudgment(value: unknown): Judgment {
  return JudgmentSchema.parse(value);
}

export function assertDisjointPartitions(partitions: EvalFixture[]): void {
  const queryOwners = new Map<string, string>();
  const clauseOwners = new Map<string, string>();
  for (const fixture of partitions) {
    for (const testCase of fixture.cases) {
      const query = normalizeEvalText(testCase.query);
      const queryOwner = queryOwners.get(query);
      if (queryOwner && queryOwner !== fixture.partition) {
        throw new Error(
          `partition overlap: normalized query ${query} (${queryOwner}/${fixture.partition})`,
        );
      }
      queryOwners.set(query, fixture.partition);
      for (const clause of normalizedPassageClauses(testCase.passage)) {
        const clauseOwner = clauseOwners.get(clause);
        if (clauseOwner && clauseOwner !== fixture.partition) {
          throw new Error(
            `partition overlap: passage clause ${clause} (${clauseOwner}/${fixture.partition})`,
          );
        }
        clauseOwners.set(clause, fixture.partition);
      }
    }
  }
}
