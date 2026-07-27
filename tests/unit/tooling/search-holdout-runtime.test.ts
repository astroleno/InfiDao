import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FROZEN_CORPUS_PATHS,
  HOLDOUT_REPORT_PATH,
  HOLDOUT_RESULTS_PATH,
  assertCanonicalHoldoutPaths,
  assertDefaultSearchArtifactEnvironment,
  assertFrozenCorpusPaths,
  assertHoldoutCommitChain,
  assertFrozenProtocolRules,
  extractFrozenProtocolRules,
  readArtifactIdentity,
  reserveHoldoutEvidence,
  writeHoldoutEvidence,
} from "../../../scripts/search-holdout/runtime";
import { createSearchHoldoutDecision, type HoldoutEvaluationOutput } from "../../../scripts/search-holdout/evaluator";

const fixturePath = "tests/fixtures/search-holdout-v1.json";
const requiredIndependenceAttestation =
  "no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection";

function sha256File(absolutePath: string): string {
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function git(root: string, arguments_: string[]): string {
  return execFileSync("git", arguments_, { cwd: root, encoding: "utf8" }).trim();
}

function commitFile(
  root: string,
  relativePath: string,
  contents: string,
  subject: string,
  body?: string,
): string {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  git(root, ["add", "--", relativePath]);
  const arguments_ = [
    "-c",
    "user.name=Independent Reviewer",
    "-c",
    "user.email=reviewer@example.invalid",
    "commit",
    "-m",
    subject,
  ];

  if (body) {
    arguments_.push("-m", body);
  }

  git(root, arguments_);
  return git(root, ["rev-parse", "HEAD"]);
}

function createRepository(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "infidao-holdout-topology-"));
  git(root, ["init", "--initial-branch=main"]);
  commitFile(root, "README.md", "base\n", "test: add base");
  return root;
}

function holdoutLedger(harnessCommit: string): string {
  return [
    "# Search Quality Methodology",
    "",
    "## Holdout ledger",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Evaluation harness seal | \`${harnessCommit}\` |`,
    "",
  ].join("\n");
}

function createValidHoldoutChain(options: { includeAttestation?: boolean } = {}) {
  const root = createRepository();
  const harnessCommit = commitFile(
    root,
    "scripts/search-holdout/runtime.ts",
    "export const sealed = true;\n",
    "fix(holdout): seal harness",
  );
  commitFile(
    root,
    "docs/qa/search-quality-methodology.md",
    holdoutLedger(harnessCommit),
    "docs(qa): record harness seal",
  );
  const fixtureCommit = commitFile(
    root,
    fixturePath,
    "[]\n",
    "test(holdout): add independent v1 fixture",
    options.includeAttestation === false
      ? undefined
      : `Holdout-Independence: ${requiredIndependenceAttestation}`,
  );
  const evaluatedCommit = commitFile(root, "docs/evaluated.md", "candidate\n", "docs: mark candidate");

  return { root, harnessCommit, fixtureCommit, evaluatedCommit };
}

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
  it("rejects search artifact path overrides before evaluation", () => {
    expect(() =>
      assertDefaultSearchArtifactEnvironment({
        SEARCH_EMBEDDING_ARTIFACT_PATH: "/tmp/alternate-embeddings.json",
      }),
    ).toThrow("SEARCH_EMBEDDING_ARTIFACT_PATH");
    expect(() =>
      assertDefaultSearchArtifactEnvironment({
        SEARCH_GRAPH_PATH: "/tmp/alternate-search-graph.json",
      }),
    ).toThrow("SEARCH_GRAPH_PATH");
  });

  it("accepts only the canonical v1 fixture and distinct evidence paths", () => {
    const root = process.cwd();
    const canonicalPaths = {
      casesPath: path.join(root, fixturePath),
      jsonPath: path.join(root, HOLDOUT_RESULTS_PATH),
      markdownPath: path.join(root, HOLDOUT_REPORT_PATH),
    };

    expect(() => assertCanonicalHoldoutPaths(root, canonicalPaths)).not.toThrow();
    expect(() =>
      assertCanonicalHoldoutPaths(root, {
        ...canonicalPaths,
        casesPath: path.join(root, "tests/fixtures/other.json"),
      }),
    ).toThrow(fixturePath);
    expect(() =>
      assertCanonicalHoldoutPaths(root, {
        ...canonicalPaths,
        jsonPath: canonicalPaths.markdownPath,
      }),
    ).toThrow("canonical evidence paths");
  });

  it("freezes every corpus input used by source expectations and records their hashes", () => {
    const root = process.cwd();

    expect(FROZEN_CORPUS_PATHS).toEqual([
      "data/corpus-manifest.json",
      "data/sixclassics-sample.jsonl",
      "data/rysxguji/guji-core-v1.jsonl",
    ]);
    expect(() => assertFrozenCorpusPaths(root)).not.toThrow();

    const identity = readArtifactIdentity(root);
    expect(identity).toMatchObject({
      corpusManifestSha256: sha256File(path.join(root, FROZEN_CORPUS_PATHS[0])),
      sixClassicsSha256: sha256File(path.join(root, FROZEN_CORPUS_PATHS[1])),
      gujiCoreSha256: sha256File(path.join(root, FROZEN_CORPUS_PATHS[2])),
    });
  });

  it("binds the ledger-sealed harness, independent fixture, and evaluated HEAD", () => {
    const topology = createValidHoldoutChain();

    try {
      expect(
        assertHoldoutCommitChain(topology.root, {
          fixtureCommit: topology.fixtureCommit,
          fixtureRelativePath: fixturePath,
        }),
      ).toMatchObject({
        harnessCommit: topology.harnessCommit,
        fixtureCommit: topology.fixtureCommit,
        fixtureAuthorName: "Independent Reviewer",
        independenceAttestation: requiredIndependenceAttestation,
      });
    } finally {
      fs.rmSync(topology.root, { recursive: true, force: true });
    }
  });

  it("rejects a fixture commit that is not an ancestor of evaluated HEAD", () => {
    const root = createRepository();

    try {
      const harnessCommit = commitFile(
        root,
        "scripts/search-holdout/runtime.ts",
        "export const sealed = true;\n",
        "fix(holdout): seal harness",
      );
      commitFile(
        root,
        "docs/qa/search-quality-methodology.md",
        holdoutLedger(harnessCommit),
        "docs(qa): record harness seal",
      );
      git(root, ["switch", "-c", "reviewer-fixture"]);
      const fixtureCommit = commitFile(
        root,
        fixturePath,
        "[]\n",
        "test(holdout): add independent v1 fixture",
        `Holdout-Independence: ${requiredIndependenceAttestation}`,
      );
      git(root, ["switch", "main"]);
      commitFile(root, "docs/evaluated.md", "candidate\n", "docs: mark candidate");

      expect(() =>
        assertHoldoutCommitChain(root, {
          fixtureCommit,
          fixtureRelativePath: fixturePath,
        }),
      ).toThrow("merge-base --is-ancestor");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a ledger harness seal that does not predate the fixture", () => {
    const root = createRepository();

    try {
      git(root, ["switch", "-c", "rogue-harness"]);
      const rogueHarnessCommit = commitFile(
        root,
        "scripts/search-holdout/runtime.ts",
        "export const rogue = true;\n",
        "fix(holdout): forge harness",
      );
      git(root, ["switch", "main"]);
      commitFile(
        root,
        "docs/qa/search-quality-methodology.md",
        holdoutLedger(rogueHarnessCommit),
        "docs(qa): record forged harness seal",
      );
      const fixtureCommit = commitFile(
        root,
        fixturePath,
        "[]\n",
        "test(holdout): add independent v1 fixture",
        `Holdout-Independence: ${requiredIndependenceAttestation}`,
      );

      expect(() =>
        assertHoldoutCommitChain(root, {
          fixtureCommit,
          fixtureRelativePath: fixturePath,
        }),
      ).toThrow("merge-base --is-ancestor");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a fixture commit without the exact independence attestation", () => {
    const topology = createValidHoldoutChain({ includeAttestation: false });

    try {
      expect(() =>
        assertHoldoutCommitChain(topology.root, {
          fixtureCommit: topology.fixtureCommit,
          fixtureRelativePath: fixturePath,
        }),
      ).toThrow("Holdout-Independence");
    } finally {
      fs.rmSync(topology.root, { recursive: true, force: true });
    }
  });

  it("reserves both evidence paths once before writing a blocked decision", () => {
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
        fixtureAuthorName: "Independent Reviewer",
        fixtureAuthoredAt: "2026-07-27T00:00:00.000Z",
        independenceAttestation: requiredIndependenceAttestation,
        artifacts: {
          graphArtifactSignature: "sha256:graph",
          graphFileSha256: "c".repeat(64),
          embeddingsFileSha256: "d".repeat(64),
          corpusManifestSha256: "e".repeat(64),
          sixClassicsSha256: "f".repeat(64),
          gujiCoreSha256: "0".repeat(64),
        },
        parameters: { topK: 5, threshold: 0.25 },
      },
      buildOutputs(),
    );

    try {
      const reservation = reserveHoldoutEvidence({
        jsonPath,
        markdownPath,
        startedRecord: {
          status: "started",
          startedAt: "2026-07-27T00:00:00.000Z",
          fixtureCommit: "a".repeat(40),
          evaluatedCommit: "b".repeat(40),
        },
      });

      expect(JSON.parse(fs.readFileSync(jsonPath, "utf8"))).toMatchObject({ status: "started" });
      expect(fs.readFileSync(markdownPath, "utf8")).toContain("Evaluation started");
      expect(() =>
        reserveHoldoutEvidence({
          jsonPath,
          markdownPath,
          startedRecord: {
            status: "started",
            startedAt: "2026-07-27T00:00:01.000Z",
            fixtureCommit: "a".repeat(40),
            evaluatedCommit: "b".repeat(40),
          },
        }),
      ).toThrow("already exists");

      writeHoldoutEvidence(reservation, decision);

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
