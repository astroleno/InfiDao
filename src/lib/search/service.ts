import { DEFAULT_SEARCH_THRESHOLD, DEFAULT_SEARCH_TOP_K, type SearchRequest, type SearchResult } from "@/types";
import { fuseSearchResults } from "@/lib/search/fusion";
import { encodeSearchQuery } from "@/lib/search/query-encoder";
import { rankLexicalCandidates } from "@/lib/search/lexical";
import { rankPassagesByVector } from "@/lib/search/json";
import { loadSearchIndex } from "@/lib/search/index-store";

export async function searchPassages({
  query,
  topK = DEFAULT_SEARCH_TOP_K,
  threshold = DEFAULT_SEARCH_THRESHOLD,
}: SearchRequest): Promise<SearchResult[]> {
  const index = await loadSearchIndex();
  const candidateLimit = Math.max(topK * 4, 20);
  const queryVector = await encodeSearchQuery({
    query,
    model: index.model,
    dimension: index.dimension,
  });

  const vectorResults = rankPassagesByVector({
    corpus: index.corpus,
    embeddingMap: index.embeddingMap,
    queryVector,
    topK: candidateLimit,
    threshold: Math.max(0, threshold * 0.7),
  });
  const lexicalResults = rankLexicalCandidates(index.corpus, query, candidateLimit);

  return fuseSearchResults(vectorResults, lexicalResults, topK, threshold);
}
