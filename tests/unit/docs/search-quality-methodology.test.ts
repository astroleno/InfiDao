import { readFileSync } from "node:fs";
import path from "node:path";

describe("search quality methodology", () => {
  it("records immutable artifact identities and independent holdout rules", () => {
    const methodology = readFileSync(
      path.join(process.cwd(), "docs/qa/search-quality-methodology.md"),
      "utf8",
    );

    expect(methodology).toContain("Frozen search commit");
    expect(methodology).toContain("81c6365766a7cf8c578cef6b060c5e43345f0d35");
    expect(methodology).toContain("71fa97e7da563abc1d3365292132d36a75e6682b");
    expect(methodology).toContain("Graph artifact signature");
    expect(methodology).toContain("bf0ec2ae2353cadba91488eb6359a77c78acf3d0ca1122154871c930ee2098d0");
    expect(methodology).toContain(
      "f9f213d19019b75e36fcc653176ab297ebedbb3336eb198a2aab7f5ed22531b3",
    );
    expect(methodology).toContain(
      "e6518fa9a221473a72ba4fda17dc838ed98443190788778ef396c0b4199ad3ee",
    );
    expect(methodology).toContain("without inspecting the frozen system's Top 3");
    expect(methodology).toContain("npm run validate:search-holdout");
    expect(methodology).toContain("Awaiting an independent reviewer");
  });
});
