import type { PassageRecord } from "@/types";
import {
  expandLocalQueryAliases,
  getLocalEmbeddingEvidenceTerms,
  getLocalEmbeddingStopTerms,
  getLocalTermIdfWeight,
} from "@/lib/search/local-embedding";

export interface LexicalCandidate extends PassageRecord {
  lexicalScore: number;
  matchedTerms: string[];
  evidenceScore: number;
  hasDomainEvidence: boolean;
}

interface QueryTerm {
  term: string;
  kind: "alias" | "phrase" | "source" | "idf" | "ngram" | "token";
  weight: number;
  domainEvidence: boolean;
}

const stopTerms = getLocalEmbeddingStopTerms();
const localEvidenceTerms = getLocalEmbeddingEvidenceTerms();
const localEvidenceTermMap = new Map(localEvidenceTerms.map((term) => [normalize(term.term), term]));

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueByTerm(values: QueryTerm[]): QueryTerm[] {
  const terms = new Map<string, QueryTerm>();

  for (const value of values) {
    const normalized = normalize(value.term);
    const existing = terms.get(normalized);

    if (!existing || value.weight > existing.weight || value.domainEvidence) {
      terms.set(normalized, {
        ...value,
        term: normalized,
        domainEvidence: existing?.domainEvidence === true || value.domainEvidence,
      });
    }
  }

  return Array.from(terms.values());
}

function tokenize(text: string): string[] {
  return Array.from(text.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
}

function hanBigrams(text: string): string[] {
  return Array.from(text.matchAll(/\p{Script=Han}+/gu), (match) => match[0]).flatMap((segment) => {
    const characters = [...segment];

    return characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1]}`);
  });
}

function termLength(term: string): number {
  return [...term].length;
}

function isStopped(term: string): boolean {
  return stopTerms.has(normalize(term));
}

function lexicalWeight(term: string): number {
  const idfWeight = getLocalTermIdfWeight(term);

  if (idfWeight > 0) {
    return Math.min(1.4, idfWeight / 2.4);
  }

  const length = termLength(term);

  if (length >= 4) {
    return 0.95;
  }

  if (length === 3) {
    return 0.7;
  }

  return 0.35;
}

function buildQueryTerms(query: string): QueryTerm[] {
  const expanded = normalize(expandLocalQueryAliases(query));
  const terms: QueryTerm[] = [];

  for (const evidence of localEvidenceTerms) {
    const normalizedTerm = normalize(evidence.term);

    if (expanded.includes(normalizedTerm)) {
      terms.push({
        term: normalizedTerm,
        kind: evidence.kind,
        weight: Math.max(1, evidence.weight / 2),
        domainEvidence: true,
      });
    }
  }

  for (const token of tokenize(expanded)) {
    const normalizedToken = normalize(token);
    const evidence = localEvidenceTermMap.get(normalizedToken);

    if (termLength(normalizedToken) >= 2 && !isStopped(normalizedToken)) {
      terms.push({
        term: normalizedToken,
        kind: evidence?.kind ?? "token",
        weight: evidence ? Math.max(1, evidence.weight / 2) : lexicalWeight(normalizedToken),
        domainEvidence: evidence !== undefined,
      });
    }
  }

  for (const bigram of hanBigrams(expanded)) {
    const normalizedBigram = normalize(bigram);
    const evidence = localEvidenceTermMap.get(normalizedBigram);

    if (termLength(normalizedBigram) >= 2 && !isStopped(normalizedBigram)) {
      terms.push({
        term: normalizedBigram,
        kind: evidence?.kind ?? "ngram",
        weight: evidence ? Math.max(1, evidence.weight / 2) : lexicalWeight(normalizedBigram),
        domainEvidence: evidence !== undefined,
      });
    }
  }

  return uniqueByTerm(terms).filter((term) => !isStopped(term.term));
}

function scorePassage(passage: PassageRecord, terms: QueryTerm[]): LexicalCandidate | null {
  const haystack = normalize(`${passage.source} ${passage.workTitle} ${passage.chapter} ${passage.text}`);
  const matched = terms.filter(({ term }) => haystack.includes(term));

  if (matched.length === 0) {
    return null;
  }

  const sourceTerm = normalize(passage.source);
  const titleTerm = normalize(passage.workTitle);
  const chapterTerm = normalize(passage.chapter);
  const exactSourceBoost = terms.some(({ term }) => term === sourceTerm || term === titleTerm) ? 0.2 : 0;
  const exactChapterBoost = terms.some(({ term }) => term === chapterTerm) ? 0.12 : 0;
  const matchedWeight = matched.reduce((score, term) => score + term.weight, 0);
  const possibleWeight = terms.reduce((score, term) => score + term.weight, 0);
  const domainEvidenceWeight = matched
    .filter((term) => term.domainEvidence)
    .reduce((score, term) => score + term.weight, 0);
  const credibleMatchedWeight = matched
    .filter((term) => term.domainEvidence || termLength(term.term) >= 3)
    .reduce((score, term) => score + term.weight, 0);
  const hasDomainEvidence = domainEvidenceWeight >= 0.9 || exactSourceBoost > 0 || exactChapterBoost > 0;
  const coverageScore = matchedWeight / Math.max(1, possibleWeight);
  const credibleCoverageScore = credibleMatchedWeight / Math.max(1, possibleWeight);
  const bestTermScore = Math.max(...matched.map((term) => term.weight)) / 1.4;
  const evidenceDensityScore = domainEvidenceWeight / Math.max(1, matchedWeight);
  const densityBoost = Math.min(0.18, Math.max(0, matched.length - 1) * 0.045);
  const unsupportedBigramOnly = !hasDomainEvidence && matched.length === 1 && matched[0]?.kind === "ngram";
  const rawScore =
    bestTermScore * 0.32 +
    coverageScore * 0.28 +
    credibleCoverageScore * 0.2 +
    evidenceDensityScore * 0.12 +
    densityBoost +
    exactSourceBoost +
    exactChapterBoost;
  const lexicalScore = unsupportedBigramOnly ? Math.min(0.18, rawScore) : Math.min(1, rawScore);

  return {
    ...passage,
    lexicalScore: Number(lexicalScore.toFixed(4)),
    matchedTerms: matched.map((term) => term.term),
    evidenceScore: Number((domainEvidenceWeight + exactSourceBoost + exactChapterBoost).toFixed(4)),
    hasDomainEvidence,
  };
}

export function rankLexicalCandidates(corpus: PassageRecord[], query: string, limit: number): LexicalCandidate[] {
  const terms = buildQueryTerms(query);

  if (terms.length === 0) {
    return [];
  }

  return corpus
    .map((passage) => scorePassage(passage, terms))
    .filter((candidate): candidate is LexicalCandidate => candidate !== null)
    .sort(
      (left, right) =>
        right.lexicalScore - left.lexicalScore ||
        right.evidenceScore - left.evidenceScore ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}
