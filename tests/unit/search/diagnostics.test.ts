import path from "node:path";
import goldenQueries from "../../fixtures/search-golden-queries.json";
import oodQueries from "../../fixtures/search-ood-queries.json";
import { diagnoseSearchPassages } from "@/lib/search/diagnostics";
import { searchPassages } from "@/lib/search/service";
import { clearSearchIndexCache } from "@/lib/search/index-store";
import { clearSearchGraphCache } from "@/lib/search/graph/store";

jest.setTimeout(15_000);

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

  it("records lane-level top results while keeping OOD queries empty after full guards", async () => {
    const goldenReport = await Promise.all(
      goldenQueries.slice(0, 3).map(async ({ query }) => {
        const diagnostics = await diagnoseSearchPassages({
          query,
          topK: 5,
          threshold: 0.25,
        });

        return {
          query,
          lanes: diagnostics.lanes,
        };
      }),
    );
    const oodReport = await Promise.all(
      oodQueries.map(async (query) => {
        const diagnostics = await diagnoseSearchPassages({
          query,
          topK: 5,
          threshold: 0.25,
        });

        return diagnostics.lanes;
      }),
    );
    const oodReturnCounts = oodReport.reduce(
      (counts, lanes) => ({
        full: counts.full + lanes.full.resultCount,
        vector: counts.vector + lanes.vector.resultCount,
        lexical: counts.lexical + lanes.lexical.resultCount,
        fusion: counts.fusion + lanes.fusion.resultCount,
      }),
      {
        full: 0,
        vector: 0,
        lexical: 0,
        fusion: 0,
      },
    );

    expect(goldenReport[0]?.lanes.full.top1Id).toBe("rysxguji-mengzi-2-12");
    expect(goldenReport.every(({ lanes }) => lanes.full.top3Ids.length > 0)).toBe(true);
    expect(goldenReport.every(({ lanes }) => lanes.vector.top3Ids.length > 0)).toBe(true);
    expect(goldenReport.every(({ lanes }) => lanes.lexical.top3Ids.length > 0)).toBe(true);
    expect(goldenReport.every(({ lanes }) => lanes.fusion.top3Ids.length > 0)).toBe(true);
    expect(oodReturnCounts.full).toBe(0);
    expect(oodReturnCounts.fusion).toBe(0);
    expect(oodReturnCounts.vector).toBeGreaterThan(0);
  });
});
