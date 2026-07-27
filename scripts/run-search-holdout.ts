import path from "node:path";
import type { HoldoutExpectation } from "./search-holdout/contract";
import { createSearchHoldoutDecision, type HoldoutEvaluationOutput } from "./search-holdout/evaluator";
import {
  FROZEN_SEARCH_COMMIT,
  HOLDOUT_FIXTURE_PATH,
  HOLDOUT_REPORT_PATH,
  HOLDOUT_RESULTS_PATH,
  PROTOCOL_CONTENT_COMMIT,
  assertCanonicalHoldoutPaths,
  assertCleanEvaluationTree,
  assertDefaultSearchArtifactEnvironment,
  assertFrozenCorpusPaths,
  assertFrozenProtocolRules,
  assertFrozenSearchPaths,
  assertHoldoutCommitChain,
  readArtifactIdentity,
  readCurrentCommit,
  reserveHoldoutEvidence,
  writeHoldoutEvidence,
} from "./search-holdout/runtime";
import { validateSearchHoldoutFixtureFile } from "./validate-search-holdout";

const TOP_K = 5;
const THRESHOLD = 0.25;

function optionValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requireFixtureCommit(): string {
  const fixtureCommit = optionValue("fixture-commit");

  if (!fixtureCommit) {
    throw new Error("Usage: tsx scripts/run-search-holdout.ts --fixture-commit <sha>");
  }

  return fixtureCommit;
}

function evaluateExpectation(
  expectation: HoldoutExpectation,
  top3Ids: string[],
  top3Sources: string[],
  resultCount: number,
): boolean {
  if (expectation.type === "empty") {
    return resultCount === 0;
  }

  return expectation.type === "anyTop3Id"
    ? top3Ids.some((id) => expectation.ids.includes(id))
    : top3Sources.some((source) => expectation.sources.includes(source));
}

async function main(): Promise<void> {
  const root = process.cwd();
  const fixtureCommit = requireFixtureCommit();
  const paths = {
    casesPath: path.join(root, HOLDOUT_FIXTURE_PATH),
    jsonPath: path.join(root, HOLDOUT_RESULTS_PATH),
    markdownPath: path.join(root, HOLDOUT_REPORT_PATH),
  };

  assertCleanEvaluationTree(root);
  assertCanonicalHoldoutPaths(root, paths);
  assertDefaultSearchArtifactEnvironment();
  const fixture = await validateSearchHoldoutFixtureFile(paths.casesPath);
  assertFrozenSearchPaths(root);
  assertFrozenCorpusPaths(root);
  const protocolRulesSha256 = assertFrozenProtocolRules(root);
  const provenance = assertHoldoutCommitChain(root, {
    fixtureCommit,
    fixtureRelativePath: HOLDOUT_FIXTURE_PATH,
  });
  const evaluatedCommit = readCurrentCommit(root);
  const artifacts = readArtifactIdentity(root);
  const startedAt = new Date().toISOString();
  const reservation = reserveHoldoutEvidence({
    jsonPath: paths.jsonPath,
    markdownPath: paths.markdownPath,
    startedRecord: {
      status: "started",
      startedAt,
      fixtureCommit: provenance.fixtureCommit,
      evaluatedCommit,
    },
  });

  const { loadSearchIndex } = await import("../src/lib/search/index-store");
  const { diagnoseSearchPassages } = await import("../src/lib/search/diagnostics");
  const index = await loadSearchIndex();
  const passagesById = new Map(index.corpus.map((passage) => [passage.id, passage]));
  const outputs: HoldoutEvaluationOutput[] = [];

  for (const [caseIndex, testCase] of fixture.cases.entries()) {
    const diagnostics = await diagnoseSearchPassages({
      query: testCase.query,
      topK: TOP_K,
      threshold: THRESHOLD,
    });
    const top3 = diagnostics.results.slice(0, 3).map((result) => ({
      id: result.id,
      source: passagesById.get(result.id)?.source ?? "",
    }));
    const top3Ids = top3.map((result) => result.id);
    const top3Sources = top3.map((result) => result.source);

    outputs.push({
      index: caseIndex + 1,
      category: testCase.category,
      query: testCase.query,
      expectation: testCase.expectation,
      passed: evaluateExpectation(
        testCase.expectation,
        top3Ids,
        top3Sources,
        diagnostics.lanes.full.resultCount,
      ),
      resultCount: diagnostics.lanes.full.resultCount,
      top3Ids,
    });
  }

  const decision = createSearchHoldoutDecision(
    {
      generatedAt: startedAt,
      frozenSearchCommit: FROZEN_SEARCH_COMMIT,
      protocolContentCommit: PROTOCOL_CONTENT_COMMIT,
      protocolRulesSha256,
      evaluationHarnessCommit: provenance.harnessCommit,
      evaluatedCommit,
      fixtureCommit: provenance.fixtureCommit,
      fixtureBlob: provenance.fixtureBlob,
      fixtureSha256: fixture.fixtureSha256,
      fixtureAuthorName: provenance.fixtureAuthorName,
      fixtureAuthoredAt: provenance.fixtureAuthoredAt,
      independenceAttestation: provenance.independenceAttestation,
      artifacts,
      parameters: { topK: TOP_K, threshold: THRESHOLD },
    },
    outputs,
  );

  writeHoldoutEvidence(reservation, decision);
  console.log(
    JSON.stringify(
      {
        decision: decision.decision,
        categories: decision.categories,
        jsonPath: paths.jsonPath,
        markdownPath: paths.markdownPath,
      },
      null,
      2,
    ),
  );

  if (decision.decision === "blocked") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
