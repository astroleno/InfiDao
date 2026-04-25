import goldenQueries from "../../fixtures/search-golden-queries.json";
import { searchPassages } from "@/lib/search/service";

describe("golden search queries", () => {
  it.each(goldenQueries)(
    "meets ranking and false-positive gates for $query",
    async ({ query, expectedTop1Ids, requiredTop3Ids, bannedTop3Ids, minResults }) => {
      const results = await searchPassages({
        query,
        topK: 5,
        threshold: 0.25,
      });

      const resultIds = results.map((result) => result.id);
      const top3Ids = resultIds.slice(0, 3);

      expect(results.length).toBeGreaterThanOrEqual(minResults);
      expect(expectedTop1Ids).toContain(resultIds[0]);

      for (const requiredId of requiredTop3Ids) {
        expect(top3Ids).toContain(requiredId);
      }

      for (const bannedId of bannedTop3Ids) {
        expect(top3Ids).not.toContain(bannedId);
      }
    },
  );
});
