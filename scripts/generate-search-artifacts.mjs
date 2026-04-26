import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "data", "corpus-manifest.json");
const embeddingSpecPath = path.join(process.cwd(), "src", "lib", "search", "local-embedding-spec.json");

const embeddingSpec = JSON.parse(await fs.readFile(embeddingSpecPath, "utf8"));
const conceptPatterns = embeddingSpec.conceptPatterns.map((pattern) => new RegExp(pattern, "gu"));
const hashBuckets = embeddingSpec.hashBuckets;
const vectorSize = conceptPatterns.length + hashBuckets;
const embeddingBackend = (process.env.SEARCH_EMBEDDING_BACKEND || "local").trim().toLowerCase();
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

function resolveOutputPath(manifest) {
  const configuredPath = process.env.SEARCH_EMBEDDING_ARTIFACT_PATH?.trim();
  return configuredPath
    ? path.resolve(process.cwd(), configuredPath)
    : path.resolve(process.cwd(), manifest.embeddingArtifact.path);
}

function isRemoteUrl(value) {
  return /^https?:\/\//u.test(value);
}

function resolveRemoteEmbeddingEndpoint(rawBaseUrl) {
  const trimmed = rawBaseUrl.trim().replace(/\/$/u, "");

  if (/\/embeddings$/u.test(trimmed)) {
    return trimmed;
  }

  if (/\/chat\/completions$/u.test(trimmed)) {
    return trimmed.replace(/\/chat\/completions$/u, "/embeddings");
  }

  return `${trimmed}/embeddings`;
}

function resolveRemoteEmbeddingConfig() {
  const rawBaseUrl =
    process.env.SEARCH_EMBEDDING_BASE_URL?.trim() ||
    process.env.EMBEDDING_BASE_URL?.trim() ||
    process.env.BGE_MODEL_PATH?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "";
  const apiKey =
    process.env.SEARCH_EMBEDDING_API_KEY?.trim() ||
    process.env.EMBEDDING_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  const model =
    process.env.SEARCH_EMBEDDING_MODEL?.trim() ||
    process.env.EMBEDDING_MODEL?.trim() ||
    process.env.BGE_MODEL_REPO?.trim() ||
    "";

  if (!rawBaseUrl || !apiKey || !model || !isRemoteUrl(rawBaseUrl)) {
    throw new Error("Remote embedding generation requires a remote base URL, API key, and model.");
  }

  return {
    endpoint: resolveRemoteEmbeddingEndpoint(rawBaseUrl),
    apiKey,
    model,
  };
}

async function fetchRemoteEmbeddings(texts) {
  const config = resolveRemoteEmbeddingConfig();
  const batchSize = Number.parseInt(process.env.SEARCH_EMBEDDING_BATCH_SIZE || "16", 10);
  const vectors = [];

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: batch,
      }),
    });

    const raw = await response.text();
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }

    if (!response.ok) {
      throw new Error(`Remote embedding provider failed: ${JSON.stringify(parsed?.error ?? parsed)}`);
    }

    const batchVectors = Array.isArray(parsed?.data) ? parsed.data.map((item) => item.embedding) : [];

    if (batchVectors.length !== batch.length) {
      throw new Error(`Remote embedding batch size mismatch: expected ${batch.length}, received ${batchVectors.length}`);
    }

    for (const vector of batchVectors) {
      if (!Array.isArray(vector) || vector.length === 0 || !vector.every((item) => typeof item === "number" && Number.isFinite(item))) {
        throw new Error("Remote embedding provider returned an invalid vector.");
      }
    }

    vectors.push(...batchVectors);
  }

  return {
    model: config.model,
    dimension: vectors[0]?.length ?? 0,
    vectors,
  };
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
  const outputPath = resolveOutputPath(manifest);

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

  let artifact;

  if (embeddingBackend === "remote" || embeddingBackend === "openai" || embeddingBackend === "openai-compatible") {
    const embeddingInput = passages.map((passage) => `${passage.source} ${passage.chapter} ${passage.text}`);
    const remoteArtifact = await fetchRemoteEmbeddings(embeddingInput);

    artifact = {
      model: remoteArtifact.model,
      dimension: remoteArtifact.dimension,
      corpusVersion: manifest.version,
      items: passages.map((passage, index) => ({
        id: passageId(passage.source, passage.chapter, passage.section),
        textHash: textHash(passage.text),
        vector: remoteArtifact.vectors[index],
      })),
    };
  } else {
    if (manifest.embeddingArtifact.model !== embeddingSpec.model) {
      throw new Error(`Manifest embedding model ${manifest.embeddingArtifact.model} does not match ${embeddingSpec.model}`);
    }

    if (manifest.embeddingArtifact.dimension !== vectorSize) {
      throw new Error(`Manifest embedding dimension ${manifest.embeddingArtifact.dimension} does not match ${vectorSize}`);
    }

    artifact = {
      model: embeddingSpec.model,
      dimension: vectorSize,
      corpusVersion: manifest.version,
      items: passages.map((passage) => ({
        id: passageId(passage.source, passage.chapter, passage.section),
        textHash: textHash(passage.text),
        vector: buildEmbedding(`${passage.source} ${passage.chapter} ${passage.text}`),
      })),
    };
  }

  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${artifact.items.length} embeddings (${artifact.model}, ${artifact.dimension}d) to ${outputPath}`);
}

await main();
