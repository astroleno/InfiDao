import path from "node:path";
import { diagnoseSearchPassages } from "@/lib/search/diagnostics";
import { searchPassages } from "@/lib/search/service";
import { clearSearchIndexCache } from "@/lib/search/index-store";
import { clearSearchGraphCache } from "@/lib/search/graph/store";

describe("search diagnostics", () => {
  afterEach(() => {
    clearSearchGraphCache();
    clearSearchIndexCache();
  });

  it("reports internal graph metadata without changing public search order", async () => {
    const request = {
      query: "学习之后要实践",
      topK: 5,
      threshold: 0.25,
    };
    const publicResults = await searchPassages(request);
    const diagnostics = await diagnoseSearchPassages(request);

    expect(diagnostics.results.map(result => result.id)).toEqual(
      publicResults.map(result => result.id),
    );
    expect(diagnostics.graph.enabled).toBe(true);
    expect(diagnostics.results[0]).toEqual(
      expect.objectContaining({
        id: publicResults[0]?.id,
        rank: 1,
        score: publicResults[0]?.score,
        vectorScore: expect.any(Number),
        lexicalScore: expect.any(Number),
      }),
    );
    expect(publicResults[0]).not.toHaveProperty("vectorScore");
    expect(publicResults[0]).not.toHaveProperty("graph");
  });

  it("surfaces direct concept groups and graph signals for fused candidates", async () => {
    const diagnostics = await diagnoseSearchPassages({
      query: "学习之后要实践",
      topK: 5,
      threshold: 0.25,
    });
    const learningCandidate = diagnostics.results.find(result => result.id === "lunyu-1-1");

    expect(learningCandidate).toBeDefined();
    expect(learningCandidate?.graph.conceptGroups).toContain("learning-and-practice");
    expect(
      learningCandidate?.graph.signals.some(
        signal =>
          signal.type === "concept" &&
          signal.label === "学与实践" &&
          signal.relation === "mentions" &&
          signal.confidence === "EXTRACTED",
      ),
    ).toBe(true);
    expect(diagnostics.diversity.uniqueConceptGroups).toContain("learning-and-practice");
  });

  it("fails open when diagnostics cannot load the graph sidecar", async () => {
    const diagnostics = await diagnoseSearchPassages({
      query: "学习之后要实践",
      topK: 5,
      threshold: 0.25,
      graphPath: path.join(process.cwd(), "tests", "fixtures", "missing-search-graph.json"),
    });

    expect(diagnostics.graph).toEqual({
      enabled: false,
      reason: "missing",
    });
    expect(diagnostics.results.length).toBeGreaterThan(0);
    expect(diagnostics.results.every(result => result.graph.neighborCount === 0)).toBe(true);
    expect(diagnostics.diversity.uniqueConceptGroups).toEqual([]);
  });
});
