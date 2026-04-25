import type { PassageRecord } from "@/types";
import { loadCorpus } from "@/lib/data/corpus";
import { loadEmbeddingArtifact, loadEmbeddingsForCorpus } from "@/lib/data/embeddings";
import { LOCAL_EMBEDDING_DIMENSION, LOCAL_EMBEDDING_MODEL } from "@/lib/search/local-embedding";
import { RouteError } from "@/lib/utils/errors";

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

      if (artifact.model !== LOCAL_EMBEDDING_MODEL || artifact.dimension !== LOCAL_EMBEDDING_DIMENSION) {
        throw new RouteError(500, "EMBEDDING_MODEL_MISMATCH", "Embedding artifact does not match the runtime query encoder.", {
          artifactModel: artifact.model,
          artifactDimension: artifact.dimension,
          runtimeModel: LOCAL_EMBEDDING_MODEL,
          runtimeDimension: LOCAL_EMBEDDING_DIMENSION,
        });
      }

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
