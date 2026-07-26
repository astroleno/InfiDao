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
export const FROZEN_SEARCH_PATHS = [
  "src/lib/search",
  "data/embeddings.json",
  "data/search-graph.json",
];

export interface HoldoutEvidencePaths {
  jsonPath: string;
  markdownPath: string;
}

export interface ArtifactIdentity {
  graphArtifactSignature: string;
  graphFileSha256: string;
  embeddingsFileSha256: string;
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

export function assertCleanEvaluationTree(root: string): void {
  if (git(root, ["status", "--porcelain"])) {
    throw new Error("Holdout evaluation requires a clean working tree.");
  }
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
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8")) as { artifactSignature?: unknown };

  if (typeof graph.artifactSignature !== "string") {
    throw new Error("Search graph does not contain an artifact signature.");
  }

  return {
    graphArtifactSignature: graph.artifactSignature,
    graphFileSha256: sha256(fs.readFileSync(graphPath)),
    embeddingsFileSha256: sha256(fs.readFileSync(embeddingsPath)),
  };
}

export function writeHoldoutEvidence(
  paths: HoldoutEvidencePaths,
  decision: SearchHoldoutDecision,
): void {
  fs.mkdirSync(path.dirname(paths.jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.markdownPath), { recursive: true });
  fs.writeFileSync(paths.jsonPath, `${JSON.stringify(decision, null, 2)}\n`);
  fs.writeFileSync(paths.markdownPath, renderSearchHoldoutReport(decision));
}
