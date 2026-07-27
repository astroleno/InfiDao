import { createHash } from "node:crypto";
import type { HoldoutCategory, HoldoutExpectation } from "./contract";

export interface HoldoutEvaluationMetadata {
  generatedAt: string;
  frozenSearchCommit: string;
  protocolContentCommit: string;
  protocolRulesSha256: string;
  evaluationHarnessCommit: string;
  evaluatedCommit: string;
  fixtureCommit: string;
  fixtureBlob: string;
  fixtureSha256: string;
  fixtureAuthorName: string;
  fixtureAuthoredAt: string;
  independenceAttestation: string;
  artifacts: {
    graphArtifactSignature: string;
    graphFileSha256: string;
    embeddingsFileSha256: string;
    corpusManifestSha256: string;
    sixClassicsSha256: string;
    gujiCoreSha256: string;
  };
  parameters: {
    topK: number;
    threshold: number;
  };
}

export interface HoldoutEvaluationOutput {
  index: number;
  category: HoldoutCategory;
  query: string;
  expectation: HoldoutExpectation;
  passed: boolean;
  resultCount: number;
  top3Ids: string[];
}

export interface SearchHoldoutDecision {
  decision: "pass" | "blocked";
  metadata: HoldoutEvaluationMetadata;
  categories: {
    inDomain: {
      passed: number;
      total: number;
      required: number;
    };
    ood: {
      passed: number;
      total: number;
      required: number;
    };
  };
  outputs: HoldoutEvaluationOutput[];
}

const IN_DOMAIN_TOTAL = 24;
const IN_DOMAIN_REQUIRED = 19;
const OOD_TOTAL = 6;
const OOD_REQUIRED = 6;

export function assertFrozenProtocolRulesUnchanged(
  frozenRules: string,
  currentRules: string,
): string {
  const frozenRulesSha256 = createHash("sha256").update(frozenRules).digest("hex");
  const currentRulesSha256 = createHash("sha256").update(currentRules).digest("hex");

  if (frozenRulesSha256 !== currentRulesSha256) {
    throw new Error("Frozen holdout protocol rules differ from the sealed protocol content.");
  }

  return frozenRulesSha256;
}

function categoryResult(outputs: HoldoutEvaluationOutput[], category: HoldoutCategory) {
  const categoryOutputs = outputs.filter((output) => output.category === category);
  return {
    passed: categoryOutputs.filter((output) => output.passed).length,
    total: categoryOutputs.length,
  };
}

export function createSearchHoldoutDecision(
  metadata: HoldoutEvaluationMetadata,
  outputs: HoldoutEvaluationOutput[],
): SearchHoldoutDecision {
  const inDomain = categoryResult(outputs, "in-domain");
  const ood = categoryResult(outputs, "ood");

  if (inDomain.total !== IN_DOMAIN_TOTAL || ood.total !== OOD_TOTAL) {
    throw new Error(
      `Holdout decision requires ${IN_DOMAIN_TOTAL} in-domain and ${OOD_TOTAL} OOD outputs; received ${inDomain.total}/${ood.total}.`,
    );
  }

  const decision =
    inDomain.passed >= IN_DOMAIN_REQUIRED && ood.passed === OOD_REQUIRED
      ? "pass"
      : "blocked";

  return {
    decision,
    metadata,
    categories: {
      inDomain: { ...inDomain, required: IN_DOMAIN_REQUIRED },
      ood: { ...ood, required: OOD_REQUIRED },
    },
    outputs,
  };
}

function formatExpectation(expectation: HoldoutExpectation): string {
  if (expectation.type === "empty") {
    return "empty";
  }

  return expectation.type === "anyTop3Id"
    ? `anyTop3Id: ${expectation.ids.join(", ")}`
    : `sourceTop3: ${expectation.sources.join(", ")}`;
}

export function renderSearchHoldoutReport(decision: SearchHoldoutDecision): string {
  const failures = decision.outputs.filter((output) => !output.passed);

  return [
    "# Search Frozen Holdout v1",
    "",
    `Decision: **${decision.decision}**`,
    "",
    "## Category Thresholds",
    "",
    `- In-domain: ${decision.categories.inDomain.passed}/${decision.categories.inDomain.total} (requires ${decision.categories.inDomain.required})`,
    `- OOD: ${decision.categories.ood.passed}/${decision.categories.ood.total} (requires ${decision.categories.ood.required})`,
    "",
    "## Audit Identity",
    "",
    `- Generated at: ${decision.metadata.generatedAt}`,
    `- Frozen search commit: ${decision.metadata.frozenSearchCommit}`,
    `- Protocol content commit: ${decision.metadata.protocolContentCommit}`,
    `- Protocol rules SHA-256: ${decision.metadata.protocolRulesSha256}`,
    `- Evaluation harness commit: ${decision.metadata.evaluationHarnessCommit}`,
    `- Evaluated commit: ${decision.metadata.evaluatedCommit}`,
    `- Fixture commit: ${decision.metadata.fixtureCommit}`,
    `- Fixture blob: ${decision.metadata.fixtureBlob}`,
    `- Fixture SHA-256: ${decision.metadata.fixtureSha256}`,
    `- Fixture author: ${decision.metadata.fixtureAuthorName}`,
    `- Fixture authored at: ${decision.metadata.fixtureAuthoredAt}`,
    `- Independence attestation: ${decision.metadata.independenceAttestation}`,
    `- Graph artifact signature: ${decision.metadata.artifacts.graphArtifactSignature}`,
    `- Graph file SHA-256: ${decision.metadata.artifacts.graphFileSha256}`,
    `- Embeddings file SHA-256: ${decision.metadata.artifacts.embeddingsFileSha256}`,
    `- Corpus manifest SHA-256: ${decision.metadata.artifacts.corpusManifestSha256}`,
    `- Six Classics corpus SHA-256: ${decision.metadata.artifacts.sixClassicsSha256}`,
    `- Guji core corpus SHA-256: ${decision.metadata.artifacts.gujiCoreSha256}`,
    `- Parameters: topK=${decision.metadata.parameters.topK}, threshold=${decision.metadata.parameters.threshold}`,
    "",
    "## Failures",
    "",
    failures.length === 0
      ? "- None"
      : failures
          .map(
            (output) =>
              `- #${output.index} (${output.category}) ${output.query}: expected ${formatExpectation(output.expectation)}, got ${output.resultCount} result(s) with ${output.top3Ids.join(", ") || "no Top 3 IDs"}`,
          )
          .join("\n"),
    "",
  ].join("\n");
}
