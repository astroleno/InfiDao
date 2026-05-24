import type { SearchResult } from "@/types";
import type { LexicalCandidate } from "@/lib/search/lexical";

export interface FusedSearchCandidate extends SearchResult {
  vectorScore: number;
  lexicalScore: number;
  evidenceScore: number;
  hasDomainEvidence: boolean;
  matchedTerms: string[];
}

function fusedScore(candidate: FusedSearchCandidate): number {
  const hasLexicalSupport = candidate.lexicalScore > 0;
  const hasEvidenceSupport = candidate.hasDomainEvidence || candidate.evidenceScore >= 1;
  const vectorOnlyScore = candidate.vectorScore * (hasEvidenceSupport ? 0.28 : 0.18);
  const lexicalOnlyScore = candidate.lexicalScore * (hasEvidenceSupport ? 0.9 : 0.5);
  const blendedScore = hasLexicalSupport
    ? candidate.lexicalScore * 0.82 + candidate.vectorScore * 0.06 + (hasEvidenceSupport ? 0.04 : 0)
    : vectorOnlyScore;
  const unsupportedCap = hasLexicalSupport || hasEvidenceSupport ? 1 : 0.24;

  return Number(Math.min(unsupportedCap, Math.max(vectorOnlyScore, lexicalOnlyScore, blendedScore)).toFixed(4));
}

export function fuseSearchCandidates(
  vectorResults: SearchResult[],
  lexicalResults: LexicalCandidate[],
  topK: number,
  threshold: number,
): FusedSearchCandidate[] {
  const merged = new Map<string, FusedSearchCandidate>();

  for (const result of vectorResults) {
    merged.set(result.id, {
      ...result,
      vectorScore: result.score,
      lexicalScore: 0,
      evidenceScore: 0,
      hasDomainEvidence: false,
      matchedTerms: [],
    });
  }

  for (const result of lexicalResults) {
    const existing = merged.get(result.id);

    if (existing) {
      existing.lexicalScore = Math.max(existing.lexicalScore, result.lexicalScore);
      existing.evidenceScore = Math.max(existing.evidenceScore, result.evidenceScore);
      existing.hasDomainEvidence = existing.hasDomainEvidence || result.hasDomainEvidence;
      existing.matchedTerms = Array.from(new Set([...existing.matchedTerms, ...result.matchedTerms]));
      continue;
    }

    merged.set(result.id, {
      id: result.id,
      source: result.source,
      chapter: result.chapter,
      section: result.section,
      text: result.text,
      score: 0,
      vectorScore: 0,
      lexicalScore: result.lexicalScore,
      evidenceScore: result.evidenceScore,
      hasDomainEvidence: result.hasDomainEvidence,
      matchedTerms: result.matchedTerms,
    });
  }

  return Array.from(merged.values())
    .map(candidate => ({
      ...candidate,
      score: fusedScore(candidate),
    }))
    .filter(result => result.score >= threshold)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.lexicalScore - left.lexicalScore ||
        right.evidenceScore - left.evidenceScore ||
        right.vectorScore - left.vectorScore ||
        left.id.localeCompare(right.id),
    )
    .slice(0, topK);
}

export function fuseSearchResults(
  vectorResults: SearchResult[],
  lexicalResults: LexicalCandidate[],
  topK: number,
  threshold: number,
): SearchResult[] {
  return fuseSearchCandidates(vectorResults, lexicalResults, topK, threshold).map(
    ({
      vectorScore: _vectorScore,
      lexicalScore: _lexicalScore,
      evidenceScore: _evidenceScore,
      hasDomainEvidence: _hasDomainEvidence,
      matchedTerms: _matchedTerms,
      ...result
    }) => result,
  );
}
