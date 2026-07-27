import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  assertFrozenProtocolRulesUnchanged,
  renderSearchHoldoutReport,
  type SearchHoldoutDecision,
} from "./evaluator";

export const FROZEN_SEARCH_COMMIT = "81c6365766a7cf8c578cef6b060c5e43345f0d35";
export const PROTOCOL_CONTENT_COMMIT = "71fa97e7da563abc1d3365292132d36a75e6682b";
export const PROTOCOL_PATH = "docs/qa/search-quality-methodology.md";
export const HOLDOUT_FIXTURE_PATH = "tests/fixtures/search-holdout-v1.json";
export const HOLDOUT_RESULTS_PATH = "docs/qa/search-holdout-v1-results.json";
export const HOLDOUT_REPORT_PATH = "docs/qa/search-holdout-v1-report.md";
export const REQUIRED_INDEPENDENCE_ATTESTATION =
  "no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection";
export const FROZEN_SEARCH_PATHS = [
  "src/lib/search",
  "data/embeddings.json",
  "data/search-graph.json",
];
export const FROZEN_CORPUS_PATHS = [
  "data/corpus-manifest.json",
  "data/sixclassics-sample.jsonl",
  "data/rysxguji/guji-core-v1.jsonl",
] as const;

export interface ArtifactIdentity {
  graphArtifactSignature: string;
  graphFileSha256: string;
  embeddingsFileSha256: string;
  corpusManifestSha256: string;
  sixClassicsSha256: string;
  gujiCoreSha256: string;
}

export interface HoldoutCommitProvenance {
  harnessCommit: string;
  fixtureCommit: string;
  fixtureBlob: string;
  fixtureAuthorName: string;
  fixtureAuthoredAt: string;
  independenceAttestation: string;
}

export interface HoldoutStartedRecord {
  status: "started";
  startedAt: string;
  fixtureCommit: string;
  evaluatedCommit: string;
}

export interface HoldoutEvidenceReservation {
  jsonFileDescriptor: number;
  markdownFileDescriptor: number;
  jsonPath: string;
  markdownPath: string;
}

export interface SearchArtifactEnvironment {
  SEARCH_EMBEDDING_ARTIFACT_PATH?: string;
  SEARCH_GRAPH_PATH?: string;
}

function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function git(root: string, arguments_: string[]): string {
  try {
    return execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();
  } catch (error) {
    throw new Error(
      `Git command failed: git ${arguments_.join(" ")}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function readCurrentCommit(root: string): string {
  return git(root, ["rev-parse", "HEAD"]);
}

export function extractFrozenProtocolRules(document: string): string {
  const heading = "## Frozen holdout protocol";
  const ledgerHeading = "\n## Holdout ledger";
  const start = document.indexOf(heading);
  const end = document.indexOf(ledgerHeading, start);

  if (start < 0 || end < 0) {
    throw new Error("Search quality methodology does not contain a frozen protocol section and holdout ledger.");
  }

  return document.slice(start, end + 1);
}

export function assertFrozenProtocolRules(root: string): string {
  const currentDocument = fs.readFileSync(path.join(root, PROTOCOL_PATH), "utf8");
  const frozenDocument = git(root, ["show", `${PROTOCOL_CONTENT_COMMIT}:${PROTOCOL_PATH}`]);

  return assertFrozenProtocolRulesUnchanged(
    extractFrozenProtocolRules(frozenDocument),
    extractFrozenProtocolRules(currentDocument),
  );
}

export function assertFrozenSearchPaths(root: string): void {
  git(root, ["diff", "--quiet", FROZEN_SEARCH_COMMIT, "--", ...FROZEN_SEARCH_PATHS]);
}

export function assertFrozenCorpusPaths(root: string): void {
  git(root, ["diff", "--quiet", FROZEN_SEARCH_COMMIT, "--", ...FROZEN_CORPUS_PATHS]);
}

export function assertDefaultSearchArtifactEnvironment(
  environment: SearchArtifactEnvironment = process.env as unknown as SearchArtifactEnvironment,
): void {
  for (const name of ["SEARCH_EMBEDDING_ARTIFACT_PATH", "SEARCH_GRAPH_PATH"] as const) {
    if (environment[name]?.trim()) {
      throw new Error(`${name} must be unset for frozen holdout evaluation.`);
    }
  }
}

export function assertCanonicalHoldoutPaths(
  root: string,
  paths: {
    casesPath: string;
    jsonPath: string;
    markdownPath: string;
  },
): void {
  const expected = {
    casesPath: path.resolve(root, HOLDOUT_FIXTURE_PATH),
    jsonPath: path.resolve(root, HOLDOUT_RESULTS_PATH),
    markdownPath: path.resolve(root, HOLDOUT_REPORT_PATH),
  };
  const actual = {
    casesPath: path.resolve(paths.casesPath),
    jsonPath: path.resolve(paths.jsonPath),
    markdownPath: path.resolve(paths.markdownPath),
  };

  if (
    actual.casesPath !== expected.casesPath ||
    actual.jsonPath !== expected.jsonPath ||
    actual.markdownPath !== expected.markdownPath ||
    new Set(Object.values(actual)).size !== 3
  ) {
    throw new Error(
      `Frozen holdout must use canonical evidence paths: ${HOLDOUT_FIXTURE_PATH}, ${HOLDOUT_RESULTS_PATH}, ${HOLDOUT_REPORT_PATH}.`,
    );
  }
}

export function assertCleanEvaluationTree(root: string): void {
  if (git(root, ["status", "--porcelain"])) {
    throw new Error("Holdout evaluation requires a clean working tree.");
  }
}

function readHarnessSealAtFixtureCommit(root: string, fixtureCommit: string): string {
  const methodology = git(root, ["show", `${fixtureCommit}:${PROTOCOL_PATH}`]);
  const match = methodology.match(/^\| Evaluation harness seal \| `([0-9a-f]{40})` \|$/mu);

  if (!match?.[1]) {
    throw new Error(
      "Fixture commit does not contain one exact evaluation harness seal in the holdout ledger.",
    );
  }

  return match[1];
}

export function assertHoldoutCommitChain(
  root: string,
  options: {
    fixtureCommit: string;
    fixtureRelativePath: string;
  },
): HoldoutCommitProvenance {
  const { fixtureCommit, fixtureRelativePath } = options;
  git(root, ["rev-parse", "--verify", `${fixtureCommit}^{commit}`]);
  git(root, ["merge-base", "--is-ancestor", fixtureCommit, "HEAD"]);

  const harnessCommit = readHarnessSealAtFixtureCommit(root, fixtureCommit);
  git(root, ["rev-parse", "--verify", `${harnessCommit}^{commit}`]);
  git(root, ["merge-base", "--is-ancestor", harnessCommit, fixtureCommit]);
  git(root, [
    "diff",
    "--quiet",
    harnessCommit,
    "HEAD",
    "--",
    "scripts/search-holdout",
    "scripts/run-search-holdout.ts",
    "scripts/validate-search-holdout.ts",
  ]);

  const changedPaths = git(root, [
    "diff-tree",
    "--root",
    "--no-commit-id",
    "--name-only",
    "-r",
    fixtureCommit,
  ])
    .split("\n")
    .filter(Boolean);

  if (
    fixtureRelativePath !== HOLDOUT_FIXTURE_PATH ||
    changedPaths.length !== 1 ||
    changedPaths[0] !== HOLDOUT_FIXTURE_PATH
  ) {
    throw new Error(`Fixture commit must change only ${HOLDOUT_FIXTURE_PATH}.`);
  }

  const fixtureBlob = git(root, ["rev-parse", `${fixtureCommit}:${HOLDOUT_FIXTURE_PATH}`]);
  const actualBlob = git(root, ["hash-object", HOLDOUT_FIXTURE_PATH]);
  if (fixtureBlob !== actualBlob) {
    throw new Error("Fixture contents do not match the declared fixture commit.");
  }

  const commitIdentity = git(root, ["show", "-s", "--format=%an%x00%aI%x00%B", fixtureCommit]);
  const [fixtureAuthorName, fixtureAuthoredAt, ...messageParts] = commitIdentity.split("\0");
  const message = messageParts.join("\0");
  const independenceAttestation = message.match(/^Holdout-Independence:\s*(.+)$/mu)?.[1]?.trim();

  if (
    !fixtureAuthorName ||
    !fixtureAuthoredAt ||
    independenceAttestation !== REQUIRED_INDEPENDENCE_ATTESTATION
  ) {
    throw new Error(
      `Fixture commit must contain Holdout-Independence: ${REQUIRED_INDEPENDENCE_ATTESTATION}.`,
    );
  }

  return {
    harnessCommit,
    fixtureCommit,
    fixtureBlob,
    fixtureAuthorName,
    fixtureAuthoredAt,
    independenceAttestation,
  };
}

export function assertFixtureCommit(
  root: string,
  fixtureCommit: string,
  fixtureRelativePath: string,
): string {
  git(root, ["rev-parse", "--verify", `${fixtureCommit}^{commit}`]);
  const changedPaths = git(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", fixtureCommit])
    .split("\n")
    .filter(Boolean);

  if (changedPaths.length !== 1 || changedPaths[0] !== fixtureRelativePath) {
    throw new Error("Fixture commit must change only the holdout fixture path.");
  }

  const expectedBlob = git(root, ["rev-parse", `${fixtureCommit}:${fixtureRelativePath}`]);
  const actualBlob = git(root, ["hash-object", fixtureRelativePath]);
  if (expectedBlob !== actualBlob) {
    throw new Error("Fixture contents do not match the declared fixture commit.");
  }

  return actualBlob;
}

export function assertEvaluationHarnessCommit(root: string, harnessCommit: string): void {
  git(root, ["rev-parse", "--verify", `${harnessCommit}^{commit}`]);
  git(root, ["merge-base", "--is-ancestor", harnessCommit, "HEAD"]);
  git(root, [
    "diff",
    "--quiet",
    harnessCommit,
    "HEAD",
    "--",
    "scripts/search-holdout",
    "scripts/run-search-holdout.ts",
    "scripts/validate-search-holdout.ts",
  ]);
}

export function readArtifactIdentity(root: string): ArtifactIdentity {
  const graphPath = path.join(root, "data/search-graph.json");
  const embeddingsPath = path.join(root, "data/embeddings.json");
  const corpusManifestPath = path.join(root, FROZEN_CORPUS_PATHS[0]);
  const sixClassicsPath = path.join(root, FROZEN_CORPUS_PATHS[1]);
  const gujiCorePath = path.join(root, FROZEN_CORPUS_PATHS[2]);
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8")) as { artifactSignature?: unknown };

  if (typeof graph.artifactSignature !== "string") {
    throw new Error("Search graph does not contain an artifact signature.");
  }

  return {
    graphArtifactSignature: graph.artifactSignature,
    graphFileSha256: sha256(fs.readFileSync(graphPath)),
    embeddingsFileSha256: sha256(fs.readFileSync(embeddingsPath)),
    corpusManifestSha256: sha256(fs.readFileSync(corpusManifestPath)),
    sixClassicsSha256: sha256(fs.readFileSync(sixClassicsPath)),
    gujiCoreSha256: sha256(fs.readFileSync(gujiCorePath)),
  };
}

export function reserveHoldoutEvidence(options: {
  jsonPath: string;
  markdownPath: string;
  startedRecord: HoldoutStartedRecord;
}): HoldoutEvidenceReservation {
  if (fs.existsSync(options.jsonPath) || fs.existsSync(options.markdownPath)) {
    throw new Error("Frozen holdout evidence already exists; v1 must never be evaluated again.");
  }

  fs.mkdirSync(path.dirname(options.jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.markdownPath), { recursive: true });

  let jsonFileDescriptor: number | undefined;
  let markdownFileDescriptor: number | undefined;

  try {
    jsonFileDescriptor = fs.openSync(options.jsonPath, "wx");
    markdownFileDescriptor = fs.openSync(options.markdownPath, "wx");
    fs.writeFileSync(jsonFileDescriptor, `${JSON.stringify(options.startedRecord, null, 2)}\n`);
    fs.fsyncSync(jsonFileDescriptor);
    fs.writeFileSync(
      markdownFileDescriptor,
      `# Search Frozen Holdout v1\n\nEvaluation started at ${options.startedRecord.startedAt}; evidence paths are reserved.\n`,
    );
    fs.fsyncSync(markdownFileDescriptor);

    return {
      jsonFileDescriptor,
      markdownFileDescriptor,
      jsonPath: options.jsonPath,
      markdownPath: options.markdownPath,
    };
  } catch (error) {
    if (jsonFileDescriptor !== undefined) {
      fs.closeSync(jsonFileDescriptor);
    }
    if (markdownFileDescriptor !== undefined) {
      fs.closeSync(markdownFileDescriptor);
    }
    throw error;
  }
}

export function writeHoldoutEvidence(
  reservation: HoldoutEvidenceReservation,
  decision: SearchHoldoutDecision,
): void {
  try {
    fs.ftruncateSync(reservation.jsonFileDescriptor, 0);
    fs.writeSync(reservation.jsonFileDescriptor, `${JSON.stringify(decision, null, 2)}\n`, 0, "utf8");
    fs.fsyncSync(reservation.jsonFileDescriptor);
    fs.ftruncateSync(reservation.markdownFileDescriptor, 0);
    fs.writeSync(reservation.markdownFileDescriptor, renderSearchHoldoutReport(decision), 0, "utf8");
    fs.fsyncSync(reservation.markdownFileDescriptor);
  } finally {
    fs.closeSync(reservation.jsonFileDescriptor);
    fs.closeSync(reservation.markdownFileDescriptor);
  }
}
