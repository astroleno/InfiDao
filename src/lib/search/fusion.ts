import type { SearchResult } from "@/types";
import type { LexicalCandidate } from "@/lib/search/lexical";

export function fuseSearchResults(
  vectorResults: SearchResult[],
  lexicalResults: LexicalCandidate[],
  topK: number,
  threshold: number,
): SearchResult[] {
  const merged = new Map<string, SearchResult & { vectorScore?: number; lexicalScore?: number }>();

  for (const result of vectorResults) {
    merged.set(result.id, {
      ...result,
      vectorScore: result.score,
      lexicalScore: 0,
    });
  }

  for (const result of lexicalResults) {
    const existing = merged.get(result.id);

    if (existing) {
      existing.lexicalScore = Math.max(existing.lexicalScore ?? 0, result.lexicalScore);
      existing.score = Number(Math.min(1, existing.score + result.lexicalScore * 0.18).toFixed(4));
      continue;
    }

    merged.set(result.id, {
      id: result.id,
      source: result.source,
      chapter: result.chapter,
      section: result.section,
      text: result.text,
      score: Number((result.lexicalScore * 0.72).toFixed(4)),
      vectorScore: 0,
      lexicalScore: result.lexicalScore,
    });
  }

  return Array.from(merged.values())
    .filter((result) => result.score >= threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ vectorScore: _vectorScore, lexicalScore: _lexicalScore, ...result }) => result);
}
