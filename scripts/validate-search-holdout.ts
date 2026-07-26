import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus } from "@/lib/data/corpus";
import {
  HoldoutFixtureContractError,
  validateSearchHoldoutFixture,
} from "./search-holdout/contract";

const VISIBLE_QUERY_PATHS = [
  "tests/fixtures/search-golden-queries.json",
  "docs/qa/search-50-query-iteration-results.json",
  "docs/qa/search-50-query-iteration-batch2-results.json",
  "tests/fixtures/search-tuned-paraphrase-regression-cases.json",
];

function optionValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

export function readVisibleQueries(filePath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { outputs?: unknown }).outputs)
      ? (parsed as { outputs: unknown[] }).outputs
      : null;

  if (!entries) {
    throw new Error(`Visible query source ${filePath} does not contain an array or outputs array.`);
  }

  return entries.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || typeof (entry as { query?: unknown }).query !== "string") {
      throw new Error(`Visible query source ${filePath} has no query at entry ${index + 1}.`);
    }

    return (entry as { query: string }).query;
  });
}

export async function validateSearchHoldoutFixtureFile(casesPath: string) {
  const fixtureContents = fs.readFileSync(casesPath, "utf8");
  const visibleQueries = VISIBLE_QUERY_PATHS.flatMap((relativePath) =>
    readVisibleQueries(path.join(process.cwd(), relativePath)),
  );
  const corpus = await loadCorpus();
  return validateSearchHoldoutFixture(fixtureContents, {
    validPassageIds: new Set(corpus.map((passage) => passage.id)),
    validSources: new Set(corpus.map((passage) => passage.source)),
    visibleQueries,
  });
}

async function main(): Promise<void> {
  const casesArgument = optionValue("cases");
  if (!casesArgument) {
    throw new Error("Usage: tsx scripts/validate-search-holdout.ts --cases <cases.json>");
  }

  const casesPath = path.resolve(process.cwd(), casesArgument);
  const validation = await validateSearchHoldoutFixtureFile(casesPath);
  console.log(
    JSON.stringify(
      {
        casesPath: path.relative(process.cwd(), casesPath),
        fixtureSha256: validation.fixtureSha256,
        ...validation.summary,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof HoldoutFixtureContractError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}
