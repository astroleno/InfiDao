import fs from "node:fs";
import path from "node:path";
import { diagnoseSearchPassages } from "../src/lib/search/diagnostics";
import { loadSearchIndex } from "../src/lib/search/index-store";

type Expectation =
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

interface EvalCase {
  category: string;
  query: string;
  expectation: Expectation;
  note: string;
}

interface CaseOutput {
  index: number;
  category: string;
  query: string;
  passed: boolean;
  note: string;
  expectation: Expectation;
  resultCount: number;
  top3Ids: string[];
  top5: Array<{
    rank: number;
    id: string;
    source: string;
    chapter: string;
    section: number;
    score: number;
    vectorScore: number;
    lexicalScore: number;
    evidenceScore: number;
    matchedTerms: string[];
    text: string;
  }>;
  lanes: {
    vectorTop3Ids: string[];
    lexicalTop3Ids: string[];
    fusionTop3Ids: string[];
  };
  evidence: {
    aliasLabels: string[];
    sourceTerms: string[];
    coreTerms: string[];
    trustedMatchedTerms: string[];
    hasQueryEvidence: boolean;
    hasTrustedResultEvidence: boolean;
  };
}

interface CliOptions {
  casesPath: string;
  jsonPath: string;
  markdownPath: string;
  title: string;
}

function optionValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);

  if (index >= 0) {
    return process.argv[index + 1] ?? null;
  }

  return null;
}

function resolveOptions(): CliOptions {
  const casesPath = optionValue("cases");
  const jsonPath = optionValue("json");
  const markdownPath = optionValue("markdown");
  const title = optionValue("title") ?? "Search 50 Query Iteration Report";

  if (!casesPath || !jsonPath || !markdownPath) {
    throw new Error("Usage: tsx scripts/run-search-50-iteration-suite.ts --cases <cases.json> --json <results.json> --markdown <report.md> [--title <title>]");
  }

  return {
    casesPath: path.resolve(process.cwd(), casesPath),
    jsonPath: path.resolve(process.cwd(), jsonPath),
    markdownPath: path.resolve(process.cwd(), markdownPath),
    title,
  };
}

function readCases(casesPath: string): EvalCase[] {
  const raw = JSON.parse(fs.readFileSync(casesPath, "utf8")) as unknown;

  if (!Array.isArray(raw)) {
    throw new Error("Case file must contain an array.");
  }

  return raw as EvalCase[];
}

function evaluate(expectation: Expectation, top3Ids: string[], top3Sources: string[], resultCount: number): boolean {
  if (expectation.type === "empty") {
    return resultCount === 0;
  }

  if (expectation.type === "sourceTop3") {
    return top3Sources.some((source) => expectation.sources.includes(source));
  }

  return top3Ids.some((id) => expectation.ids.includes(id));
}

function formatExpectation(expectation: Expectation): string {
  if (expectation.type === "empty") {
    return "return 0 results";
  }

  if (expectation.type === "sourceTop3") {
    return `Top 3 source includes ${expectation.sources.join(" / ")}`;
  }

  return `Top 3 includes ${expectation.ids.join(" / ")}`;
}

function truncate(value: string, maxLength = 80): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function buildMarkdown(title: string, casesPath: string, outputs: CaseOutput[]): string {
  const passedCount = outputs.filter((output) => output.passed).length;
  const categories = Array.from(new Set(outputs.map((output) => output.category)));
  const byCategory = categories.map((category) => {
    const categoryOutputs = outputs.filter((output) => output.category === category);
    const categoryPassed = categoryOutputs.filter((output) => output.passed).length;

    return `- ${category}: ${categoryPassed}/${categoryOutputs.length}`;
  });
  const failures = outputs.filter((output) => !output.passed);
  const rows = outputs
    .map((output) => {
      const top3 = output.top5
        .slice(0, 3)
        .map((result) => `${result.id}(${result.source}, ${result.score})`)
        .join("<br>");

      return `| ${output.index} | ${output.category} | ${output.passed ? "PASS" : "FAIL"} | ${output.query} | ${output.resultCount} | ${top3 || "-"} | ${formatExpectation(output.expectation)} |`;
    })
    .join("\n");
  const detail = outputs
    .map((output) => {
      const top5 = output.top5
        .map(
          (result) =>
            `  ${result.rank}. ${result.id} | ${result.source} ${result.chapter}#${result.section} | score=${result.score} | lexical=${result.lexicalScore} | terms=${result.matchedTerms.join(", ") || "-"} | ${truncate(result.text)}`,
        )
        .join("\n");

      return [
        `### ${output.index}. ${output.query}`,
        "",
        `- Status: ${output.passed ? "PASS" : "FAIL"}`,
        `- Expectation: ${formatExpectation(output.expectation)}`,
        `- Note: ${output.note}`,
        `- Evidence: aliases=${output.evidence.aliasLabels.join(", ") || "-"}; core=${output.evidence.coreTerms.join(", ") || "-"}; trusted=${output.evidence.trustedMatchedTerms.join(", ") || "-"}`,
        "- Top 5:",
        top5 || "  -",
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# ${title}`,
    "",
    "Generated by `npm exec tsx scripts/run-search-50-iteration-suite.ts`.",
    "",
    `Case file: \`${path.relative(process.cwd(), casesPath)}\`.`,
    "",
    "## Summary",
    "",
    `- Total: ${passedCount}/${outputs.length}`,
    ...byCategory,
    "",
    "## Failures",
    "",
    failures.length === 0
      ? "- None"
      : failures
          .map(
            (failure) =>
              `- #${failure.index} ${failure.query}: expected ${formatExpectation(failure.expectation)}, got ${failure.top3Ids.join(", ") || "0 results"}`,
          )
          .join("\n"),
    "",
    "## Results Table",
    "",
    "| # | Category | Status | Query | Count | Top 3 | Expectation |",
    "| - | - | - | - | -: | - | - |",
    rows,
    "",
    "## Detailed Outputs",
    "",
    detail,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const options = resolveOptions();
  const cases = readCases(options.casesPath);
  const index = await loadSearchIndex();
  const passagesById = new Map(index.corpus.map((passage) => [passage.id, passage]));
  const outputs: CaseOutput[] = [];

  for (const [caseIndex, testCase] of cases.entries()) {
    const diagnostics = await diagnoseSearchPassages({
      query: testCase.query,
      topK: 5,
      threshold: 0.25,
    });
    const top5 = diagnostics.results.slice(0, 5).map((result) => {
      const passage = passagesById.get(result.id);

      return {
        rank: result.rank,
        id: result.id,
        source: passage?.source ?? "",
        chapter: passage?.chapter ?? "",
        section: passage?.section ?? 0,
        score: result.score,
        vectorScore: result.vectorScore,
        lexicalScore: result.lexicalScore,
        evidenceScore: result.evidenceScore,
        matchedTerms: result.matchedTerms,
        text: passage?.text ?? "",
      };
    });
    const top3Ids = top5.slice(0, 3).map((result) => result.id);
    const top3Sources = top5.slice(0, 3).map((result) => result.source);

    outputs.push({
      index: caseIndex + 1,
      category: testCase.category,
      query: testCase.query,
      passed: evaluate(testCase.expectation, top3Ids, top3Sources, diagnostics.lanes.full.resultCount),
      note: testCase.note,
      expectation: testCase.expectation,
      resultCount: diagnostics.lanes.full.resultCount,
      top3Ids,
      top5,
      lanes: {
        vectorTop3Ids: diagnostics.lanes.vector.top3Ids,
        lexicalTop3Ids: diagnostics.lanes.lexical.top3Ids,
        fusionTop3Ids: diagnostics.lanes.fusion.top3Ids,
      },
      evidence: diagnostics.evidence,
    });
  }

  fs.mkdirSync(path.dirname(options.jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.markdownPath), { recursive: true });
  fs.writeFileSync(
    options.jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: outputs.length,
        passed: outputs.filter((output) => output.passed).length,
        casesPath: path.relative(process.cwd(), options.casesPath),
        outputs,
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(options.markdownPath, buildMarkdown(options.title, options.casesPath, outputs));

  console.log(
    JSON.stringify(
      {
        total: outputs.length,
        passed: outputs.filter((output) => output.passed).length,
        failed: outputs.filter((output) => !output.passed).map((output) => ({
          index: output.index,
          query: output.query,
          top3Ids: output.top3Ids,
          expectation: output.expectation,
        })),
        jsonPath: options.jsonPath,
        markdownPath: options.markdownPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
