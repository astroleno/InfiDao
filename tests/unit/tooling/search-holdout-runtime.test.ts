import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertFrozenProtocolRules,
  extractFrozenProtocolRules,
  writeHoldoutEvidence,
} from "../../../scripts/search-holdout/runtime";
import { createSearchHoldoutDecision, type HoldoutEvaluationOutput } from "../../../scripts/search-holdout/evaluator";

function buildOutputs(): HoldoutEvaluationOutput[] {
  return [
    ...Array.from({ length: 24 }, (_, index) => ({
      index: index + 1,
      category: "in-domain" as const,
      query: `领域问题 ${index + 1}`,
      expectation: { type: "anyTop3Id" as const, ids: [`passage-${index + 1}`] },
      passed: index < 18,
      resultCount: 3,
      top3Ids: [`passage-${index + 1}`],
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      index: index + 25,
      category: "ood" as const,
      query: `外部问题 ${index + 1}`,
      expectation: { type: "empty" as const },
      passed: true,
      resultCount: 0,
      top3Ids: [],
    })),
  ];
}

describe("search holdout runtime", () => {
  it("writes a blocked decision before a caller exposes the failing gate", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "infidao-holdout-runtime-"));
    const jsonPath = path.join(directory, "results.json");
    const markdownPath = path.join(directory, "report.md");
    const decision = createSearchHoldoutDecision(
      {
        generatedAt: "2026-07-27T00:00:00.000Z",
        frozenSearchCommit: "frozen-search",
        protocolContentCommit: "protocol",
        protocolRulesSha256: "a".repeat(64),
        evaluationHarnessCommit: "harness",
        evaluatedCommit: "candidate",
        fixtureCommit: "fixture",
        fixtureBlob: "blob",
        fixtureSha256: "b".repeat(64),
        artifacts: {
          graphArtifactSignature: "sha256:graph",
          graphFileSha256: "c".repeat(64),
          embeddingsFileSha256: "d".repeat(64),
        },
        parameters: { topK: 5, threshold: 0.25 },
      },
      buildOutputs(),
    );

    try {
      writeHoldoutEvidence({ jsonPath, markdownPath }, decision);

      expect(JSON.parse(fs.readFileSync(jsonPath, "utf8"))).toMatchObject({ decision: "blocked" });
      expect(fs.readFileSync(markdownPath, "utf8")).toContain("Decision: **blocked**");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("extracts the ledger-excluded frozen protocol section exactly", () => {
    const document = [
      "# Search Quality Methodology",
      "",
      "## Frozen holdout protocol",
      "",
      "- frozen rule",
      "",
      "## Holdout ledger",
      "",
      "| Field | Value |",
    ].join("\n");

    expect(extractFrozenProtocolRules(document)).toBe("## Frozen holdout protocol\n\n- frozen rule\n\n");
  });

  it("keeps the repository protocol rules byte-identical to the sealed commit", () => {
    expect(() => assertFrozenProtocolRules(process.cwd())).not.toThrow();
  });
});
