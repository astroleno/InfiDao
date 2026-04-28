import type { AnnotationResult, AnnotationStyle } from "@/types";
import type { AnnotationLlmMode } from "@/lib/annotation/llm";

export const DEFAULT_ANNOTATION_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_ANNOTATION_CACHE_MAX_ENTRIES = 100;

interface AnnotationCacheKeyInput {
  query: string;
  passageId: string;
  passageText: string;
  style: AnnotationStyle;
  mode: AnnotationLlmMode;
}

interface AnnotationCacheEntry {
  result: AnnotationResult;
  expiresAt: number;
}

const annotationCache = new Map<string, AnnotationCacheEntry>();

function normalizeCacheText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function resolvePositiveIntegerEnv(key: string, fallback: number): number {
  const rawValue = process.env[key]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return Math.trunc(parsedValue);
}

function cloneAnnotationResult(result: AnnotationResult): AnnotationResult {
  return {
    ...result,
    links: result.links.map(link => ({ ...link })),
  };
}

export function resolveAnnotationCacheTtlMs(): number {
  return resolvePositiveIntegerEnv("ANNOTATION_CACHE_TTL_MS", DEFAULT_ANNOTATION_CACHE_TTL_MS);
}

export function resolveAnnotationCacheMaxEntries(): number {
  return resolvePositiveIntegerEnv(
    "ANNOTATION_CACHE_MAX_ENTRIES",
    DEFAULT_ANNOTATION_CACHE_MAX_ENTRIES,
  );
}

export function buildAnnotationCacheKey(input: AnnotationCacheKeyInput): string {
  return JSON.stringify({
    version: 1,
    mode: input.mode,
    style: input.style,
    passageId: normalizeCacheText(input.passageId),
    query: normalizeCacheText(input.query),
    passageText: normalizeCacheText(input.passageText),
  });
}

export function getCachedAnnotation(cacheKey: string, now = Date.now()): AnnotationResult | null {
  const entry = annotationCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    annotationCache.delete(cacheKey);
    return null;
  }

  annotationCache.delete(cacheKey);
  annotationCache.set(cacheKey, entry);

  return cloneAnnotationResult(entry.result);
}

export function setCachedAnnotation(
  cacheKey: string,
  result: AnnotationResult,
  now = Date.now(),
): void {
  const maxEntries = resolveAnnotationCacheMaxEntries();

  annotationCache.delete(cacheKey);

  while (annotationCache.size >= maxEntries) {
    const oldestKey = annotationCache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    annotationCache.delete(oldestKey);
  }

  annotationCache.set(cacheKey, {
    result: cloneAnnotationResult(result),
    expiresAt: now + resolveAnnotationCacheTtlMs(),
  });
}

export function resetAnnotationCache(): void {
  annotationCache.clear();
}

export function getAnnotationCacheSize(): number {
  return annotationCache.size;
}
