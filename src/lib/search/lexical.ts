import type { PassageRecord } from "@/types";
import { expandLocalQueryAliases } from "@/lib/search/local-embedding";

export interface LexicalCandidate extends PassageRecord {
  lexicalScore: number;
  matchedTerms: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function buildQueryTerms(query: string): string[] {
  const normalized = normalize(expandLocalQueryAliases(query));
  const tokenTerms = Array.from(normalized.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
  const hanCharacters = Array.from(normalized.matchAll(/\p{Script=Han}/gu), (match) => match[0]);
  const bigrams = hanCharacters.slice(0, -1).map((character, index) => `${character}${hanCharacters[index + 1]}`);

  return unique([...tokenTerms, ...bigrams]).filter((term) => term.length >= 2);
}

function scorePassage(passage: PassageRecord, terms: string[]): LexicalCandidate | null {
  const haystack = normalize(`${passage.source} ${passage.workTitle} ${passage.chapter} ${passage.text}`);
  const matchedTerms = terms.filter((term) => haystack.includes(term));

  if (matchedTerms.length === 0) {
    return null;
  }

  const exactSourceBoost = terms.includes(normalize(passage.source)) || terms.includes(normalize(passage.workTitle)) ? 0.35 : 0;
  const exactChapterBoost = terms.includes(normalize(passage.chapter)) ? 0.2 : 0;
  const overlapScore = matchedTerms.reduce((score, term) => score + Math.min(term.length / 4, 1), 0) / terms.length;
  const lexicalScore = Math.min(1, overlapScore + exactSourceBoost + exactChapterBoost);

  return {
    ...passage,
    lexicalScore: Number(lexicalScore.toFixed(4)),
    matchedTerms,
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
    .sort((left, right) => right.lexicalScore - left.lexicalScore)
    .slice(0, limit);
}
