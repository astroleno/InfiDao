import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("frozen holdout v1 committed evidence", () => {
  it("keeps fixture, JSON, and Markdown identities aligned without invoking search", () => {
    const root = process.cwd();
    const fixture = readFileSync(
      path.join(root, "tests/fixtures/search-holdout-v1.json"),
      "utf8",
    );
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
    const report = readFileSync(
      path.join(root, "docs/qa/search-holdout-v1-report.md"),
      "utf8",
    );

    expect(createHash("sha256").update(fixture).digest("hex")).toBe(
      results.metadata.fixtureSha256,
    );
    expect(results.decision).toBe("blocked");
    expect(results.categories.inDomain).toEqual({ passed: 0, total: 24, required: 19 });
    expect(results.categories.ood).toEqual({ passed: 6, total: 6, required: 6 });
    expect(report).toContain(`Decision: **${results.decision}**`);
    expect(report).toContain(results.metadata.fixtureCommit);
    expect(report).toContain(results.metadata.evaluationHarnessCommit);
    expect(report).toContain(results.metadata.evaluatedCommit);
    expect(report).toContain(results.metadata.independenceAttestation);
  });
});
