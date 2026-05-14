import fs from "node:fs/promises";
import path from "node:path";
import { searchConceptSeedSchema, type SearchConceptSeed } from "@/lib/search/concepts/schema";

export class SearchConceptSeedError extends Error {
  constructor(
    public readonly code:
      | "CONCEPT_SEED_MISSING"
      | "CONCEPT_SEED_INVALID_JSON"
      | "CONCEPT_SEED_SCHEMA_INVALID",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "SearchConceptSeedError";
  }
}

const DEFAULT_CONCEPT_SEED_PATH = path.join(process.cwd(), "data", "search-concepts.json");

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export function validateSearchConceptSeed(
  value: unknown,
  seedPath = DEFAULT_CONCEPT_SEED_PATH,
): SearchConceptSeed {
  const result = searchConceptSeedSchema.safeParse(value);

  if (!result.success) {
    throw new SearchConceptSeedError(
      "CONCEPT_SEED_SCHEMA_INVALID",
      "Search concept seed does not match the expected schema.",
      {
        seedPath,
        issues: result.error.issues,
      },
    );
  }

  return result.data;
}

export async function loadSearchConceptSeed(
  seedPath = DEFAULT_CONCEPT_SEED_PATH,
): Promise<SearchConceptSeed> {
  let rawSeed: string;

  try {
    rawSeed = await fs.readFile(seedPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new SearchConceptSeedError("CONCEPT_SEED_MISSING", "Search concept seed is missing.", {
        seedPath,
      });
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawSeed) as unknown;
  } catch (error) {
    throw new SearchConceptSeedError(
      "CONCEPT_SEED_INVALID_JSON",
      "Search concept seed contains invalid JSON.",
      {
        seedPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }

  return validateSearchConceptSeed(parsed, seedPath);
}
