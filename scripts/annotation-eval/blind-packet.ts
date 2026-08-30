import crypto from "node:crypto";
import {
  BlindPacketSchema,
  type AnnotationOutput,
  type BlindCase,
  type EvalFixture,
} from "./contract";

export interface BuildBlindPacketInput {
  fixture: EvalFixture;
  round: number;
  candidateOutputs: Record<string, Record<string, AnnotationOutput>>;
}

export interface BlindMapping {
  round: number;
  caseId: string;
  label: string;
  candidate: string;
}

export interface BlindPacketResult {
  packet: BlindCase[];
  mapping: BlindMapping[];
}

const IDENTITY_MARKERS = [
  "deepseek_v4",
  "codex_",
  "kimi_",
  "promptHash",
  "referenceAnswer",
  "expectations",
] as const;

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function assertBlindPacketHasNoIdentityLeaks(packet: BlindCase[]): void {
  const serialized = JSON.stringify(packet);
  for (const marker of IDENTITY_MARKERS) {
    if (serialized.includes(marker)) throw new Error(`blind packet identity leak: ${marker}`);
  }
}

export function buildBlindPacket(input: BuildBlindPacketInput): BlindPacketResult {
  if (!Number.isInteger(input.round) || input.round < 1) throw new Error("round must be positive");
  const candidates = Object.keys(input.candidateOutputs).sort();
  if (candidates.length < 2 || candidates.length > 26) {
    throw new Error("blind packet requires between 2 and 26 candidates");
  }
  const mapping: BlindMapping[] = [];
  const packet = input.fixture.cases.map(testCase => {
    const ordered = [...candidates].sort((left, right) =>
      hash(`${input.fixture.evalId}:${input.round}:${testCase.id}:${left}`).localeCompare(
        hash(`${input.fixture.evalId}:${input.round}:${testCase.id}:${right}`),
      ),
    );
    const anonymous: Record<string, AnnotationOutput> = {};
    for (const [index, candidate] of ordered.entries()) {
      const output = input.candidateOutputs[candidate]?.[testCase.id];
      if (!output) throw new Error(`missing candidate output: ${candidate}/${testCase.id}`);
      const label = String.fromCharCode(65 + index);
      anonymous[label] = { ...output };
      mapping.push({ round: input.round, caseId: testCase.id, label, candidate });
    }
    return {
      caseId: testCase.id,
      scenario: testCase.scenario,
      query: testCase.query,
      source: testCase.source,
      passage: testCase.passage,
      style: testCase.style,
      evaluationConstraints: testCase.evaluationConstraints,
      candidates: anonymous,
    };
  });
  const parsed = BlindPacketSchema.parse(packet);
  if (mapping.length !== input.fixture.cases.length * candidates.length) {
    throw new Error("blind mapping size mismatch");
  }
  assertBlindPacketHasNoIdentityLeaks(parsed);
  return { packet: parsed, mapping };
}
