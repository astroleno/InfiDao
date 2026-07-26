import { readFileSync } from "node:fs";
import path from "node:path";

describe("reboot MVP CI release contract", () => {
  const workflow = readFileSync(
    path.join(process.cwd(), ".github", "workflows", "reboot-mvp-ci.yml"),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it("regenerates and verifies release artifacts before static gates", () => {
    expect(packageJson.scripts["generate:release-artifacts"]).toBe(
      "npm run generate-search-artifacts && npm run generate-search-graph",
    );
    expect(workflow).toContain("npm run generate:release-artifacts");
    expect(workflow).toContain(
      "git diff --exit-code -- data/embeddings.json data/search-graph.json",
    );
  });

  it("keeps release gates in their required order", () => {
    const orderedGates = [
      "npm ci",
      "npm run generate:release-artifacts",
      "git diff --exit-code -- data/embeddings.json data/search-graph.json",
      "npm run type-check",
      "npm run lint",
      "npm test -- --runInBand --no-cache",
      "npm run test:stability",
      "npm run test:search-quality",
      "npm run build",
      "Prepare standalone runtime files",
      "npm run smoke:release",
    ];

    let previousIndex = -1;
    for (const gate of orderedGates) {
      const currentIndex = workflow.indexOf(gate);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }
  });
});
