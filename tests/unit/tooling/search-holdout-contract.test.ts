import { readFileSync } from "node:fs";
import path from "node:path";
import {
  HoldoutFixtureContractError,
  validateSearchHoldoutFixture,
  type SearchHoldoutCase,
} from "../../../scripts/search-holdout/contract";

const passageIds = new Set(
  Array.from({ length: 24 }, (_, index) => `passage-${index + 1}`),
);
const sources = new Set(["论语", "孟子"]);

function buildValidCases(): SearchHoldoutCase[] {
  return [
    ...Array.from({ length: 24 }, (_, index) => ({
      category: "in-domain" as const,
      query: `独立问题 ${index + 1}`,
      expectation: {
        type: "anyTop3Id" as const,
        ids: [`passage-${index + 1}`],
      },
      note: `独立语义标注 ${index + 1}`,
    })),
    ...Array.from({ length: 6 }, (_, index) => ({
      category: "ood" as const,
      query: `外部问题 ${index + 1}`,
      expectation: { type: "empty" as const },
      note: `非语料问题 ${index + 1}`,
    })),
  ];
}

function validate(cases: unknown, visibleQueries: Iterable<string> = []) {
  return validateSearchHoldoutFixture(JSON.stringify(cases), {
    validPassageIds: passageIds,
    validSources: sources,
    visibleQueries,
  });
}

function expectContractError(run: () => unknown, message: string) {
  expect(run).toThrow(HoldoutFixtureContractError);
  expect(run).toThrow(message);
}

describe("search holdout fixture contract", () => {
  it("accepts exactly 24 in-domain and 6 OOD cases without loading search", () => {
    const result = validate(buildValidCases());

    expect(result.summary).toMatchObject({
      total: 30,
      inDomain: 24,
      ood: 6,
    });
    expect(result.fixtureSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.cases).toHaveLength(30);

    const contractSource = readFileSync(
      path.join(process.cwd(), "scripts/search-holdout/contract.ts"),
      "utf8",
    );
    expect(contractSource).not.toMatch(/src\/lib\/search|@\/lib\/search/);
  });

  it("rejects incorrect category counts before an evaluation can start", () => {
    const cases = buildValidCases().slice(0, 29);

    expectContractError(() => validate(cases), "exactly 30 cases");
  });

  it("rejects duplicate and visible queries after deterministic normalization", () => {
    const duplicateCases = buildValidCases();
    duplicateCases[1] = {
      ...duplicateCases[1]!,
      query: "独立 问题，1！",
    };

    expectContractError(() => validate(duplicateCases), "duplicate normalized query");

    const visibleCases = buildValidCases();
    visibleCases[0] = {
      ...visibleCases[0]!,
      query: "可见 查询！",
    };

    expectContractError(() => validate(visibleCases, ["可见查询"]), "reuses a visible query");
  });

  it("rejects invalid expectations and unknown corpus references", () => {
    const unknownPassageCases = buildValidCases();
    unknownPassageCases[0] = {
      ...unknownPassageCases[0]!,
      expectation: { type: "anyTop3Id", ids: ["missing-passage"] },
    };
    expectContractError(() => validate(unknownPassageCases), "unknown passage id");

    const incompatibleOodCases = buildValidCases();
    incompatibleOodCases[24] = {
      ...incompatibleOodCases[24]!,
      expectation: { type: "sourceTop3", sources: ["论语"] },
    };
    expectContractError(() => validate(incompatibleOodCases), "must use an empty expectation");
  });
});
