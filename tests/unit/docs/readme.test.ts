import { readFileSync } from "node:fs";
import path from "node:path";

describe("README release path", () => {
  it("documents the active local-artifact architecture and gates", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

    expect(readme).toContain("Next.js 15");
    expect(readme).toContain("quality/release convergence");
    expect(readme).toContain("npm run generate:release-artifacts");
    expect(readme).toContain("npm run test:stability");
    expect(readme).toContain("npm run test:search-quality");
    expect(readme).toContain("npx playwright install chromium");
    expect(readme).toContain("npm run test:e2e");
    expect(readme).toContain("production standalone server");
    expect(readme).toContain("cp -R data/. .next/standalone/data/");
    expect(readme).toContain("does not contact Daizhige at request time");
    expect(readme).not.toContain("npm run download-model");
    expect(readme).not.toContain("npm run init-db");
  });
});
