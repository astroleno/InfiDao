import embeddingSpec from "@/lib/search/local-embedding-spec.json";

interface WeightedAnchor {
  label: string;
  terms: string[];
  patterns: string[];
  weight?: number;
}

interface AliasAnchor extends WeightedAnchor {
  expansion: string;
}

interface SourceAnchor {
  source: string;
  aliases: string[];
}

interface LocalEmbeddingSpec {
  model: string;
  ngramBuckets: number;
  chapterBuckets: number;
  phraseAnchors: WeightedAnchor[];
  aliasAnchors: AliasAnchor[];
  sourceAnchors: SourceAnchor[];
  idfTerms: Record<string, number>;
  stopTerms: string[];
}

export interface LocalEvidenceTerm {
  term: string;
  kind: "alias" | "phrase" | "source" | "idf";
  weight: number;
}

const spec = embeddingSpec as LocalEmbeddingSpec;
const phraseAnchors = spec.phraseAnchors.map((anchor) => ({
  ...anchor,
  expressions: anchor.patterns.map((pattern) => new RegExp(pattern, "gu")),
}));
const aliasAnchors = spec.aliasAnchors.map((anchor) => ({
  ...anchor,
  expressions: anchor.patterns.map((pattern) => new RegExp(pattern, "gu")),
}));
const sourceAnchors = spec.sourceAnchors;
const ngramOffset = phraseAnchors.length + aliasAnchors.length + sourceAnchors.length + spec.chapterBuckets;
const stopTerms = new Set(spec.stopTerms.map((term) => term.toLowerCase()));

export const LOCAL_EMBEDDING_MODEL = spec.model;
export const LOCAL_EMBEDDING_DIMENSION = ngramOffset + spec.ngramBuckets;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function countMatches(text: string, expression: RegExp): number {
  return [...text.matchAll(expression)].length;
}

function expressionMatches(text: string, expression: RegExp): boolean {
  expression.lastIndex = 0;
  return expression.test(text);
}

function hashToken(token: string): number {
  let hash = 2166136261;

  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function addWeightedFeature(vector: number[], index: number, value: number): void {
  vector[index] = (vector[index] ?? 0) + value;
}

function tokenizeMixedText(text: string): string[] {
  return Array.from(text.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
}

function buildHanNgrams(segment: string): string[] {
  const characters = [...segment];
  const terms: string[] = [];

  for (const length of [2, 3, 4]) {
    for (let index = 0; index <= characters.length - length; index += 1) {
      terms.push(characters.slice(index, index + length).join(""));
    }
  }

  return terms;
}

function buildNgramTerms(text: string): string[] {
  const terms: string[] = [];

  for (const token of tokenizeMixedText(text)) {
    const hanOnly = /^[\p{Script=Han}]+$/u.test(token);

    if (hanOnly) {
      if ([...token].length >= 2 && [...token].length <= 8) {
        terms.push(token);
      }

      terms.push(...buildHanNgrams(token));
      continue;
    }

    if (token.length >= 2) {
      terms.push(token);
    }
  }

  return unique(terms).filter((term) => term.length >= 2 && !stopTerms.has(term));
}

function buildChapterTerms(text: string): string[] {
  const chapterTerms = Array.from(
    text.matchAll(/(?:第[一二三四五六七八九十百0-9]+章|[一二三四五六七八九十百0-9]+章|学而|为政|里仁|梁惠王|公孙丑|滕文公|离娄|尽心|经一章|正文)/gu),
    (match) => match[0],
  );

  return unique(chapterTerms);
}

function getTermIdf(term: string): number {
  return spec.idfTerms[term] ?? 0;
}

function ngramWeight(term: string): number {
  const configuredIdf = getTermIdf(term);

  if (configuredIdf > 0) {
    return configuredIdf * 0.16;
  }

  const length = [...term].length;

  if (length >= 4) {
    return 0.12;
  }

  if (length === 3) {
    return 0.08;
  }

  return 0.04;
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.hypot(...values);

  if (magnitude === 0) {
    return values.map((_, index) => (index === ngramOffset ? 1 : 0));
  }

  return values.map((value) => Number((value / magnitude).toFixed(8)));
}

export function expandLocalQueryAliases(query: string): string {
  const normalizedQuery = normalizeText(query);

  return aliasAnchors.reduce((expanded, anchor) => {
    const matched = anchor.expressions.some((expression) => expressionMatches(normalizedQuery, expression));

    return matched ? `${expanded}${anchor.expansion}` : expanded;
  }, query);
}

export function matchLocalQueryAliasLabels(query: string): string[] {
  const normalizedQuery = normalizeText(query);

  return aliasAnchors
    .filter((anchor) => anchor.expressions.some((expression) => expressionMatches(normalizedQuery, expression)))
    .map((anchor) => anchor.label);
}

export function getLocalEmbeddingStopTerms(): ReadonlySet<string> {
  return stopTerms;
}

export function getLocalTermIdfWeight(term: string): number {
  return getTermIdf(term);
}

export function getLocalEmbeddingEvidenceTerms(): LocalEvidenceTerm[] {
  const terms: LocalEvidenceTerm[] = [];

  for (const anchor of aliasAnchors) {
    terms.push(...anchor.terms.map((term) => ({ term, kind: "alias" as const, weight: anchor.weight ?? 2 })));
  }

  for (const anchor of phraseAnchors) {
    terms.push(...anchor.terms.map((term) => ({ term, kind: "phrase" as const, weight: anchor.weight ?? 2 })));
  }

  for (const anchor of sourceAnchors) {
    terms.push(...anchor.aliases.map((term) => ({ term, kind: "source" as const, weight: 1.8 })));
  }

  terms.push(...Object.entries(spec.idfTerms).map(([term, weight]) => ({ term, kind: "idf" as const, weight })));

  const seen = new Set<string>();
  return terms
    .filter(({ term }) => [...term].length >= 2 && !stopTerms.has(normalizeText(term)))
    .filter(({ term }) => {
      const normalized = normalizeText(term);

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

export function getLocalSourceAliases(): string[] {
  return unique(sourceAnchors.flatMap((anchor) => anchor.aliases)).filter((term) => [...term].length >= 2);
}

export function buildLocalEmbedding(text: string, options: { expandAliases?: boolean } = {}): number[] {
  const rawText = options.expandAliases === false ? text : expandLocalQueryAliases(text);
  const normalized = normalizeText(rawText);
  const vector = Array.from({ length: LOCAL_EMBEDDING_DIMENSION }, () => 0);

  phraseAnchors.forEach((anchor, index) => {
    const matches = anchor.expressions.reduce((sum, expression) => sum + countMatches(normalized, expression), 0);

    if (matches > 0) {
      addWeightedFeature(vector, index, matches * (anchor.weight ?? 2));
    }
  });

  aliasAnchors.forEach((anchor, index) => {
    const anchorText = `${normalized} ${anchor.terms.join(" ")}`;
    const termMatches = anchor.terms.filter((term) => normalized.includes(normalizeText(term))).length;
    const patternMatches = anchor.expressions.reduce((sum, expression) => sum + countMatches(anchorText, expression), 0);
    const matches = termMatches + patternMatches;

    if (matches > 0) {
      addWeightedFeature(vector, phraseAnchors.length + index, matches * (anchor.weight ?? 2));
    }
  });

  sourceAnchors.forEach((anchor, index) => {
    const matches = anchor.aliases.filter((alias) => normalized.includes(normalizeText(alias))).length;

    if (matches > 0) {
      addWeightedFeature(vector, phraseAnchors.length + aliasAnchors.length + index, Math.min(2, matches) * 0.7);
    }
  });

  for (const chapterTerm of buildChapterTerms(normalized)) {
    const index = phraseAnchors.length + aliasAnchors.length + sourceAnchors.length + (hashToken(chapterTerm) % spec.chapterBuckets);
    addWeightedFeature(vector, index, 0.45);
  }

  for (const term of buildNgramTerms(normalized)) {
    const index = ngramOffset + (hashToken(term) % spec.ngramBuckets);
    addWeightedFeature(vector, index, ngramWeight(term));
  }

  return normalizeVector(vector);
}
