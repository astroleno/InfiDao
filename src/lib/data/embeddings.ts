import fs from "node:fs/promises";
import path from "node:path";
import type { PassageRecord } from "@/types";
import { RouteError } from "@/lib/utils/errors";

const DEFAULT_EMBEDDINGS_PATH = path.join(process.cwd(), "data", "embeddings.json");

function resolveEmbeddingArtifactPath(filePath?: string): string {
  if (filePath) {
    return filePath;
  }

  const configuredPath = process.env.SEARCH_EMBEDDING_ARTIFACT_PATH?.trim();
  if (!configuredPath) {
    return DEFAULT_EMBEDDINGS_PATH;
  }

  return path.resolve(process.cwd(), configuredPath);
}

export interface EmbeddingRecord {
  id: string;
  textHash: string;
  vector: number[];
}

export interface EmbeddingArtifact {
  model: string;
  dimension: number;
  corpusVersion: string;
  items: EmbeddingRecord[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isEmbeddingRecord(value: unknown): value is EmbeddingRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.textHash === "string" &&
    Array.isArray(candidate.vector) &&
    candidate.vector.length > 0 &&
    candidate.vector.every(isFiniteNumber)
  );
}

function isEmbeddingArtifact(value: unknown): value is EmbeddingArtifact {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.model === "string" &&
    typeof candidate.dimension === "number" &&
    typeof candidate.corpusVersion === "string" &&
    Array.isArray(candidate.items) &&
    candidate.items.length > 0 &&
    candidate.items.every(isEmbeddingRecord)
  );
}

export async function loadEmbeddingArtifact(filePath?: string): Promise<EmbeddingArtifact> {
  const resolvedFilePath = resolveEmbeddingArtifactPath(filePath);
  let fileContents: string;

  try {
    fileContents = await fs.readFile(resolvedFilePath, "utf8");
  } catch (error) {
    throw new RouteError(500, "EMBEDDINGS_READ_FAILED", "Embedding data could not be read.", {
      filePath: resolvedFilePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fileContents) as unknown;
  } catch (error) {
    throw new RouteError(500, "EMBEDDINGS_MALFORMED", "Embedding data must be valid JSON.", {
      filePath: resolvedFilePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isEmbeddingArtifact(parsed)) {
    throw new RouteError(500, "EMBEDDINGS_MALFORMED", "Embedding data does not match the v2 artifact shape.", {
      filePath: resolvedFilePath,
    });
  }

  if (!parsed.items.every((record) => record.vector.length === parsed.dimension)) {
    throw new RouteError(500, "EMBEDDINGS_MALFORMED", "Embedding vectors must match the artifact dimension.", {
      filePath: resolvedFilePath,
      dimension: parsed.dimension,
    });
  }

  return parsed;
}

export async function loadEmbeddingRecords(filePath?: string): Promise<EmbeddingRecord[]> {
  const artifact = await loadEmbeddingArtifact(filePath);
  return artifact.items;
}

export async function loadEmbeddingsForCorpus(
  corpus: PassageRecord[],
  filePath?: string,
): Promise<Map<string, number[]>> {
  const artifact = await loadEmbeddingArtifact(filePath);
  const recordMap = new Map(artifact.items.map((record) => [record.id, record]));

  for (const passage of corpus) {
    const record = recordMap.get(passage.id);

    if (!record) {
      throw new RouteError(500, "EMBEDDING_NOT_FOUND", "Embedding data is missing for a passage.", {
        filePath,
        passageId: passage.id,
      });
    }

    if (record.textHash !== passage.textHash) {
      throw new RouteError(500, "EMBEDDING_STALE", "Embedding data was generated from stale passage text.", {
        filePath,
        passageId: passage.id,
      });
    }

    if (artifact.corpusVersion !== passage.corpusVersion) {
      throw new RouteError(500, "EMBEDDING_VERSION_MISMATCH", "Embedding artifact does not match corpus version.", {
        filePath,
        passageId: passage.id,
        artifactVersion: artifact.corpusVersion,
        corpusVersion: passage.corpusVersion,
      });
    }
  }

  for (const record of artifact.items) {
    if (!corpus.some((passage) => passage.id === record.id)) {
      throw new RouteError(500, "EMBEDDING_ORPHANED", "Embedding data includes an unknown passage id.", {
        filePath,
        passageId: record.id,
      });
    }
  }

  return new Map(artifact.items.map((record) => [record.id, record.vector]));
}
