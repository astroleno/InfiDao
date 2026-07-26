import { readFileSync } from "node:fs";
import path from "node:path";

describe("quality convergence baseline", () => {
  it("records the integrated preflight without treating it as final signoff", () => {
    const baseline = readFileSync(
      path.join(process.cwd(), "docs/qa/2026-07-26-quality-convergence-baseline.md"),
      "utf8",
    );

    expect(baseline).toContain("f261607bf83560e746507e38d7dd93dffc5b8edb");
    expect(baseline).toContain("Integration preflight");
    expect(baseline).toContain("not Task 7");
    expect(baseline).toContain("tracked upstream content");
  });
});
