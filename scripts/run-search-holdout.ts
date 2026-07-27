import path from "node:path";
import type { HoldoutExpectation } from "./search-holdout/contract";
import { createSearchHoldoutDecision, type HoldoutEvaluationOutput } from "./search-holdout/evaluator";
import {
  FROZEN_SEARCH_COMMIT,
  PROTOCOL_CONTENT_COMMIT,
  assertCleanEvaluationTree,
  assertFrozenProtocolRules,
  assertFrozenSearchPaths,
  assertHoldoutCommitChain,
  readArtifactIdentity,
  readCurrentCommit,
  writeHoldoutEvidence,
} from "./search-holdout/runtime";
import { validateSearchHoldoutFixtureFile } from "./validate-search-holdout";

const TOP_K = 5;
const THRESHOLD = 0.25;

interface CliOptions {
  casesPath: string;
  jsonPath: string;
  markdownPath: string;
  fixtureCommit: string;
  harnessCommit: string;
}

function optionValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function resolveOptions(): CliOptions {
  const cases = optionValue("cases");
  const json = optionValue("json");
  const markdown = optionValue("markdown");
  const fixtureCommit = optionValue("fixture-commit");
  const harnessCommit = optionValue("harness-commit");

  if (!cases || !json || !markdown || !fixtureCommit || !harnessCommit) {
    throw new Error(
      "Usage: tsx scripts/run-search-holdout.ts --cases <fixture.json> --json <results.json> --markdown <report.md> --fixture-commit <sha> --harness-commit <sha>",
    );
  }

  return {
    casesPath: path.resolve(process.cwd(), cases),
    jsonPath: path.resolve(process.cwd(), json),
    markdownPath: path.resolve(process.cwd(), markdown),
    fixtureCommit,
    harnessCommit,
  };
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
  const options = resolveOptions();
  const root = process.cwd();
  const fixtureRelativePath = path.relative(root, options.casesPath);
  if (!fixtureRelativePath || fixtureRelativePath.startsWith("..") || path.isAbsolute(fixtureRelativePath)) {
    throw new Error("Holdout fixture must be inside the repository.");
  }

  assertCleanEvaluationTree(root);
  const fixture = await validateSearchHoldoutFixtureFile(options.casesPath);
  assertFrozenSearchPaths(root);
  const protocolRulesSha256 = assertFrozenProtocolRules(root);
  const provenance = assertHoldoutCommitChain(root, {
    fixtureCommit: options.fixtureCommit,
    fixtureRelativePath,
  });
  const evaluatedCommit = readCurrentCommit(root);
  const artifacts = readArtifactIdentity(root);

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
      generatedAt: new Date().toISOString(),
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

  writeHoldoutEvidence(
    { jsonPath: options.jsonPath, markdownPath: options.markdownPath },
    decision,
  );
  console.log(
    JSON.stringify(
      {
        decision: decision.decision,
        categories: decision.categories,
        jsonPath: options.jsonPath,
        markdownPath: options.markdownPath,
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
