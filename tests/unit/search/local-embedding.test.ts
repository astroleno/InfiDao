import embeddingSpec from "@/lib/search/local-embedding-spec.json";
import {
  buildLocalEmbedding,
  expandLocalQueryAliases,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
} from "@/lib/search/local-embedding";

describe("local embedding spec", () => {
  it("uses the shared spec model and dimension", () => {
    expect(LOCAL_EMBEDDING_MODEL).toBe(embeddingSpec.model);
    expect(LOCAL_EMBEDDING_DIMENSION).toBe(embeddingSpec.conceptPatterns.length + embeddingSpec.hashBuckets);
    expect(buildLocalEmbedding("治理国家")).toHaveLength(LOCAL_EMBEDDING_DIMENSION);
  });

  it("expands deterministic modern-language aliases", () => {
    expect(expandLocalQueryAliases("面对别人不理解")).toContain("人不知");
    expect(expandLocalQueryAliases("反省自己哪里做得不够")).toContain("三省");
    expect(expandLocalQueryAliases("学习之后要实践")).toContain("学而时习");
  });
});
