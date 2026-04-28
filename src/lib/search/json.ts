import type { PassageRecord, SearchResult } from "@/types";
import { buildLocalEmbedding } from "@/lib/search/local-embedding";
import { RouteError } from "@/lib/utils/errors";

export function buildQueryEmbedding(query: string): number[] {
  return buildLocalEmbedding(query);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new RouteError(500, "EMBEDDING_DIMENSION_MISMATCH", "Embedding dimensions do not match.");
  }

  const leftMagnitude = Math.hypot(...left);
  const rightMagnitude = Math.hypot(...right);

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  let dotProduct = 0;
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return dotProduct / (leftMagnitude * rightMagnitude);
}

interface RankPassagesByVectorOptions {
  corpus: PassageRecord[];
  embeddingMap: Map<string, number[]>;
  queryVector: number[];
  topK: number;
  threshold: number;
}

export function rankPassagesByVector({
  corpus,
  embeddingMap,
  queryVector,
  topK,
  threshold,
}: RankPassagesByVectorOptions): SearchResult[] {
  if (corpus.length === 0) {
    return [];
  }

  return corpus
    .map((passage) => {
      const passageVector = embeddingMap.get(passage.id);

      if (!passageVector) {
        throw new RouteError(500, "EMBEDDING_NOT_FOUND", "Embedding data is missing for a passage.", {
          passageId: passage.id,
        });
      }

      return {
        id: passage.id,
        source: passage.source,
        chapter: passage.chapter,
        section: passage.section,
        text: passage.text,
        score: Number(cosineSimilarity(queryVector, passageVector).toFixed(4)),
      };
    })
    .filter((passage) => passage.score >= threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

interface RankPassagesOptions {
  corpus: PassageRecord[];
  embeddingMap: Map<string, number[]>;
  query: string;
  topK: number;
  threshold: number;
}

export function rankPassages({
  corpus,
  embeddingMap,
  query,
  topK,
  threshold,
}: RankPassagesOptions): SearchResult[] {
  return rankPassagesByVector({
    corpus,
    embeddingMap,
    queryVector: buildQueryEmbedding(query),
    topK,
    threshold,
  });
}
