import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_PATH = "data/rysxguji/guji-core-v1.jsonl";
const DEFAULT_PROVENANCE_PATH = "data/rysxguji/provenance-v1.jsonl";
const DEFAULT_SOURCE_REGISTRY_PATH = "data/rysxguji/sources.json";
const DEFAULT_PROVIDER = "daizhige";
const DEFAULT_COLLECTION = "rysxguji_core";

const HTML_ENTITIES = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  apos: "'",
};

function parseArgs(argv) {
  const args = {
    books: null,
    outputPath: DEFAULT_OUTPUT_PATH,
    provenancePath: DEFAULT_PROVENANCE_PATH,
    sourceRegistryPath: DEFAULT_SOURCE_REGISTRY_PATH,
    minChars: 8,
    maxChars: 360,
    timeoutMs: 30_000,
  };

  for (const arg of argv) {
    if (arg.startsWith("--books=")) {
      args.books = arg
        .slice("--books=".length)
        .split(",")
        .map((book) => book.trim())
        .filter(Boolean);
      continue;
    }

    if (arg.startsWith("--sources=")) {
      args.sourceRegistryPath = arg.slice("--sources=".length).trim() || DEFAULT_SOURCE_REGISTRY_PATH;
      continue;
    }

    if (arg.startsWith("--source-registry=")) {
      args.sourceRegistryPath = arg.slice("--source-registry=".length).trim() || DEFAULT_SOURCE_REGISTRY_PATH;
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.outputPath = arg.slice("--output=".length).trim() || DEFAULT_OUTPUT_PATH;
      continue;
    }

    if (arg.startsWith("--provenance=")) {
      args.provenancePath = arg.slice("--provenance=".length).trim() || DEFAULT_PROVENANCE_PATH;
      continue;
    }

    if (arg.startsWith("--min-chars=")) {
      args.minChars = Number.parseInt(arg.slice("--min-chars=".length), 10);
      continue;
    }

    if (arg.startsWith("--max-chars=")) {
      args.maxChars = Number.parseInt(arg.slice("--max-chars=".length), 10);
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number.parseInt(arg.slice("--timeout-ms=".length), 10);
    }
  }

  if (!Number.isFinite(args.minChars) || args.minChars < 1) {
    throw new Error("--min-chars must be a positive integer.");
  }

  if (!Number.isFinite(args.maxChars) || args.maxChars < args.minChars) {
    throw new Error("--max-chars must be greater than or equal to --min-chars.");
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error("--timeout-ms must be at least 1000.");
  }

  return args;
}

function isSourceRecord(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.source === "string" &&
    typeof value.slug === "string" &&
    typeof value.url === "string" &&
    (value.collection === undefined || typeof value.collection === "string") &&
    (value.group === undefined || typeof value.group === "string") &&
    (value.provider === undefined || typeof value.provider === "string") &&
    (value.editionNote === undefined || typeof value.editionNote === "string") &&
    (value.enabled === undefined || typeof value.enabled === "boolean")
  );
}

async function loadSourceRegistry(registryPath) {
  const resolvedPath = path.resolve(process.cwd(), registryPath);
  const parsed = JSON.parse(await fs.readFile(resolvedPath, "utf8"));

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray(parsed.sources) ||
    !parsed.sources.every(isSourceRecord)
  ) {
    throw new Error(`Source registry does not match the expected shape: ${registryPath}`);
  }

  return {
    provider: typeof parsed.provider === "string" ? parsed.provider : DEFAULT_PROVIDER,
    sources: parsed.sources,
  };
}

function decodeHtml(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/gu, (entity, body) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }

    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }

    return HTML_ENTITIES[body] ?? entity;
  });
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/gu, ""));
}

function normalizeText(value) {
  return value
    .replace(/\r/gu, "\n")
    .replace(/[ \t\u00a0]+/gu, " ")
    .replace(/^[　\s]+/gu, "")
    .replace(/[　\s]+$/gu, "")
    .trim();
}

function extractMarkdownContent(html, source) {
  const match = html.match(/<div class="markdown-content">([\s\S]*?)<\/div>\s*<div class="document-meta">/u)
    ?? html.match(/<div class="markdown-content">([\s\S]*?)<\/div>/u);

  if (!match?.[1]) {
    throw new Error(`Could not find markdown-content for ${source}.`);
  }

  return match[1];
}

function extractParagraphs(markdownHtml) {
  const paragraphs = [];
  const paragraphPattern = /<p\b[^>]*>([\s\S]*?)<\/p>/giu;
  let match;

  while ((match = paragraphPattern.exec(markdownHtml)) !== null) {
    const lines = match[1]
      .replace(/<br\s*\/?>/giu, "\n")
      .split(/\n/u)
      .map(stripTags)
      .map(normalizeText)
      .filter(Boolean);

    if (lines.length > 0) {
      paragraphs.push(lines);
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  const lines = stripTags(markdownHtml)
    .split(/\n/u)
    .map(normalizeText)
    .filter(Boolean);

  return lines.length > 0 ? [lines] : [];
}

function isBookTitle(line, source) {
  const normalized = line.replace(/[《》「」『』]/gu, "");
  return normalized === source || normalized === `${source}卷`;
}

function looksLikeHeading(line) {
  if (line.length > 24) {
    return false;
  }

  if (/[，。！？；：、“”‘’《》]/u.test(line)) {
    return false;
  }

  if (/^(卷|篇)?[一二三四五六七八九十百0-9]+$/u.test(line)) {
    return false;
  }

  if (/^[ⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/u.test(line)) {
    return false;
  }

  return /[\p{Script=Han}]/u.test(line);
}

function getExplicitHeadingTitle(line, source) {
  const numberedMatch = line.match(/^([0-9]{1,3})[.．、]\s*(.+)$/u);

  if (numberedMatch?.[2]) {
    return line;
  }

  const quotedTitleMatch = line.match(/^《([^》]+)》$/u);
  if (quotedTitleMatch?.[1]) {
    return quotedTitleMatch[1].replace(new RegExp(`^${source}`, "u"), "") || quotedTitleMatch[1];
  }

  return null;
}

function getHeadingTitle(line, source) {
  return getExplicitHeadingTitle(line, source) ?? (looksLikeHeading(line) ? line : null);
}

function isTableOfContents(lines, source) {
  if (lines.length < 5) {
    return false;
  }

  const nonTitleLines = lines.filter((line) => !isBookTitle(line, source));
  const headingLikeCount = nonTitleLines.filter((line) => getHeadingTitle(line, source) !== null).length;
  return headingLikeCount / nonTitleLines.length >= 0.75;
}

function textHash(text) {
  return crypto.createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

function splitLongText(text, maxChars) {
  if (text.length <= maxChars) {
    return [text];
  }

  const sentenceUnits = text
    .split(/(?<=[。！？；])/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const units = sentenceUnits.length > 1 ? sentenceUnits : Array.from(text.matchAll(new RegExp(`.{1,${maxChars}}`, "gu")), (match) => match[0]);
  const chunks = [];
  let current = "";

  for (const unit of units) {
    if (current && current.length + unit.length > maxChars) {
      chunks.push(current);
      current = unit;
      continue;
    }

    current += unit;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function pushChapter(chapters, chapter) {
  if (!chapter || chapter.lines.length === 0) {
    return;
  }

  chapters.push(chapter);
}

function buildChapters(book, paragraphs) {
  const chapters = [];
  let current = null;

  for (const lines of paragraphs) {
    if (isTableOfContents(lines, book.source)) {
      continue;
    }

    for (const line of lines) {
      if (isBookTitle(line, book.source)) {
        continue;
      }

      const headingTitle = getHeadingTitle(line, book.source);

      if (headingTitle) {
        pushChapter(chapters, current);
        current = {
          rawTitle: headingTitle,
          lines: [],
        };
        continue;
      }

      if (!current) {
        current = {
          rawTitle: "正文",
          lines: [],
        };
      }

      current.lines.push(line);
    }
  }

  pushChapter(chapters, current);

  if (chapters.length === 0) {
    throw new Error(`No content chapters found for ${book.source}.`);
  }

  return chapters;
}

function buildPassages(book, paragraphs, options, retrievedAt) {
  const chapters = buildChapters(book, paragraphs);
  const records = [];
  const provenance = [];
  const seenTexts = new Set();

  chapters.forEach((chapter, chapterIndex) => {
    const numberedChapter = `第${chapterIndex + 1}章 ${chapter.rawTitle}`;
    let section = 1;

    for (const line of chapter.lines) {
      for (const chunk of splitLongText(line, options.maxChars)) {
        const text = normalizeText(chunk);

        if (text.length < options.minChars || seenTexts.has(text)) {
          continue;
        }

        seenTexts.add(text);
        const id = `rysxguji-${book.slug}-${chapterIndex + 1}-${section}`;
        const record = {
          id,
          text,
          source: book.source,
          chapter: numberedChapter,
          section,
        };

        records.push(record);
        provenance.push({
          id,
          provider: book.provider ?? DEFAULT_PROVIDER,
          collection: book.collection ?? DEFAULT_COLLECTION,
          group: book.group,
          source: book.source,
          sourceUrl: book.url,
          chapter: numberedChapter,
          section,
          retrievedAt,
          textHash: textHash(text),
          editionNote: book.editionNote,
        });
        section += 1;
      }
    }
  });

  return { records, provenance };
}

async function fetchBookHtml(book, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(book.url, {
      headers: {
        "User-Agent": "InfiDao corpus builder/1.0 (+https://github.com/astroleno/InfiDao)",
      },
      signal: controller.signal,
    });

    const body = await response.text();

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 160)}`);
    }

    if (/^\s*\{[\s\S]*"error"/u.test(body)) {
      throw new Error(`Daizhige returned an error payload: ${body.slice(0, 160)}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function writeJsonl(filePath, records) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  return resolvedPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await loadSourceRegistry(args.sourceRegistryPath);
  const enabledBooks = registry.sources
    .filter((book) => book.enabled !== false)
    .map((book) => ({
      provider: registry.provider,
      ...book,
    }));
  const selectedBooks = (args.books ?? enabledBooks.map((book) => book.source)).map((source) => {
    const book = enabledBooks.find((candidate) => candidate.source === source || candidate.slug === source);

    if (!book) {
      throw new Error(`Unknown or disabled book "${source}". Known enabled books: ${enabledBooks.map((item) => item.source).join(", ")}`);
    }

    return book;
  });

  const retrievedAt = new Date().toISOString();
  const allRecords = [];
  const allProvenance = [];

  for (const book of selectedBooks) {
    const html = await fetchBookHtml(book, args.timeoutMs);
    const markdownHtml = extractMarkdownContent(html, book.source);
    const paragraphs = extractParagraphs(markdownHtml);
    const { records, provenance } = buildPassages(book, paragraphs, args, retrievedAt);

    if (records.length === 0) {
      throw new Error(`No passages produced for ${book.source}.`);
    }

    allRecords.push(...records);
    allProvenance.push(...provenance);
    console.log(`${book.source}: ${records.length} passages from ${book.url}`);
  }

  const outputPath = await writeJsonl(args.outputPath, allRecords);
  const provenancePath = await writeJsonl(args.provenancePath, allProvenance);

  console.log(`Wrote ${allRecords.length} corpus records to ${outputPath}`);
  console.log(`Wrote ${allProvenance.length} provenance records to ${provenancePath}`);
}

await main();
