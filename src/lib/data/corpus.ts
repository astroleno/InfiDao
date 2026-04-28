import fs from "node:fs/promises";
import path from "node:path";
import type { PassageRecord } from "@/types";
import { buildTextHash } from "@/lib/data/hash";
import { RouteError } from "@/lib/utils/errors";

const DEFAULT_MANIFEST_PATH = path.join(process.cwd(), "data", "corpus-manifest.json");

const SOURCE_SLUGS: Record<string, string> = {
  论语: "lunyu",
  大学: "daxue",
  中庸: "zhongyong",
  孟子: "mengzi",
  诗经: "shijing",
  尚书: "shangshu",
  礼记: "liji",
  易经: "yijing",
  春秋: "chunqiu",
};

const CHINESE_NUMERAL_VALUES: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  百: 100,
};

interface RawPassageRecord {
  text: string;
  source: string;
  chapter: string;
  section: number;
}

interface CorpusManifest {
  version: string;
  defaultCollection: string;
  files: Array<{
    path: string;
    collection?: string;
  }>;
  works: Record<
    string,
    {
      workId: string;
      workTitle: string;
    }
  >;
}

function isCorpusManifest(value: unknown): value is CorpusManifest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "string" &&
    typeof candidate.defaultCollection === "string" &&
    Array.isArray(candidate.files) &&
    typeof candidate.works === "object" &&
    candidate.works !== null
  );
}

function isRawPassageRecord(value: unknown): value is RawPassageRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.text === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.chapter === "string" &&
    typeof candidate.section === "number"
  );
}

function chineseNumeralToNumber(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  let total = 0;
  let current = 0;

  for (const character of value) {
    const digit = CHINESE_NUMERAL_VALUES[character];

    if (digit === undefined) {
      continue;
    }

    if (digit === 10 || digit === 100) {
      current = current || 1;
      total += current * digit;
      current = 0;
      continue;
    }

    current = current * 10 + digit;
  }

  return total + current;
}

function getChapterNumber(chapter: string): number {
  const match = chapter.match(/([一二三四五六七八九十百0-9]+)/);
  const numericToken = match?.[1];

  if (!numericToken) {
    return 1;
  }

  const parsed = chineseNumeralToNumber(numericToken);
  return parsed > 0 ? parsed : 1;
}

function buildPassageId(source: string, chapter: string, section: number): string {
  const sourceSlug = SOURCE_SLUGS[source] ?? "classic";
  return `${sourceSlug}-${getChapterNumber(chapter)}-${section}`;
}

async function readManifest(manifestPath: string): Promise<CorpusManifest> {
  let fileContents: string;

  try {
    fileContents = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    throw new RouteError(500, "CORPUS_READ_FAILED", "Corpus data could not be read.", {
      filePath: manifestPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fileContents) as unknown;
  } catch (error) {
    throw new RouteError(500, "CORPUS_MALFORMED", "Corpus manifest contains invalid JSON.", {
      filePath: manifestPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isCorpusManifest(parsed)) {
    throw new RouteError(500, "CORPUS_MALFORMED", "Corpus manifest does not match the expected shape.", {
      filePath: manifestPath,
    });
  }

  return parsed;
}

async function loadCorpusFile(
  filePath: string,
  manifest: CorpusManifest,
  collection: string,
): Promise<PassageRecord[]> {
  let fileContents: string;

  try {
    fileContents = await fs.readFile(path.resolve(process.cwd(), filePath), "utf8");
  } catch (error) {
    throw new RouteError(500, "CORPUS_READ_FAILED", "Corpus data could not be read.", {
      filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const lines = fileContents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new RouteError(500, "CORPUS_EMPTY", "Corpus data is empty.", {
      filePath,
    });
  }

  return lines.map((line, index) => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line) as unknown;
    } catch (error) {
      throw new RouteError(500, "CORPUS_MALFORMED", "Corpus data contains invalid JSON.", {
        filePath,
        line: index + 1,
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    if (!isRawPassageRecord(parsed)) {
      throw new RouteError(500, "CORPUS_MALFORMED", "Corpus data does not match the reboot passage shape.", {
        filePath,
        line: index + 1,
      });
    }

    const work = manifest.works[parsed.source] ?? {
      workId: SOURCE_SLUGS[parsed.source] ?? "classic",
      workTitle: parsed.source,
    };

    return {
      id: buildPassageId(parsed.source, parsed.chapter, parsed.section),
      source: parsed.source,
      collection,
      workId: work.workId,
      workTitle: work.workTitle,
      chapter: parsed.chapter,
      section: parsed.section,
      text: parsed.text,
      textHash: buildTextHash(parsed.text),
      corpusVersion: manifest.version,
    };
  });
}

export async function loadCorpus(manifestPath = DEFAULT_MANIFEST_PATH): Promise<PassageRecord[]> {
  const manifest = await readManifest(manifestPath);
  const loaded = await Promise.all(
    manifest.files.map((file) =>
      loadCorpusFile(file.path, manifest, file.collection ?? manifest.defaultCollection),
    ),
  );

  return loaded.flat();
}
