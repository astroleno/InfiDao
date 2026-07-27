import { readFileSync } from "node:fs";
import path from "node:path";

describe("search holdout runner boundary", () => {
  it("completes every non-consuming preflight before dynamically loading frozen search modules", () => {
    const runner = readFileSync(
      path.join(process.cwd(), "scripts/run-search-holdout.ts"),
      "utf8",
    );
    const firstSearchImport = runner.indexOf('await import("../src/lib/search/index-store")');

    expect(runner).not.toMatch(/^import .*src\/lib\/search/m);
    expect(runner).toContain('await import("../src/lib/search/index-store")');
    expect(runner).toContain('await import("../src/lib/search/diagnostics")');

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
      expect(runner.indexOf(boundary)).toBeLessThan(firstSearchImport);
    }

    for (const removedOption of ["--cases", "--json", "--markdown", "--harness-commit"]) {
      expect(runner).not.toContain(removedOption);
    }
  });
});
