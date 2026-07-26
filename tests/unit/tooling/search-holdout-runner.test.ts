import { readFileSync } from "node:fs";
import path from "node:path";

describe("search holdout runner boundary", () => {
  it("validates the fixture before dynamically loading frozen search modules", () => {
    const runner = readFileSync(
      path.join(process.cwd(), "scripts/run-search-holdout.ts"),
      "utf8",
    );

    expect(runner).not.toMatch(/^import .*src\/lib\/search/m);
    expect(runner).toContain('await import("../src/lib/search/index-store")');
    expect(runner).toContain('await import("../src/lib/search/diagnostics")');
    expect(runner.indexOf("validateSearchHoldoutFixtureFile(options.casesPath)")).toBeLessThan(
      runner.indexOf('await import("../src/lib/search/index-store")'),
    );
  });
});
