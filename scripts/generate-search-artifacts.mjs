import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const manifestPath = path.join(process.cwd(), "data", "corpus-manifest.json");
const embeddingSpecPath = path.join(process.cwd(), "src", "lib", "search", "local-embedding-spec.json");

const embeddingSpec = JSON.parse(await fs.readFile(embeddingSpecPath, "utf8"));
const phraseAnchors = embeddingSpec.phraseAnchors.map((anchor) => ({
  ...anchor,
  expressions: anchor.patterns.map((pattern) => new RegExp(pattern, "gu")),
}));
const aliasAnchors = embeddingSpec.aliasAnchors.map((anchor) => ({
  ...anchor,
  expressions: anchor.patterns.map((pattern) => new RegExp(pattern, "gu")),
}));
const sourceAnchors = embeddingSpec.sourceAnchors;
const chapterBuckets = embeddingSpec.chapterBuckets;
const ngramBuckets = embeddingSpec.ngramBuckets;
const ngramOffset = phraseAnchors.length + aliasAnchors.length + sourceAnchors.length + chapterBuckets;
const vectorSize = ngramOffset + ngramBuckets;
const stopTerms = new Set(embeddingSpec.stopTerms.map((term) => term.toLowerCase()));
const embeddingBackend = (process.env.SEARCH_EMBEDDING_BACKEND || "local").trim().toLowerCase();
const sourceSlugs = {
  "论语": "lunyu",
  "大学": "daxue",
  "中庸": "zhongyong",
  "孟子": "mengzi",
  "诗经": "shijing",
  "尚书": "shangshu",
  "周易": "zhouyi",
  "礼记": "liji",
  "仪礼": "yili",
  "周礼": "zhouli",
  "易经": "yijing",
  "春秋": "chunqiu",
  "春秋左传": "chunqiu-zuozhuan",
  "老子": "laozi",
  "道德经": "daodejing",
  "庄子": "zhuangzi",
  "墨子": "mozi",
  "荀子": "xunzi",
  "韩非子": "hanfeizi"
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

function expressionMatches(text, expression) {
  expression.lastIndex = 0;
  return expression.test(text);
}

function unique(values) {
  return Array.from(new Set(values));
}

function hashToken(token) {
  let hash = 2166136261;

  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenizeMixedText(text) {
  return Array.from(text.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
}

function buildHanNgrams(segment) {
  const characters = [...segment];
  const terms = [];

  for (const length of [2, 3, 4]) {
    for (let index = 0; index <= characters.length - length; index += 1) {
      terms.push(characters.slice(index, index + length).join(""));
    }
  }

  return terms;
}

function buildNgramTerms(text) {
  const terms = [];

  for (const token of tokenizeMixedText(text)) {
    const hanOnly = /^[\p{Script=Han}]+$/u.test(token);

    if (hanOnly) {
      if ([...token].length >= 2 && [...token].length <= 8) {
        terms.push(token);
      }

      terms.push(...buildHanNgrams(token));
      continue;
    }

    if (token.length >= 2) {
      terms.push(token);
    }
  }

  return unique(terms).filter((term) => term.length >= 2 && !stopTerms.has(term));
}

function buildChapterTerms(text) {
  return unique(
    Array.from(
      text.matchAll(/(?:第[一二三四五六七八九十百0-9]+章|[一二三四五六七八九十百0-9]+章|学而|为政|里仁|梁惠王|公孙丑|滕文公|离娄|尽心|经一章|正文)/gu),
      (match) => match[0],
    ),
  );
}

function ngramWeight(term) {
  const configuredIdf = embeddingSpec.idfTerms[term] ?? 0;

  if (configuredIdf > 0) {
    return configuredIdf * 0.16;
  }

  const length = [...term].length;

  if (length >= 4) {
    return 0.12;
  }

  if (length === 3) {
    return 0.08;
  }

  return 0.04;
}

function addWeightedFeature(vector, index, value) {
  vector[index] = (vector[index] ?? 0) + value;
}

function normalizeVector(values) {
  const magnitude = Math.hypot(...values);

  if (magnitude === 0) {
    return values.map((_, index) => (index === ngramOffset ? 1 : 0));
  }

  return values.map((value) => Number((value / magnitude).toFixed(8)));
}

function expandLocalQueryAliases(text) {
  const normalized = text.trim().toLowerCase();

  return aliasAnchors.reduce((expanded, anchor) => {
    const matched = anchor.expressions.some((expression) => expressionMatches(normalized, expression));

    return matched ? `${expanded}${anchor.expansion}` : expanded;
  }, text);
}

function buildEmbedding(text) {
  const normalized = expandLocalQueryAliases(text).trim().toLowerCase();
  const vector = Array.from({ length: vectorSize }, () => 0);

  phraseAnchors.forEach((anchor, index) => {
    const matches = anchor.expressions.reduce((sum, expression) => sum + countMatches(normalized, expression), 0);

    if (matches > 0) {
      addWeightedFeature(vector, index, matches * (anchor.weight ?? 2));
    }
  });

  aliasAnchors.forEach((anchor, index) => {
    const anchorText = `${normalized} ${anchor.terms.join(" ")}`;
    const termMatches = anchor.terms.filter((term) => normalized.includes(term.trim().toLowerCase())).length;
    const patternMatches = anchor.expressions.reduce((sum, expression) => sum + countMatches(anchorText, expression), 0);
    const matches = termMatches + patternMatches;

    if (matches > 0) {
      addWeightedFeature(vector, phraseAnchors.length + index, matches * (anchor.weight ?? 2));
    }
  });

  sourceAnchors.forEach((anchor, index) => {
    const matches = anchor.aliases.filter((alias) => normalized.includes(alias.trim().toLowerCase())).length;

    if (matches > 0) {
      addWeightedFeature(vector, phraseAnchors.length + aliasAnchors.length + index, Math.min(2, matches) * 0.7);
    }
  });

  for (const chapterTerm of buildChapterTerms(normalized)) {
    const index = phraseAnchors.length + aliasAnchors.length + sourceAnchors.length + (hashToken(chapterTerm) % chapterBuckets);
    addWeightedFeature(vector, index, 0.45);
  }

  for (const term of buildNgramTerms(normalized)) {
    const index = ngramOffset + (hashToken(term) % ngramBuckets);
    addWeightedFeature(vector, index, ngramWeight(term));
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

function passageId(passage) {
  if (passage.id) {
    return passage.id;
  }

  const { source, chapter, section } = passage;
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
        id: passageId(passage),
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
        id: passageId(passage),
        textHash: textHash(passage.text),
        vector: buildEmbedding(`${passage.source} ${passage.chapter} ${passage.text}`),
      })),
    };
  }

  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`Wrote ${artifact.items.length} embeddings (${artifact.model}, ${artifact.dimension}d) to ${outputPath}`);
}

await main();
