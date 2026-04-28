import embeddingSpec from "@/lib/search/local-embedding-spec.json";

interface LocalEmbeddingSpec {
  model: string;
  hashBuckets: number;
  conceptPatterns: string[];
  queryAliases: Array<{
    pattern: string;
    replacement: string;
  }>;
}

const spec = embeddingSpec as LocalEmbeddingSpec;
const conceptPatterns = spec.conceptPatterns.map((pattern) => new RegExp(pattern, "gu"));
const queryAliases = spec.queryAliases.map(({ pattern, replacement }) => ({
  pattern: new RegExp(pattern, "gu"),
  replacement,
}));

export const LOCAL_EMBEDDING_MODEL = spec.model;
export const LOCAL_EMBEDDING_DIMENSION = conceptPatterns.length + spec.hashBuckets;

export function expandLocalQueryAliases(query: string): string {
  return queryAliases.reduce((expanded, { pattern, replacement }) => {
    return expanded.replace(pattern, (match) => `${match}${replacement}`);
  }, query);
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function hashToken(token: string): number {
  let hash = 2166136261;

  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return Array.from(text.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.hypot(...values);

  if (magnitude === 0) {
    return values.map((_, index) => (index === conceptPatterns.length ? 1 : 0));
  }

  return values.map((value) => value / magnitude);
}

export function buildLocalEmbedding(text: string, options: { expandAliases?: boolean } = {}): number[] {
  const rawText = options.expandAliases === false ? text : expandLocalQueryAliases(text);
  const normalized = rawText.trim().toLowerCase();
  const vector = Array.from({ length: LOCAL_EMBEDDING_DIMENSION }, () => 0);

  conceptPatterns.forEach((pattern, index) => {
    vector[index] = countMatches(normalized, pattern) * 2;
  });

  for (const token of tokenize(normalized)) {
    const tokenIndex = conceptPatterns.length + (hashToken(token) % spec.hashBuckets);
    vector[tokenIndex] = (vector[tokenIndex] ?? 0) + 0.08;

    for (const character of token) {
      const characterIndex = conceptPatterns.length + (hashToken(character) % spec.hashBuckets);
      vector[characterIndex] = (vector[characterIndex] ?? 0) + 0.02;
    }
  }

  return normalizeVector(vector);
}
