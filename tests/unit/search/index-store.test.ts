import { clearSearchIndexCache, loadSearchIndex } from "@/lib/search/index-store";

describe("search index store", () => {
  afterEach(() => {
    clearSearchIndexCache();
  });

  it("loads corpus and embeddings into a reusable search index", async () => {
    const first = await loadSearchIndex();
    const second = await loadSearchIndex();

    expect(first).toBe(second);
    expect(first.corpus.length).toBeGreaterThan(0);
    expect(first.embeddingMap.size).toBe(first.corpus.length);
    expect(first.dimension).toBe(21);
    expect(first.model).toBe("infidao-local-concept-v1");
  });
});
