import type { SearchResult } from "@/types";
import type { LexicalCandidate } from "@/lib/search/lexical";
import { fuseSearchCandidates, fuseSearchResults } from "@/lib/search/fusion";

const publicBase = {
  source: "论语",
  chapter: "学而篇",
  section: 1,
  text: "学而时习之，不亦说乎？",
};

const passageBase = {
  ...publicBase,
  collection: "six_classics",
  workId: "lunyu",
  workTitle: "论语",
  textHash: "0".repeat(64),
  corpusVersion: "sixclassics-sample-v1",
};

describe("fuseSearchResults", () => {
  it("merges duplicate vector and lexical candidates", () => {
    const vectorResults: SearchResult[] = [
      {
        ...publicBase,
        id: "lunyu-1-1",
        score: 0.72,
      },
    ];
    const lexicalResults: LexicalCandidate[] = [
      {
        ...passageBase,
        id: "lunyu-1-1",
        lexicalScore: 0.8,
        matchedTerms: ["学"],
      },
    ];

    const fused = fuseSearchResults(vectorResults, lexicalResults, 5, 0.3);

    expect(fused).toHaveLength(1);
    expect(fused[0]?.id).toBe("lunyu-1-1");
    expect(fused[0]?.score).toBeGreaterThan(0.72);
  });

  it("keeps lexical-only candidates when they pass the fused threshold", () => {
    const fused = fuseSearchResults(
      [],
      [
        {
          ...passageBase,
          id: "lunyu-1-1",
          lexicalScore: 0.9,
          matchedTerms: ["论语"],
        },
      ],
      5,
      0.3,
    );

    expect(fused.map(result => result.id)).toEqual(["lunyu-1-1"]);
  });

  it("can expose component scores for internal diagnostics without changing public results", () => {
    const vectorResults: SearchResult[] = [
      {
        ...publicBase,
        id: "lunyu-1-1",
        score: 0.72,
      },
    ];
    const lexicalResults: LexicalCandidate[] = [
      {
        ...passageBase,
        id: "lunyu-1-1",
        lexicalScore: 0.8,
        matchedTerms: ["学"],
      },
    ];

    const diagnosticCandidates = fuseSearchCandidates(vectorResults, lexicalResults, 5, 0.3);
    const publicResults = fuseSearchResults(vectorResults, lexicalResults, 5, 0.3);

    expect(diagnosticCandidates[0]).toMatchObject({
      id: "lunyu-1-1",
      vectorScore: 0.72,
      lexicalScore: 0.8,
    });
    expect(publicResults[0]).not.toHaveProperty("vectorScore");
    expect(publicResults[0]).not.toHaveProperty("lexicalScore");
  });
});
