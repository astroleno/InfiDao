import crypto from "node:crypto";
import type { SearchGraphArtifact } from "@/lib/search/graph/types";

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

type SearchGraphSignaturePayload = Omit<SearchGraphArtifact, "artifactSignature" | "generatedAt">;

function isCanonicalRecord(value: CanonicalValue): value is { [key: string]: CanonicalValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCanonicalValue(value: CanonicalValue): CanonicalValue {
  if (typeof value === "string") {
    return value.normalize("NFC");
  }

  if (Array.isArray(value)) {
    const normalized = value.map(item => normalizeCanonicalValue(item));

    if (normalized.every(item => isCanonicalRecord(item) && typeof item.id === "string")) {
      return [...normalized].sort((left, right) => {
        const leftId = (left as { id: string }).id;
        const rightId = (right as { id: string }).id;
        return leftId.localeCompare(rightId);
      });
    }

    if (normalized.every(item => typeof item === "string")) {
      return [...normalized].sort((left, right) => String(left).localeCompare(String(right)));
    }

    return normalized;
  }

  if (isCanonicalRecord(value)) {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce<{ [key: string]: CanonicalValue }>((result, key) => {
        const nestedValue = value[key];

        if (nestedValue !== undefined) {
          result[key] = normalizeCanonicalValue(nestedValue);
        }

        return result;
      }, {});
  }

  return value;
}

function toSignaturePayload(artifact: SearchGraphArtifact): SearchGraphSignaturePayload {
  const { artifactSignature: _artifactSignature, generatedAt: _generatedAt, ...payload } = artifact;
  return payload;
}

export function canonicalJson(value: CanonicalValue): string {
  return JSON.stringify(normalizeCanonicalValue(value));
}

export function buildSearchGraphArtifactSignature(artifact: SearchGraphArtifact): string {
  const payload = toSignaturePayload(artifact) as unknown as CanonicalValue;
  const digest = crypto.createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");

  return `sha256:${digest}`;
}

export function attachSearchGraphArtifactSignature(
  artifact: Omit<SearchGraphArtifact, "artifactSignature"> & { artifactSignature?: string },
): SearchGraphArtifact {
  const unsignedArtifact = {
    ...artifact,
    artifactSignature: `sha256:${"0".repeat(64)}`,
  } satisfies SearchGraphArtifact;

  return {
    ...unsignedArtifact,
    artifactSignature: buildSearchGraphArtifactSignature(unsignedArtifact),
  };
}
