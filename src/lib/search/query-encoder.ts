import { RouteError } from "@/lib/utils/errors";
import {
  buildLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
} from "@/lib/search/local-embedding";

interface QueryEncoderOptions {
  query: string;
  model: string;
  dimension: number;
}

interface RemoteSearchEmbeddingConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_SEARCH_EMBEDDING_TIMEOUT_MS = 5_000;
const MAX_SEARCH_EMBEDDING_TIMEOUT_MS = 60_000;

function firstNonEmptyValue(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//u.test(value);
}

function resolveRemoteEmbeddingEndpoint(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/$/u, "");

  if (/\/embeddings$/u.test(trimmed)) {
    return trimmed;
  }

  if (/\/chat\/completions$/u.test(trimmed)) {
    return trimmed.replace(/\/chat\/completions$/u, "/embeddings");
  }

  return `${trimmed}/embeddings`;
}

export function resolveRemoteSearchEmbeddingConfig(): RemoteSearchEmbeddingConfig | null {
  const rawBaseUrl =
    process.env.SEARCH_EMBEDDING_BASE_URL?.trim() ||
    process.env.EMBEDDING_BASE_URL?.trim() ||
    process.env.BGE_MODEL_PATH?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "";
  const apiKey =
    process.env.SEARCH_EMBEDDING_API_KEY?.trim() ||
    process.env.EMBEDDING_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  const model =
    process.env.SEARCH_EMBEDDING_MODEL?.trim() ||
    process.env.EMBEDDING_MODEL?.trim() ||
    process.env.BGE_MODEL_REPO?.trim() ||
    "";

  if (!rawBaseUrl || !apiKey || !model || !isRemoteUrl(rawBaseUrl)) {
    return null;
  }

  return {
    endpoint: resolveRemoteEmbeddingEndpoint(rawBaseUrl),
    apiKey,
    model,
  };
}

export function resolveSearchEmbeddingTimeoutMs(): number {
  const rawTimeout = firstNonEmptyValue([
    "SEARCH_EMBEDDING_TIMEOUT_MS",
    "EMBEDDING_TIMEOUT_MS",
    "EMBED_TIMEOUT",
    "SEARCH_TIMEOUT",
    "TIMEOUT_MS",
  ]);

  if (!rawTimeout) {
    return DEFAULT_SEARCH_EMBEDDING_TIMEOUT_MS;
  }

  const parsedTimeout = Number(rawTimeout);

  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    return DEFAULT_SEARCH_EMBEDDING_TIMEOUT_MS;
  }

  return Math.min(Math.trunc(parsedTimeout), MAX_SEARCH_EMBEDDING_TIMEOUT_MS);
}

export function assertSearchQueryEncoderCompatible(
  model: string,
  dimension: number,
): void {
  if (
    model === LOCAL_EMBEDDING_MODEL &&
    dimension === LOCAL_EMBEDDING_DIMENSION
  ) {
    return;
  }

  const remoteConfig = resolveRemoteSearchEmbeddingConfig();

  if (!remoteConfig) {
    throw new RouteError(
      500,
      "EMBEDDING_RUNTIME_UNCONFIGURED",
      "Embedding artifact requires a remote query encoder, but no remote embedding config is set.",
      {
        artifactModel: model,
        artifactDimension: dimension,
      },
    );
  }

  if (remoteConfig.model !== model) {
    throw new RouteError(
      500,
      "EMBEDDING_MODEL_MISMATCH",
      "Embedding artifact model does not match the configured remote query encoder.",
      {
        artifactModel: model,
        artifactDimension: dimension,
        runtimeModel: remoteConfig.model,
      },
    );
  }
}

function isNumericVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export async function encodeSearchQuery({
  query,
  model,
  dimension,
}: QueryEncoderOptions): Promise<number[]> {
  if (
    model === LOCAL_EMBEDDING_MODEL &&
    dimension === LOCAL_EMBEDDING_DIMENSION
  ) {
    return buildLocalEmbedding(query);
  }

  const remoteConfig = resolveRemoteSearchEmbeddingConfig();

  if (!remoteConfig) {
    throw new RouteError(
      500,
      "EMBEDDING_RUNTIME_UNCONFIGURED",
      "Remote embedding config is required to encode search queries for this artifact.",
      {
        artifactModel: model,
        artifactDimension: dimension,
      },
    );
  }

  if (remoteConfig.model !== model) {
    throw new RouteError(
      500,
      "EMBEDDING_MODEL_MISMATCH",
      "Configured remote embedding model does not match the loaded artifact.",
      {
        artifactModel: model,
        artifactDimension: dimension,
        runtimeModel: remoteConfig.model,
      },
    );
  }

  const timeoutMs = resolveSearchEmbeddingTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let raw: string;

  try {
    response = await fetch(remoteConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${remoteConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: remoteConfig.model,
        input: query,
      }),
    });
    raw = await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RouteError(
        504,
        "EMBEDDING_PROVIDER_TIMEOUT",
        "Remote embedding provider timed out while encoding the search query.",
        {
          endpoint: remoteConfig.endpoint,
          model: remoteConfig.model,
          timeoutMs,
        },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = { raw };
  }

  if (!response.ok) {
    const apiError =
      typeof parsed === "object" && parsed !== null && "error" in parsed
        ? (parsed as { error?: unknown }).error
        : parsed;

    throw new RouteError(
      502,
      "EMBEDDING_PROVIDER_ERROR",
      "Remote embedding provider rejected the query embedding request.",
      {
        endpoint: remoteConfig.endpoint,
        model: remoteConfig.model,
        error: apiError,
      },
    );
  }

  const vector =
    typeof parsed === "object" && parsed !== null && "data" in parsed
      ? ((parsed as { data?: Array<{ embedding?: unknown }> }).data?.[0]
          ?.embedding ?? null)
      : null;

  if (!isNumericVector(vector)) {
    throw new RouteError(
      502,
      "EMBEDDING_PROVIDER_ERROR",
      "Remote embedding provider returned an invalid vector payload.",
      {
        endpoint: remoteConfig.endpoint,
        model: remoteConfig.model,
      },
    );
  }

  if (vector.length !== dimension) {
    throw new RouteError(
      500,
      "EMBEDDING_DIMENSION_MISMATCH",
      "Remote query embedding does not match the loaded artifact dimension.",
      {
        endpoint: remoteConfig.endpoint,
        model: remoteConfig.model,
        expectedDimension: dimension,
        actualDimension: vector.length,
      },
    );
  }

  return vector;
}
