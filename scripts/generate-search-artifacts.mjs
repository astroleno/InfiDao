import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "data", "corpus-manifest.json");
const embeddingSpecPath = path.join(process.cwd(), "src", "lib", "search", "local-embedding-spec.json");

const embeddingSpec = JSON.parse(await fs.readFile(embeddingSpecPath, "utf8"));
const conceptPatterns = embeddingSpec.conceptPatterns.map((pattern) => new RegExp(pattern, "gu"));
const hashBuckets = embeddingSpec.hashBuckets;
const vectorSize = conceptPatterns.length + hashBuckets;
const sourceSlugs = {
  "论语": "lunyu",
  "大学": "daxue",
  "中庸": "zhongyong",
  "孟子": "mengzi",
  "诗经": "shijing",
  "尚书": "shangshu",
  "礼记": "liji",
  "易经": "yijing",
  "春秋": "chunqiu"
};

const chineseNumeralValues = {
  "零": 0,
  "一": 1,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
  "十": 10,
  "百": 100
};

function textHash(text) {
  return crypto.createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function hashToken(token) {
  let hash = 2166136261;

  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(text) {
  return Array.from(text.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
}

function normalizeVector(values) {
  const magnitude = Math.hypot(...values);

  if (magnitude === 0) {
    return values.map((_, index) => (index === conceptPatterns.length ? 1 : 0));
  }

  return values.map((value) => value / magnitude);
}

function buildEmbedding(text) {
  const normalized = text.trim().toLowerCase();
  const vector = Array.from({ length: vectorSize }, () => 0);

  conceptPatterns.forEach((pattern, index) => {
    vector[index] = countMatches(normalized, pattern) * 2;
  });

  for (const token of tokenize(normalized)) {
    const tokenIndex = conceptPatterns.length + (hashToken(token) % hashBuckets);
    vector[tokenIndex] = (vector[tokenIndex] ?? 0) + 0.08;

    for (const character of token) {
      const characterIndex = conceptPatterns.length + (hashToken(character) % hashBuckets);
      vector[characterIndex] = (vector[characterIndex] ?? 0) + 0.02;
    }
  }

  return normalizeVector(vector);
}

function chineseNumeralToNumber(value) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  let total = 0;
  let current = 0;

  for (const character of value) {
    const digit = chineseNumeralValues[character];

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

function chapterNumber(chapter) {
  const match = chapter.match(/([一二三四五六七八九十百0-9]+)/);
  const token = match?.[1];
  const parsed = token ? chineseNumeralToNumber(token) : 1;
  return parsed > 0 ? parsed : 1;
}

function passageId(source, chapter, section) {
  const sourceSlug = sourceSlugs[source] ?? "classic";
  return `${sourceSlug}-${chapterNumber(chapter)}-${section}`;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const outputPath = path.resolve(process.cwd(), manifest.embeddingArtifact.path);

  if (manifest.embeddingArtifact.model !== embeddingSpec.model) {
    throw new Error(`Manifest embedding model ${manifest.embeddingArtifact.model} does not match ${embeddingSpec.model}`);
  }

  if (manifest.embeddingArtifact.dimension !== vectorSize) {
    throw new Error(`Manifest embedding dimension ${manifest.embeddingArtifact.dimension} does not match ${vectorSize}`);
  }

  const passages = [];

  for (const file of manifest.files) {
    const raw = await fs.readFile(path.resolve(process.cwd(), file.path), "utf8");
    passages.push(
      ...raw
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    );
  }

  const artifact = {
    model: embeddingSpec.model,
    dimension: vectorSize,
    corpusVersion: manifest.version,
    items: passages.map((passage) => ({
      id: passageId(passage.source, passage.chapter, passage.section),
      textHash: textHash(passage.text),
      vector: buildEmbedding(`${passage.source} ${passage.chapter} ${passage.text}`)
    }))
  };

  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${artifact.items.length} embeddings to ${outputPath}`);
}

await main();
