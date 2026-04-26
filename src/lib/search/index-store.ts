import type { PassageRecord } from "@/types";
import { loadCorpus } from "@/lib/data/corpus";
import { loadEmbeddingArtifact, loadEmbeddingsForCorpus } from "@/lib/data/embeddings";
import { assertSearchQueryEncoderCompatible } from "@/lib/search/query-encoder";

export interface SearchIndex {
  corpus: PassageRecord[];
  embeddingMap: Map<string, number[]>;
  model: string;
  dimension: number;
  corpusVersion: string;
}

let searchIndexPromise: Promise<SearchIndex> | null = null;

export async function loadSearchIndex(): Promise<SearchIndex> {
  if (!searchIndexPromise) {
    searchIndexPromise = (async () => {
      const corpus = await loadCorpus();
      const artifact = await loadEmbeddingArtifact();
      assertSearchQueryEncoderCompatible(artifact.model, artifact.dimension);

      const embeddingMap = await loadEmbeddingsForCorpus(corpus);

      return {
        corpus,
        embeddingMap,
        model: artifact.model,
        dimension: artifact.dimension,
        corpusVersion: artifact.corpusVersion,
      };
    })().catch((error) => {
      searchIndexPromise = null;
      throw error;
    });
  }

  return searchIndexPromise;
}

export function clearSearchIndexCache(): void {
  searchIndexPromise = null;
}
