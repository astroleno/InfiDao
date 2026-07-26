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

  it("keeps quality, no-cache tests, build, and smoke as required CI gates", () => {
    expect(workflow).toContain("npm run type-check");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm test -- --runInBand --no-cache");
    expect(workflow).toContain("npm run test:stability");
    expect(workflow).toContain("npm run test:search-quality");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run smoke:release");
  });
});
