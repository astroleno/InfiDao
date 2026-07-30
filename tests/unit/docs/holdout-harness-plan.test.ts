import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const HARNESS_SEAL = "3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b";

function taskSection(plan: string, taskNumber: number): string {
  const start = plan.indexOf(`### Task ${taskNumber}:`);
  const end = plan.indexOf("\n### Task ", start + 1);

  if (start === -1) {
    throw new Error(`Task ${taskNumber} is missing from the holdout harness plan.`);
  }

  return plan.slice(start, end === -1 ? undefined : end);
}

function stepSection(task: string, stepNumber: number): string {
  const start = task.indexOf(`- [ ] **Step ${stepNumber}:`);
  const end = task.indexOf("\n- [ ] **Step ", start + 1);

  if (start === -1) {
    throw new Error(`Step ${stepNumber} is missing from the holdout fixture intake task.`);
  }

  return task.slice(start, end === -1 ? undefined : end);
}

describe("holdout harness hardening plan", () => {
  it("marks completed harness tasks and documents the whitespace-tolerant ledger parser", () => {
    const plan = readFileSync(
      path.join(
        process.cwd(),
        "docs/superpowers/plans/2026-07-27-holdout-harness-hardening-and-release.md",
      ),
      "utf8",
    );

    for (const taskNumber of [1, 2, 3]) {
      expect(taskSection(plan, taskNumber)).toContain("**Status: completed");
    }

    expect(taskSection(plan, 1)).toContain(
      "/^\\|\\s*Evaluation harness seal\\s*\\|\\s*`([0-9a-f]{40})`\\s*\\|$/mu",
    );
  });

  it("extracts the sealed harness from the formatted ledger with the documented intake command", () => {
    const root = process.cwd();
    const plan = readFileSync(
      path.join(root, "docs/superpowers/plans/2026-07-27-holdout-harness-hardening-and-release.md"),
      "utf8",
    );
    const ledger = readFileSync(path.join(root, "docs/qa/search-quality-methodology.md"), "utf8");
    const sedScript = taskSection(plan, 4).match(/^\s*sed -n '([^']+)'$/m)?.[1];

    expect(sedScript).toBeDefined();
    expect(
      execFileSync("sed", ["-n", sedScript!], {
        encoding: "utf8",
        input: ledger,
      }).trim(),
    ).toBe(HARNESS_SEAL);
  });

  it("binds the fixture to the supplied authoring base and fast-forwards integration", () => {
    const plan = readFileSync(
      path.join(
        process.cwd(),
        "docs/superpowers/plans/2026-07-27-holdout-harness-hardening-and-release.md",
      ),
      "utf8",
    );
    const task = taskSection(plan, 4);

    expect(task).toContain("exact 40-character authoring-base integration SHA");
    expect(task).toContain('fixture_parent="$(git rev-parse "$fixture_commit^")"');
    expect(task).toContain('test "$fixture_parent" = "$authoring_base"');
    expect(task).toContain('git rev-list --count "$authoring_base..$fixture_commit"');
    expect(task).toContain('test "$fixture_commit_count" = "1"');
    expect(stepSection(task, 2)).toContain('test -z "$(git status --short)"');
    expect(stepSection(task, 3)).not.toContain('test -z "$(git status --short)"');
    expect(stepSection(task, 3)).toContain(
      'test "$(git diff --cached --name-only)" = "tests/fixtures/search-holdout-v1.json"',
    );
    expect(task).toContain('git merge --ff-only "$fixture_commit"');
    expect(task).toContain('test "$(git rev-parse HEAD)" = "$fixture_commit"');
    expect(task).toContain("Do not use `--no-ff`, `cherry-pick`, `rebase`, `amend`, or `squash`");
  });
});
