import { createHash } from "node:crypto";

export type HoldoutCategory = "in-domain" | "ood";

export type HoldoutExpectation =
  | {
      type: "anyTop3Id";
      ids: string[];
    }
  | {
      type: "sourceTop3";
      sources: string[];
    }
  | {
      type: "empty";
    };

export interface SearchHoldoutCase {
  category: HoldoutCategory;
  query: string;
  expectation: HoldoutExpectation;
  note: string;
}

export interface HoldoutFixtureContext {
  validPassageIds: ReadonlySet<string>;
  validSources: ReadonlySet<string>;
  visibleQueries: Iterable<string>;
}

export interface HoldoutFixtureValidation {
  cases: SearchHoldoutCase[];
  fixtureSha256: string;
  summary: {
    total: number;
    inDomain: number;
    ood: number;
  };
}

export class HoldoutFixtureContractError extends Error {
  constructor(readonly issues: string[]) {
    super(`Search holdout fixture contract failed:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "HoldoutFixtureContractError";
  }
}

const CASE_KEYS = new Set(["category", "query", "expectation", "note"]);
const ANY_TOP_3_KEYS = new Set(["type", "ids"]);
const SOURCE_TOP_3_KEYS = new Set(["type", "sources"]);
const EMPTY_KEYS = new Set(["type"]);

export function normalizeHoldoutQuery(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/[A-Z]/g, (character) => character.toLowerCase())
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function readStringList(
  value: unknown,
  field: string,
  caseLabel: string,
  issues: string[],
): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    issues.push(`${caseLabel} must provide a non-empty ${field} list.`);
    return null;
  }

  const normalized = value.map((item) => item.trim());
  if (new Set(normalized).size !== normalized.length) {
    issues.push(`${caseLabel} must not repeat ${field}.`);
    return null;
  }

  return normalized;
}

function readExpectation(
  value: unknown,
  category: HoldoutCategory,
  caseLabel: string,
  context: HoldoutFixtureContext,
  issues: string[],
): HoldoutExpectation | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    issues.push(`${caseLabel} must provide an expectation object.`);
    return null;
  }

  if (category === "ood") {
    if (value.type !== "empty" || !hasOnlyKeys(value, EMPTY_KEYS)) {
      issues.push(`${caseLabel} must use an empty expectation for OOD.`);
      return null;
    }

    return { type: "empty" };
  }

  if (value.type === "anyTop3Id") {
    if (!hasOnlyKeys(value, ANY_TOP_3_KEYS)) {
      issues.push(`${caseLabel} has unsupported anyTop3Id expectation fields.`);
      return null;
    }

    const ids = readStringList(value.ids, "ids", caseLabel, issues);
    if (!ids) {
      return null;
    }

    for (const id of ids) {
      if (!context.validPassageIds.has(id)) {
        issues.push(`${caseLabel} references unknown passage id "${id}".`);
      }
    }

    return { type: "anyTop3Id", ids };
  }

  if (value.type === "sourceTop3") {
    if (!hasOnlyKeys(value, SOURCE_TOP_3_KEYS)) {
      issues.push(`${caseLabel} has unsupported sourceTop3 expectation fields.`);
      return null;
    }

    const sources = readStringList(value.sources, "sources", caseLabel, issues);
    if (!sources) {
      return null;
    }

    for (const source of sources) {
      if (!context.validSources.has(source)) {
        issues.push(`${caseLabel} references unknown source "${source}".`);
      }
    }

    return { type: "sourceTop3", sources };
  }

  issues.push(`${caseLabel} must use anyTop3Id or sourceTop3 for in-domain.`);
  return null;
}

export function validateSearchHoldoutFixture(
  contents: string,
  context: HoldoutFixtureContext,
): HoldoutFixtureValidation {
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new HoldoutFixtureContractError([
      `Fixture is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  if (!Array.isArray(parsed)) {
    throw new HoldoutFixtureContractError(["Fixture root must be an array."]);
  }

  const issues: string[] = [];
  if (parsed.length !== 30) {
    issues.push(`Fixture must contain exactly 30 cases; found ${parsed.length}.`);
  }

  const visibleQueries = new Set(
    Array.from(context.visibleQueries, normalizeHoldoutQuery).filter(Boolean),
  );
  const normalizedQueries = new Set<string>();
  const cases: SearchHoldoutCase[] = [];

  for (const [index, value] of parsed.entries()) {
    const caseLabel = `Case #${index + 1}`;
    if (!isRecord(value) || !hasOnlyKeys(value, CASE_KEYS)) {
      issues.push(`${caseLabel} must contain only category, query, expectation, and note.`);
      continue;
    }

    if (value.category !== "in-domain" && value.category !== "ood") {
      issues.push(`${caseLabel} has an unknown category.`);
      continue;
    }

    if (typeof value.query !== "string" || !value.query.trim()) {
      issues.push(`${caseLabel} must provide a non-empty query.`);
      continue;
    }

    const normalizedQuery = normalizeHoldoutQuery(value.query);
    if (!normalizedQuery) {
      issues.push(`${caseLabel} query must contain letters or numbers after normalization.`);
    } else if (normalizedQueries.has(normalizedQuery)) {
      issues.push(`${caseLabel} has a duplicate normalized query.`);
    } else if (visibleQueries.has(normalizedQuery)) {
      issues.push(`${caseLabel} reuses a visible query after normalization.`);
    }
    normalizedQueries.add(normalizedQuery);

    if (typeof value.note !== "string" || !value.note.trim()) {
      issues.push(`${caseLabel} must provide a non-empty note.`);
      continue;
    }

    const expectation = readExpectation(value.expectation, value.category, caseLabel, context, issues);
    if (!expectation) {
      continue;
    }

    cases.push({
      category: value.category,
      query: value.query.trim(),
      expectation,
      note: value.note.trim(),
    });
  }

  const inDomain = cases.filter((testCase) => testCase.category === "in-domain").length;
  const ood = cases.filter((testCase) => testCase.category === "ood").length;
  if (inDomain !== 24) {
    issues.push(`Fixture must contain exactly 24 in-domain cases; found ${inDomain}.`);
  }
  if (ood !== 6) {
    issues.push(`Fixture must contain exactly 6 OOD cases; found ${ood}.`);
  }

  if (issues.length > 0) {
    throw new HoldoutFixtureContractError(issues);
  }

  return {
    cases,
    fixtureSha256: createHash("sha256").update(contents).digest("hex"),
    summary: {
      total: cases.length,
      inDomain,
      ood,
    },
  };
}
