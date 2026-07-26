import {
  assertFrozenProtocolRulesUnchanged,
  createSearchHoldoutDecision,
  renderSearchHoldoutReport,
  type HoldoutEvaluationMetadata,
  type HoldoutEvaluationOutput,
} from "../../../scripts/search-holdout/evaluator";

const metadata: HoldoutEvaluationMetadata = {
  generatedAt: "2026-07-27T00:00:00.000Z",
  frozenSearchCommit: "81c6365766a7cf8c578cef6b060c5e43345f0d35",
  protocolContentCommit: "71fa97e7da563abc1d3365292132d36a75e6682b",
  protocolRulesSha256: "a".repeat(64),
  evaluationHarnessCommit: "b".repeat(40),
  evaluatedCommit: "c".repeat(40),
  fixtureCommit: "d".repeat(40),
  fixtureBlob: "e".repeat(40),
  fixtureSha256: "f".repeat(64),
  artifacts: {
    graphArtifactSignature: "sha256:graph-signature",
    graphFileSha256: "1".repeat(64),
    embeddingsFileSha256: "2".repeat(64),
  },
  parameters: {
    topK: 5,
    threshold: 0.25,
  },
};

function buildOutputs(inDomainPassed: number, oodPassed: number): HoldoutEvaluationOutput[] {
  return [
    ...Array.from({ length: 24 }, (_, index) => ({
      index: index + 1,
      category: "in-domain" as const,
      query: `领域问题 ${index + 1}`,
      expectation: { type: "anyTop3Id" as const, ids: [`passage-${index + 1}`] },
      passed: index < inDomainPassed,
      resultCount: 3,
      top3Ids: [`passage-${index + 1}`],
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      index: index + 25,
      category: "ood" as const,
      query: `外部问题 ${index + 1}`,
      expectation: { type: "empty" as const },
      passed: index < oodPassed,
      resultCount: index < oodPassed ? 0 : 1,
      top3Ids: [],
    })),
  ];
}

describe("search holdout evaluator", () => {
  it("passes only at the 19/24 in-domain and 6/6 OOD boundary", () => {
    const decision = createSearchHoldoutDecision(metadata, buildOutputs(19, 6));

    expect(decision.decision).toBe("pass");
    expect(decision.categories).toEqual({
      inDomain: { passed: 19, total: 24, required: 19 },
      ood: { passed: 6, total: 6, required: 6 },
    });
  });

  it("blocks 18/24 in-domain even when every OOD case is empty", () => {
    const decision = createSearchHoldoutDecision(metadata, buildOutputs(18, 6));

    expect(decision.decision).toBe("blocked");
  });

  it("blocks 5/6 OOD even when every in-domain case passes", () => {
    const decision = createSearchHoldoutDecision(metadata, buildOutputs(24, 5));

    expect(decision.decision).toBe("blocked");
  });

  it("projects the same auditable decision into Markdown", () => {
    const decision = createSearchHoldoutDecision(metadata, buildOutputs(19, 6));
    const report = renderSearchHoldoutReport(decision);

    expect(report).toContain("Decision: **pass**");
    expect(report).toContain(metadata.fixtureSha256);
    expect(report).toContain(metadata.evaluatedCommit);
    expect(report).toContain("In-domain: 19/24");
    expect(report).toContain("OOD: 6/6");
  });

  it("rejects a protocol rule change before evaluation", () => {
    const frozen = "## Frozen holdout protocol\n- 24 cases\n";

    expect(assertFrozenProtocolRulesUnchanged(frozen, frozen)).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      assertFrozenProtocolRulesUnchanged(frozen, "## Frozen holdout protocol\n- 25 cases\n"),
    ).toThrow("Frozen holdout protocol rules differ");
  });
});
