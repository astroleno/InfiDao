import { loadSearchConceptSeed, validateSearchConceptSeed } from "@/lib/search/concepts/load";

describe("search concept seed", () => {
  it("loads the product concept seed", async () => {
    const seed = await loadSearchConceptSeed();

    expect(seed.conceptSeedVersion).toBe("search-concepts-v1");
    expect(seed.concepts.length).toBeGreaterThan(0);
    expect(seed.concepts.every(concept => concept.mentionPatterns.length > 0)).toBe(true);
  });

  it("rejects duplicate concept ids", () => {
    expect(() =>
      validateSearchConceptSeed({
        schemaVersion: 1,
        conceptSeedVersion: "test",
        concepts: [
          {
            id: "learning",
            label: "Learning",
            conceptGroup: "learning",
            keywords: ["learning"],
            mentionPatterns: ["learning"],
          },
          {
            id: "learning",
            label: "Learning again",
            conceptGroup: "learning",
            keywords: ["learning"],
            mentionPatterns: ["practice"],
          },
        ],
      }),
    ).toThrow("expected schema");
  });

  it("rejects naked single-character mention patterns", () => {
    expect(() =>
      validateSearchConceptSeed({
        schemaVersion: 1,
        conceptSeedVersion: "test",
        concepts: [
          {
            id: "learning",
            label: "Learning",
            conceptGroup: "learning",
            keywords: ["学"],
            mentionPatterns: ["学"],
          },
        ],
      }),
    ).toThrow("expected schema");
  });

  it("rejects naked single-character alternation branches", () => {
    expect(() =>
      validateSearchConceptSeed({
        schemaVersion: 1,
        conceptSeedVersion: "test",
        concepts: [
          {
            id: "learning",
            label: "Learning",
            conceptGroup: "learning",
            keywords: ["学"],
            mentionPatterns: ["学|习"],
          },
        ],
      }),
    ).toThrow("expected schema");
  });

  it("rejects invalid regular expressions", () => {
    expect(() =>
      validateSearchConceptSeed({
        schemaVersion: 1,
        conceptSeedVersion: "test",
        concepts: [
          {
            id: "learning",
            label: "Learning",
            conceptGroup: "learning",
            keywords: ["learning"],
            mentionPatterns: ["[broken"],
          },
        ],
      }),
    ).toThrow("expected schema");
  });
});
