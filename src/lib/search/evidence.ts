import type { LexicalCandidate } from "@/lib/search/lexical";
import type { FusedSearchCandidate } from "@/lib/search/fusion";
import {
  expandLocalQueryAliases,
  getLocalEmbeddingEvidenceTerms,
  getLocalSourceAliases,
  matchLocalQueryAliasLabels,
} from "@/lib/search/local-embedding";

export interface SearchEvidenceSummary {
  aliasLabels: string[];
  sourceTerms: string[];
  coreTerms: string[];
  trustedMatchedTerms: string[];
  hasQueryEvidence: boolean;
  hasTrustedResultEvidence: boolean;
}

const evidenceTerms = getLocalEmbeddingEvidenceTerms().map(({ term }) => term.toLowerCase());
const sourceAliases = getLocalSourceAliases().map((term) => term.toLowerCase());

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function trustedMatchedTerms(lexicalResults: LexicalCandidate[]): string[] {
  return unique(
    lexicalResults.flatMap((candidate) => {
      if (candidate.hasDomainEvidence || candidate.evidenceScore >= 1) {
        return candidate.matchedTerms;
      }

      return candidate.matchedTerms.filter((term) => [...term].length >= 3);
    }),
  );
}

export function summarizeSearchEvidence(
  query: string,
  lexicalResults: LexicalCandidate[],
): SearchEvidenceSummary {
  const normalizedQuery = normalize(query);
  const expandedQuery = normalize(expandLocalQueryAliases(query));
  const aliasLabels = matchLocalQueryAliasLabels(query);
  const sourceTerms = sourceAliases.filter((term) => normalizedQuery.includes(term));
  const coreTerms = evidenceTerms.filter((term) => expandedQuery.includes(term));
  const matchedTerms = trustedMatchedTerms(lexicalResults);
  const hasQueryEvidence = aliasLabels.length > 0 || sourceTerms.length > 0 || coreTerms.length > 0;
  const hasTrustedResultEvidence = lexicalResults.some(
    (candidate) =>
      candidate.hasDomainEvidence ||
      candidate.evidenceScore >= 1 ||
      candidate.matchedTerms.filter((term) => [...term].length >= 3).length >= 2,
  );

  return {
    aliasLabels,
    sourceTerms,
    coreTerms,
    trustedMatchedTerms: matchedTerms,
    hasQueryEvidence,
    hasTrustedResultEvidence,
  };
}

function candidateHasEvidence(candidate: FusedSearchCandidate): boolean {
  return (
    candidate.lexicalScore > 0 ||
    candidate.hasDomainEvidence ||
    candidate.evidenceScore >= 1 ||
    candidate.matchedTerms.some((term) => [...term].length >= 3)
  );
}

export function applySearchEvidenceGuard(
  query: string,
  lexicalResults: LexicalCandidate[],
  candidates: FusedSearchCandidate[],
): FusedSearchCandidate[] {
  const evidence = summarizeSearchEvidence(query, lexicalResults);

  if (!evidence.hasQueryEvidence && !evidence.hasTrustedResultEvidence) {
    return [];
  }

  return candidates.filter(candidateHasEvidence);
}
