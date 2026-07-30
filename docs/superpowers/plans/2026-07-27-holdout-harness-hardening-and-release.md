# Frozen Holdout Harness Hardening and Release Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not start a subagent without explicit user authorization.

**Goal:** Close the remaining holdout audit-boundary defects before any v1 fixture is accepted, then execute the independent holdout exactly once and complete Task 7 on the exact evidence-bearing commit.

**Architecture:** Keep fixture validation independent from ranking, but make the evaluator hermetic and provenance-bound: the sealed harness must predate the fixture, the fixture must be an ancestor of the evaluated commit, runtime artifacts and corpus inputs must be the frozen repository files, and canonical evidence paths must be reserved before the first query. After resealing, an independent reviewer authors the only fixture commit; normal CI verifies committed evidence without invoking the real holdout again.

**Tech Stack:** TypeScript, Node.js filesystem and child-process APIs, Git commit/blob identities, Jest, tsx, Next.js release scripts.

---

## Review baseline

Reviewed branch:

- `codex/release-convergence-integration`
- local and `origin/codex/release-convergence-integration` both at
  `0e7a81768cbdfcf0b6cc8633edceee6e1e7c7990`
- clean worktree and `0/0` ahead/behind
- frozen search diff against
  `81c6365766a7cf8c578cef6b060c5e43345f0d35` is empty
- targeted review suite passed: 6 suites / 22 tests
- reported integrated suite remains 58 suites / 237 tests, plus type-check,
  lint, and production build

The fixture and v1 evidence are still absent, so the holdout has not been
consumed. That makes this the last safe point to harden and reseal the harness.

## Blocking review findings

1. `SEARCH_EMBEDDING_ARTIFACT_PATH` can redirect the actual ranking artifact,
   while evidence hashes the default `data/embeddings.json`.
2. The supplied harness commit is not bound to the ledger or required to predate
   the fixture, and the fixture commit is not required to be an ancestor of the
   evaluated `HEAD`.
3. Evidence files are overwritten with `writeFileSync`; after evidence is
   committed, a clean worktree can run v1 again and replace the timestamp and
   result set.
4. CLI output paths are arbitrary and may collide with one another or with the
   fixture.
5. Fixture author identity and the required independence attestation are absent
   from the evidence schema.
6. `sourceTop3` outcomes use current corpus metadata, but the raw manifest and
   corpus sources are not included in the frozen-path check.
7. Reviewer handoff documentation still names `f261607` as the integrated
   checkpoint even though the published Unit 1–4 integration is `0e7a817`.

## File responsibility map

| Path                                                  | Responsibility                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `scripts/search-holdout/runtime.ts`                   | Git ancestry, ledger seal, artifact/corpus freeze, environment checks, and exclusive evidence reservation |
| `scripts/search-holdout/evaluator.ts`                 | Evidence metadata, threshold decision, and Markdown projection                                            |
| `scripts/run-search-holdout.ts`                       | Canonical v1 preflight order and the only real evaluation entrypoint                                      |
| `scripts/validate-search-holdout.ts`                  | Validation-only fixture, visible-query, and corpus-label loading; never imports ranking                   |
| `tests/unit/tooling/search-holdout-runtime.test.ts`   | Git topology, environment, path, and one-shot state regressions                                           |
| `tests/unit/tooling/search-holdout-evaluator.test.ts` | Metadata and threshold projection regressions                                                             |
| `tests/unit/tooling/search-holdout-runner.test.ts`    | Static boundary preventing search import before all preflight and reservation checks                      |
| `docs/qa/search-quality-methodology.md`               | Frozen ledger, authoring handoff, and exact one-shot command                                              |
| `docs/qa/reboot-mvp-acceptance-checklist.md`          | Current blocked/pass checklist                                                                            |
| `docs/qa/reboot-mvp-release-readiness.md`             | Current release decision and Task 7 evidence                                                              |

---

### Task 1: Bind harness, fixture, and reviewer provenance

**Status: completed (2026-07-30).** The provenance boundary landed in
`225a257`; it is included in the final sealed harness
`3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b`. No v1 fixture existed while this
task was completed.

**Files:**

- Modify: `scripts/search-holdout/runtime.ts`
- Modify: `scripts/search-holdout/evaluator.ts`
- Modify: `tests/unit/tooling/search-holdout-runtime.test.ts`
- Modify: `tests/unit/tooling/search-holdout-evaluator.test.ts`

- [x] **Step 1: Add failing Git-topology tests**

Add temporary-repository helpers to
`tests/unit/tooling/search-holdout-runtime.test.ts`:

```ts
import { execFileSync } from "node:child_process";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function commitFile(root: string, relativePath: string, contents: string, message: string): string {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  git(root, ["add", "--", relativePath]);
  git(root, [
    "-c",
    "user.name=Independent Reviewer",
    "-c",
    "user.email=reviewer@example.invalid",
    "commit",
    "-m",
    message,
  ]);
  return git(root, ["rev-parse", "HEAD"]);
}
```

Create tests that establish this exact chain:

```text
base -> harness -> ledger -> fixture -> evaluated HEAD
```

The fixture commit message must include:

```text
Holdout-Independence: no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection
```

Assert the new runtime API:

```ts
const provenance = assertHoldoutCommitChain(root, {
  fixtureCommit,
  fixtureRelativePath: "tests/fixtures/search-holdout-v1.json",
});

expect(provenance).toMatchObject({
  harnessCommit,
  fixtureCommit,
  fixtureAuthorName: "Independent Reviewer",
  independenceAttestation:
    "no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection",
});
```

Add three rejection cases:

- the fixture commit exists on another branch but is not an ancestor of `HEAD`;
- a harness commit created after the fixture is supplied through the ledger;
- the fixture commit lacks the exact independence trailer.

- [x] **Step 2: Run the topology tests and confirm RED**

Run:

```bash
npm test -- --runInBand --no-cache tests/unit/tooling/search-holdout-runtime.test.ts
```

Expected: FAIL because `assertHoldoutCommitChain` does not exist and current
runtime accepts no reviewer attestation.

- [x] **Step 3: Implement ledger-bound commit ancestry**

Add these constants and types to `scripts/search-holdout/runtime.ts`:

```ts
export const HOLDOUT_FIXTURE_PATH = "tests/fixtures/search-holdout-v1.json";
export const HOLDOUT_RESULTS_PATH = "docs/qa/search-holdout-v1-results.json";
export const HOLDOUT_REPORT_PATH = "docs/qa/search-holdout-v1-report.md";
export const REQUIRED_INDEPENDENCE_ATTESTATION =
  "no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection";

export interface HoldoutCommitProvenance {
  harnessCommit: string;
  fixtureCommit: string;
  fixtureBlob: string;
  fixtureAuthorName: string;
  fixtureAuthoredAt: string;
  independenceAttestation: string;
}
```

Add a ledger parser that reads the methodology as it existed in the fixture
commit:

```ts
function readHarnessSealAtFixtureCommit(root: string, fixtureCommit: string): string {
  const methodology = git(root, ["show", `${fixtureCommit}:${PROTOCOL_PATH}`]);
  const match = methodology.match(/^\|\s*Evaluation harness seal\s*\|\s*`([0-9a-f]{40})`\s*\|$/mu);

  if (!match?.[1]) {
    throw new Error(
      "Fixture commit does not contain one exact evaluation harness seal in the holdout ledger.",
    );
  }

  return match[1];
}
```

Replace the independent `assertFixtureCommit` and
`assertEvaluationHarnessCommit` call contract with:

```ts
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
  const attestation = message.match(/^Holdout-Independence:\s*(.+)$/mu)?.[1]?.trim();

  if (
    !fixtureAuthorName ||
    !fixtureAuthoredAt ||
    attestation !== REQUIRED_INDEPENDENCE_ATTESTATION
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
    independenceAttestation: attestation,
  };
}
```

- [x] **Step 4: Extend evidence metadata**

Add these fields to `HoldoutEvaluationMetadata` in
`scripts/search-holdout/evaluator.ts`:

```ts
fixtureAuthorName: string;
fixtureAuthoredAt: string;
independenceAttestation: string;
```

Render all three in the Markdown `Audit Identity` section:

```ts
`- Fixture author: ${decision.metadata.fixtureAuthorName}`,
`- Fixture authored at: ${decision.metadata.fixtureAuthoredAt}`,
`- Independence attestation: ${decision.metadata.independenceAttestation}`,
```

Update the synthetic metadata in
`tests/unit/tooling/search-holdout-evaluator.test.ts` and assert that all three
values appear in the Markdown report.

- [x] **Step 5: Run tests and commit the provenance boundary**

Run:

```bash
npm test -- --runInBand --no-cache \
  tests/unit/tooling/search-holdout-runtime.test.ts \
  tests/unit/tooling/search-holdout-evaluator.test.ts
npm run type-check
```

Expected: both suites pass and type-check exits 0.

Commit:

```bash
git add \
  scripts/search-holdout/runtime.ts \
  scripts/search-holdout/evaluator.ts \
  tests/unit/tooling/search-holdout-runtime.test.ts \
  tests/unit/tooling/search-holdout-evaluator.test.ts
git diff --cached --check
git commit -m "fix(holdout): bind fixture and harness provenance"
```

---

### Task 2: Make runtime inputs hermetic and evidence one-shot

**Status: completed (2026-07-30).** The hermetic runtime boundary landed in
`95ca02d` and is included in the final sealed harness
`3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b`. No v1 fixture existed while this
task was completed.

**Files:**

- Modify: `scripts/search-holdout/runtime.ts`
- Modify: `scripts/search-holdout/evaluator.ts`
- Modify: `tests/unit/tooling/search-holdout-runtime.test.ts`
- Modify: `tests/unit/tooling/search-holdout-evaluator.test.ts`

- [x] **Step 1: Add failing environment and path tests**

Add tests for:

```ts
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
```

Add canonical path tests:

```ts
expect(() =>
  assertCanonicalHoldoutPaths(process.cwd(), {
    casesPath: path.join(process.cwd(), "tests/fixtures/other.json"),
    jsonPath: path.join(process.cwd(), HOLDOUT_RESULTS_PATH),
    markdownPath: path.join(process.cwd(), HOLDOUT_REPORT_PATH),
  }),
).toThrow(HOLDOUT_FIXTURE_PATH);

expect(() =>
  assertCanonicalHoldoutPaths(process.cwd(), {
    casesPath: path.join(process.cwd(), HOLDOUT_FIXTURE_PATH),
    jsonPath: path.join(process.cwd(), HOLDOUT_REPORT_PATH),
    markdownPath: path.join(process.cwd(), HOLDOUT_REPORT_PATH),
  }),
).toThrow("canonical evidence paths");
```

Add one-shot tests using a temporary directory:

```ts
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

expect(JSON.parse(fs.readFileSync(jsonPath, "utf8"))).toMatchObject({
  status: "started",
});

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
```

- [x] **Step 2: Run the new tests and confirm RED**

Run:

```bash
npm test -- --runInBand --no-cache tests/unit/tooling/search-holdout-runtime.test.ts
```

Expected: FAIL because the hermetic environment, canonical path, and reservation
APIs do not exist.

- [x] **Step 3: Reject artifact path overrides**

Add to `scripts/search-holdout/runtime.ts`:

```ts
export function assertDefaultSearchArtifactEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  for (const name of ["SEARCH_EMBEDDING_ARTIFACT_PATH", "SEARCH_GRAPH_PATH"] as const) {
    if (environment[name]?.trim()) {
      throw new Error(`${name} must be unset for frozen holdout evaluation.`);
    }
  }
}
```

This check must run before either search module is imported. Remote annotation
credentials are unrelated and must not be logged.

- [x] **Step 4: Freeze the corpus inputs used by source contracts**

Add:

```ts
export const FROZEN_CORPUS_PATHS = [
  "data/corpus-manifest.json",
  "data/sixclassics-sample.jsonl",
  "data/rysxguji/guji-core-v1.jsonl",
] as const;

export function assertFrozenCorpusPaths(root: string): void {
  git(root, ["diff", "--quiet", FROZEN_SEARCH_COMMIT, "--", ...FROZEN_CORPUS_PATHS]);
}
```

Extend `ArtifactIdentity` and `readArtifactIdentity` with:

```ts
corpusManifestSha256: string;
sixClassicsSha256: string;
gujiCoreSha256: string;
```

Compute each hash from the exact paths in `FROZEN_CORPUS_PATHS`. Add the same
fields to evaluator JSON and Markdown metadata. This prevents a `sourceTop3`
decision from silently using source labels that differ from the frozen corpus.

- [x] **Step 5: Enforce canonical v1 paths**

Add:

```ts
export function assertCanonicalHoldoutPaths(
  root: string,
  paths: {
    casesPath: string;
    jsonPath: string;
    markdownPath: string;
  },
): void {
  const expected = {
    casesPath: path.join(root, HOLDOUT_FIXTURE_PATH),
    jsonPath: path.join(root, HOLDOUT_RESULTS_PATH),
    markdownPath: path.join(root, HOLDOUT_REPORT_PATH),
  };

  if (
    path.resolve(paths.casesPath) !== expected.casesPath ||
    path.resolve(paths.jsonPath) !== expected.jsonPath ||
    path.resolve(paths.markdownPath) !== expected.markdownPath ||
    new Set(Object.values(paths).map(value => path.resolve(value))).size !== 3
  ) {
    throw new Error(
      `Frozen holdout must use canonical evidence paths: ${HOLDOUT_FIXTURE_PATH}, ${HOLDOUT_RESULTS_PATH}, ${HOLDOUT_REPORT_PATH}.`,
    );
  }
}
```

Task 3 removes `--cases`, `--json`, `--markdown`, and `--harness-commit` from
the real evaluator CLI. The runtime API added here supplies the canonical paths
that Task 3 will wire into the runner.

- [x] **Step 6: Reserve the result path before importing search**

Add these runtime types and functions:

```ts
export interface HoldoutStartedRecord {
  status: "started";
  startedAt: string;
  fixtureCommit: string;
  evaluatedCommit: string;
}

export interface HoldoutEvidenceReservation {
  fileDescriptor: number;
  jsonPath: string;
  markdownPath: string;
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
  const fileDescriptor = fs.openSync(options.jsonPath, "wx");
  fs.writeFileSync(fileDescriptor, `${JSON.stringify(options.startedRecord, null, 2)}\n`);
  fs.fsyncSync(fileDescriptor);

  return {
    fileDescriptor,
    jsonPath: options.jsonPath,
    markdownPath: options.markdownPath,
  };
}
```

Change `writeHoldoutEvidence` to require the reservation, truncate and fsync the
already-open JSON descriptor, close it, then create Markdown with exclusive
`"wx"` semantics:

```ts
export function writeHoldoutEvidence(
  reservation: HoldoutEvidenceReservation,
  decision: SearchHoldoutDecision,
): void {
  fs.ftruncateSync(reservation.fileDescriptor, 0);
  fs.writeSync(reservation.fileDescriptor, `${JSON.stringify(decision, null, 2)}\n`, 0, "utf8");
  fs.fsyncSync(reservation.fileDescriptor);
  fs.closeSync(reservation.fileDescriptor);
  fs.writeFileSync(reservation.markdownPath, renderSearchHoldoutReport(decision), { flag: "wx" });
}
```

If evaluation throws after reservation, retain the `status: "started"` record,
exit non-zero, and treat v1 as consumed and blocked pending audit. Do not delete
the marker or retry.

- [x] **Step 7: Run tests and commit the hermetic boundary**

Run:

```bash
npm test -- --runInBand --no-cache \
  tests/unit/tooling/search-holdout-runtime.test.ts \
  tests/unit/tooling/search-holdout-evaluator.test.ts
npm run type-check
npm run lint
```

Expected: all commands exit 0.

Commit:

```bash
git add \
  scripts/search-holdout/runtime.ts \
  scripts/search-holdout/evaluator.ts \
  tests/unit/tooling/search-holdout-runtime.test.ts \
  tests/unit/tooling/search-holdout-evaluator.test.ts
git diff --cached --check
git commit -m "fix(holdout): enforce hermetic one-shot runtime"
```

---

### Task 3: Integrate, verify, and reseal the reviewer handoff

**Status: completed (2026-07-30).** The final sealed harness is
`3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b`; its ledger and release handoff
were resealed in `a5e1bc4`. No v1 fixture or evidence exists.

**Files:**

- Modify: `scripts/run-search-holdout.ts`
- Modify: `tests/unit/tooling/search-holdout-runner.test.ts`
- Modify: `docs/qa/search-quality-methodology.md`
- Modify: `docs/qa/2026-07-26-quality-convergence-baseline.md`
- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`
- Modify: `docs/plans/2026-07-26-001-fix-holdout-release-signoff-plan.md`
- Modify: `tests/unit/docs/search-quality-methodology.test.ts`
- Modify: `tests/unit/docs/convergence-baseline.test.ts`
- Modify: `tests/unit/docs/release-readiness.test.ts`
- Modify: `tests/unit/docs/acceptance-checklist.test.ts`

- [x] **Step 1: Put preflight in a non-consuming order**

The `main` function in `scripts/run-search-holdout.ts` must execute in this
order:

```ts
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
    fixtureCommit,
    evaluatedCommit,
  },
});

const { loadSearchIndex } = await import("../src/lib/search/index-store");
const { diagnoseSearchPassages } = await import("../src/lib/search/diagnostics");
```

Use `startedAt` as the single `metadata.generatedAt` value. Populate metadata
from `provenance`; do not accept any author, harness, artifact, or path identity
from CLI input.

Replace the current CLI resolver with:

```ts
function requireFixtureCommit(): string {
  const fixtureCommit = optionValue("fixture-commit");

  if (!fixtureCommit) {
    throw new Error("Usage: tsx scripts/run-search-holdout.ts --fixture-commit <sha>");
  }

  return fixtureCommit;
}
```

Remove handling for `--cases`, `--json`, `--markdown`, and
`--harness-commit`; the three paths and harness seal now come from repository
constants and the fixture commit's ledger.

- [x] **Step 2: Strengthen the static runner boundary test**

In `tests/unit/tooling/search-holdout-runner.test.ts`, assert all of these calls
appear before the first dynamic search import:

```ts
for (const boundary of [
  "assertDefaultSearchArtifactEnvironment()",
  "validateSearchHoldoutFixtureFile(paths.casesPath)",
  "assertFrozenSearchPaths(root)",
  "assertFrozenCorpusPaths(root)",
  "assertFrozenProtocolRules(root)",
  "assertHoldoutCommitChain(root",
  "reserveHoldoutEvidence({",
]) {
  expect(runner.indexOf(boundary)).toBeGreaterThanOrEqual(0);
  expect(runner.indexOf(boundary)).toBeLessThan(
    runner.indexOf('await import("../src/lib/search/index-store")'),
  );
}
```

Also assert that the real runner no longer contains the option names
`--cases`, `--json`, `--markdown`, or `--harness-commit`.

- [x] **Step 3: Run the full pre-seal verification**

Run:

```bash
npm run type-check
npm run lint
npm test -- --runInBand --no-cache
npm run build
git diff --exit-code \
  81c6365766a7cf8c578cef6b060c5e43345f0d35 \
  -- \
  src/lib/search \
  data/embeddings.json \
  data/search-graph.json \
  data/corpus-manifest.json \
  data/sixclassics-sample.jsonl \
  data/rysxguji/guji-core-v1.jsonl
```

Expected: all commands pass and the frozen diff is empty. Do not run
`evaluate:search-holdout`.

- [x] **Step 4: Commit and capture the new harness seal**

Commit all harness behavior and tests before changing the ledger:

```bash
git add \
  scripts/search-holdout \
  scripts/run-search-holdout.ts \
  scripts/validate-search-holdout.ts \
  tests/unit/tooling/search-holdout-runtime.test.ts \
  tests/unit/tooling/search-holdout-evaluator.test.ts \
  tests/unit/tooling/search-holdout-runner.test.ts
git diff --cached --check
git commit -m "fix(holdout): close v1 audit boundaries"
git rev-parse HEAD
```

Record the exact 40-character output as the new evaluation harness seal. Do not
amend or squash this commit after the fixture author begins work.

- [x] **Step 5: Update the ledger and release documents**

Use `apply_patch` to:

- replace `ba3353e...` with the exact new harness seal in the methodology
  ledger and surrounding handoff explanation;
- state that `0e7a81768cbdfcf0b6cc8633edceee6e1e7c7990` was the reviewed Unit 1–4
  integration base;
- state that the old harness was reviewed but superseded before any fixture
  existed;
- change the old fix plan status to `superseded` and link to this plan;
- keep holdout, Task 7, and RC status blocked;
- document the exact independence trailer;
- replace the evaluator command with:

```bash
npm run evaluate:search-holdout -- \
  --fixture-commit <exact fixture commit SHA supplied by the independent reviewer>
```

The angle-bracket text above is documentation for a future external SHA, not a
shell value to execute.

- [x] **Step 6: Run documentation contracts and commit the handoff**

Run:

```bash
npm test -- --runInBand --no-cache \
  tests/unit/docs/search-quality-methodology.test.ts \
  tests/unit/docs/convergence-baseline.test.ts \
  tests/unit/docs/release-readiness.test.ts \
  tests/unit/docs/acceptance-checklist.test.ts
git diff --check
```

Expected: all four suites pass.

Commit:

```bash
git add \
  docs/qa/search-quality-methodology.md \
  docs/qa/2026-07-26-quality-convergence-baseline.md \
  docs/qa/reboot-mvp-release-readiness.md \
  docs/qa/reboot-mvp-acceptance-checklist.md \
  docs/plans/2026-07-26-001-fix-holdout-release-signoff-plan.md \
  tests/unit/docs/search-quality-methodology.test.ts \
  tests/unit/docs/convergence-baseline.test.ts \
  tests/unit/docs/release-readiness.test.ts \
  tests/unit/docs/acceptance-checklist.test.ts
git diff --cached --check
git commit -m "docs(qa): reseal independent holdout handoff"
```

This commit is the authoring base to provide to the independent reviewer.
Remote publication remains a separate explicit action.

---

### Task 4: Accept the independent fixture without consuming v1

**Authoring base:** use the exact integration commit that includes this runbook
repair, supplied by the release owner. Do not use a prior handoff SHA.

**Files:**

- Create externally: `tests/fixtures/search-holdout-v1.json`
- No other repository path may change in the fixture commit

- [ ] **Step 1: Give the reviewer only the authoring package**

Provide:

- the exact Task 3 handoff commit SHA;
- the corpus files and source mappings;
- `docs/qa/search-quality-methodology.md`;
- the validator command;
- the required fixture shape;
- the exact independence trailer.

Do not provide search Top 3 output, tuned aliases, debug diagnostics, or the real
evaluator output.

- [ ] **Step 2: Reviewer creates the fixture**

The reviewer creates exactly 24 `in-domain` and 6 `ood` cases at:

```text
tests/fixtures/search-holdout-v1.json
```

They may run only:

```bash
npm run validate:search-holdout -- \
  --cases tests/fixtures/search-holdout-v1.json
```

Expected: validation reports 30 total, 24 in-domain, 6 OOD, and a SHA-256. This
command must not import or query search.

- [ ] **Step 3: Reviewer creates the fixture-only commit**

Commit message:

```text
test(holdout): add independent v1 fixture

Holdout-Independence: no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection
```

Commands:

```bash
git add -- tests/fixtures/search-holdout-v1.json
git diff --cached --check
git diff --cached --name-only
git commit \
  -m "test(holdout): add independent v1 fixture" \
  -m "Holdout-Independence: no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection"
git rev-parse HEAD
```

Expected: the staged and committed path list contains exactly
`tests/fixtures/search-holdout-v1.json`.

- [ ] **Step 4: Intake verifies without ranking**

On the integration branch, verify:

```bash
git status --short
fixture_commit="$(git rev-parse HEAD)"
harness_seal="$(
  git show "$fixture_commit":docs/qa/search-quality-methodology.md |
    sed -n 's/^|[[:space:]]*Evaluation harness seal[[:space:]]*|[[:space:]]*`\([0-9a-f]\{40\}\)`[[:space:]]*|[[:space:]]*$/\1/p'
)"
git show --name-only --format=fuller "$fixture_commit"
git merge-base --is-ancestor "$harness_seal" "$fixture_commit"
npm run validate:search-holdout -- \
  --cases tests/fixtures/search-holdout-v1.json
git diff --exit-code \
  81c6365766a7cf8c578cef6b060c5e43345f0d35 \
  -- \
  src/lib/search \
  data/embeddings.json \
  data/search-graph.json \
  data/corpus-manifest.json \
  data/sixclassics-sample.jsonl \
  data/rysxguji/guji-core-v1.jsonl
```

Expected: clean tree, fixture-only commit, correct ancestry, valid fixture, and
empty frozen diff. If any command fails, return the fixture to the reviewer and
do not run the evaluator.

---

### Task 5: Execute v1 once and commit immutable evidence

**Files:**

- Existing from reviewer: `tests/fixtures/search-holdout-v1.json`
- Create: `docs/qa/search-holdout-v1-results.json`
- Create: `docs/qa/search-holdout-v1-report.md`
- Create: `tests/unit/docs/search-holdout-evidence.test.ts`
- Modify: `docs/qa/search-quality-methodology.md`
- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`

- [ ] **Step 1: Perform the final non-consuming preflight**

Run:

```bash
git status --short
test ! -e docs/qa/search-holdout-v1-results.json
test ! -e docs/qa/search-holdout-v1-report.md
npm run validate:search-holdout -- \
  --cases tests/fixtures/search-holdout-v1.json
```

Expected: clean tree, both evidence paths absent, validator pass. Stop on any
other result.

- [ ] **Step 2: Run the evaluator exactly once**

Run one command:

```bash
fixture_commit="$(git rev-parse HEAD)"
npm run evaluate:search-holdout -- \
  --fixture-commit "$fixture_commit"
```

Do not pipe, repeat, preview, or invoke a diagnostic runner. A `pass` exits 0. A
threshold block writes both evidence files and exits 1. A runtime failure after
reservation leaves a `status: "started"` record and permanently blocks v1
pending audit.

- [ ] **Step 3: Inspect evidence without rerunning search**

Read only:

```bash
git status --short
sed -n '1,240p' docs/qa/search-holdout-v1-report.md
node -e 'const r=require("./docs/qa/search-holdout-v1-results.json"); console.log(JSON.stringify({decision:r.decision,categories:r.categories,metadata:r.metadata},null,2))'
```

Confirm:

- one timestamp;
- fixture author and attestation;
- fixture, harness, evaluated, frozen-search, and protocol identities;
- default graph/embeddings and frozen corpus hashes;
- separate 19/24 and 6/6 thresholds;
- JSON and Markdown decisions agree.

- [ ] **Step 4: Add a non-evaluating evidence integrity test**

Create `tests/unit/docs/search-holdout-evidence.test.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("frozen holdout v1 committed evidence", () => {
  it("keeps fixture, JSON, and Markdown identities aligned without invoking search", () => {
    const root = process.cwd();
    const fixture = readFileSync(path.join(root, "tests/fixtures/search-holdout-v1.json"), "utf8");
    const results = JSON.parse(
      readFileSync(path.join(root, "docs/qa/search-holdout-v1-results.json"), "utf8"),
    ) as {
      decision: "pass" | "blocked";
      metadata: {
        fixtureSha256: string;
        fixtureCommit: string;
        evaluationHarnessCommit: string;
        evaluatedCommit: string;
        independenceAttestation: string;
      };
      categories: {
        inDomain: { passed: number; total: number; required: number };
        ood: { passed: number; total: number; required: number };
      };
    };
    const report = readFileSync(path.join(root, "docs/qa/search-holdout-v1-report.md"), "utf8");

    expect(createHash("sha256").update(fixture).digest("hex")).toBe(results.metadata.fixtureSha256);
    expect(report).toContain(`Decision: **${results.decision}**`);
    expect(report).toContain(results.metadata.fixtureCommit);
    expect(report).toContain(results.metadata.evaluationHarnessCommit);
    expect(report).toContain(results.metadata.evaluatedCommit);
    expect(report).toContain(results.metadata.independenceAttestation);
    expect(results.categories.inDomain).toMatchObject({
      total: 24,
      required: 19,
    });
    expect(results.categories.ood).toMatchObject({
      total: 6,
      required: 6,
    });
  });
});
```

The test may hash and compare committed files. It must not import
`src/lib/search`, `diagnoseSearchPassages`, or the real runner.

- [ ] **Step 5: Record the decision and commit unchanged evidence**

Update the three QA documents using only the generated facts.

Run:

```bash
npm test -- --runInBand --no-cache \
  tests/unit/docs/search-holdout-evidence.test.ts \
  tests/unit/docs/search-quality-methodology.test.ts \
  tests/unit/docs/release-readiness.test.ts \
  tests/unit/docs/acceptance-checklist.test.ts
git diff --check
```

Commit regardless of pass or blocked threshold:

```bash
git add \
  tests/fixtures/search-holdout-v1.json \
  docs/qa/search-holdout-v1-results.json \
  docs/qa/search-holdout-v1-report.md \
  tests/unit/docs/search-holdout-evidence.test.ts \
  docs/qa/search-quality-methodology.md \
  docs/qa/reboot-mvp-release-readiness.md \
  docs/qa/reboot-mvp-acceptance-checklist.md \
  tests/unit/docs/search-quality-methodology.test.ts \
  tests/unit/docs/release-readiness.test.ts \
  tests/unit/docs/acceptance-checklist.test.ts
git diff --cached --check
git commit -m "test(holdout): record immutable v1 evidence"
git rev-parse HEAD
```

If the decision is `blocked`, stop the release path and create a separate v2
search-improvement plan. Never modify or rerun v1.

---

### Task 6: Run formal Task 7 on the evidence-bearing SHA

**Files:**

- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`
- Modify: `docs/qa/2026-07-26-quality-convergence-baseline.md`
- Modify: their documentation contract tests

**Dependency:** Task 5 decision must be `pass`.

- [ ] **Step 1: Pin the candidate and check disk**

Run:

```bash
git status --short
git rev-parse HEAD
df -h .
```

Expected: clean worktree. Record the exact SHA as the Task 7 candidate. Hard
stop if available disk is below 4 GiB; do not delete project or user data.

- [ ] **Step 2: Create a detached verification worktree**

Run:

```bash
release_source_dir="$(pwd)"
release_verify_root="$(mktemp -d "${TMPDIR:-/tmp}/infidao-release-verify.XXXXXX")"
release_verify_dir="$release_verify_root/worktree"
git worktree add --detach "$release_verify_dir" "$(git rev-parse HEAD)"
cd "$release_verify_dir"
```

- [ ] **Step 3: Install and reproduce artifacts**

Run:

```bash
npm ci
SEARCH_EMBEDDING_BACKEND=local npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
```

Expected: clean artifact reproduction.

- [ ] **Step 4: Run every automated gate**

Run:

```bash
npm run type-check
npm run lint
npm test -- --runInBand --no-cache
npm test -- --runInBand --no-cache
npm run test:stability
npm run test:stability
npm run test:search-quality
npm run build
```

Expected: every command exits 0, with no timeout, lint warning, or generated
artifact diff.

- [ ] **Step 5: Run standalone production smoke**

Prepare only the detached worktree:

```bash
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then
  cp -R public .next/standalone/public
fi
PORT=3001 HOSTNAME=127.0.0.1 \
  node .next/standalone/server.js \
  > /tmp/infidao-release-smoke.log 2>&1 &
server_pid=$!
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
```

Expected: health, homepage assets, search, annotation, production telemetry
privacy, and disabled legacy embed checks all pass.

- [ ] **Step 6: Complete current manual acceptance**

Against the same standalone server, manually verify desktop `1440px` and mobile
`390px`:

```text
query -> search -> result -> reading dwell -> annotate -> explore ->
back -> select new root -> reset -> leaf state
```

Also verify retryable error state, Escape/skip behavior, and no blocked controls
or layout overlap. Do not use Playwright unless the user separately authorizes
it for this critical visual gate.

- [ ] **Step 7: Record telemetry truthfully**

If canonical provider credentials are unavailable, verify deterministic
fallback and retain only the documented exception. Do not claim provider
success. If credentials are available, run the existing dev telemetry smoke
with secrets injected only through the shell environment and do not write them
to logs or documentation.

- [ ] **Step 8: Stop the server and inspect the detached worktree**

Run:

```bash
kill "$server_pid"
wait "$server_pid" 2>/dev/null || true
git status --short
cd "$release_source_dir"
git worktree remove "$release_verify_dir"
rmdir "$release_verify_root"
```

Expected: detached worktree status is empty before removal. Do not use
`--force`.

- [ ] **Step 9: Update and verify final sign-off documents**

Record:

- exact evidence-bearing candidate SHA;
- Node/npm versions;
- artifact signature and hashes;
- two full Jest results;
- two stability results;
- search-quality, build, and smoke results;
- desktop/mobile outcome;
- actual telemetry outcome or the accepted exception.

Run the documentation contracts and commit only those documents and tests:

```bash
npm test -- --runInBand --no-cache \
  tests/unit/docs/convergence-baseline.test.ts \
  tests/unit/docs/release-readiness.test.ts \
  tests/unit/docs/acceptance-checklist.test.ts \
  tests/unit/docs/search-quality-methodology.test.ts \
  tests/unit/docs/search-holdout-evidence.test.ts
git diff --check
git add \
  docs/qa/2026-07-26-quality-convergence-baseline.md \
  docs/qa/reboot-mvp-release-readiness.md \
  docs/qa/reboot-mvp-acceptance-checklist.md \
  docs/qa/search-quality-methodology.md \
  tests/unit/docs/convergence-baseline.test.ts \
  tests/unit/docs/release-readiness.test.ts \
  tests/unit/docs/acceptance-checklist.test.ts \
  tests/unit/docs/search-quality-methodology.test.ts \
  tests/unit/docs/search-holdout-evidence.test.ts
git diff --cached --check
git commit -m "docs(qa): sign off verified convergence candidate"
```

Any product, harness, fixture, artifact, or runtime change after the verified
candidate requires a new complete Task 7 run. Push, PR creation, and merge to
`main` remain separately authorized actions.

---

## Completion gates

- [ ] No real holdout query runs before Tasks 1–4 complete.
- [ ] The new harness seal is an ancestor of the fixture commit.
- [ ] The fixture commit is an ancestor of the evaluated commit.
- [ ] The fixture commit changes one canonical path and contains the exact
      independence trailer.
- [ ] Default graph and embeddings paths are enforced.
- [ ] Frozen corpus inputs cannot drift behind `sourceTop3` decisions.
- [ ] Evidence paths are canonical, distinct, and exclusively reserved.
- [ ] A second v1 invocation fails before importing search.
- [ ] Threshold failure is committed unchanged and blocks release.
- [ ] Passing v1 is followed by Task 7 on the exact evidence-bearing SHA.

## Self-review

- Spec coverage: all seven blocking findings map to Tasks 1–3; independent
  fixture intake maps to Task 4; immutable evidence maps to Task 5; final release
  verification maps to Task 6.
- Placeholder scan: future Git SHAs are obtained by explicit `git rev-parse`
  steps; no implementation step depends on an invented SHA.
- Type consistency: `HoldoutCommitProvenance`,
  `HoldoutEvidenceReservation`, canonical path constants, and metadata field
  names are used consistently across runtime, runner, evaluator, tests, and
  evidence.
