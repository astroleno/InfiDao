# Phase 2 Corpus Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable Phase 2 retrieval layer for InfiDao: extensible corpus metadata, offline embedding artifacts, in-memory vector Top-K, lightweight lexical compensation, and measurable golden-query search quality.

**Architecture:** Keep the MVP search path JSON-first and deterministic. `/api/search` remains the only public search endpoint and calls the logical `SearchPort`, implemented in Phase 2 by `searchPassages()` plus local corpus/embedding artifacts loaded into a process-local index. LLMs are excluded from first recall and reserved for post-Phase-2 query rewrite, rerank, and annotation.

**Tech Stack:** Next.js 14 App Router, TypeScript, JSON/JSONL data files, Jest, current heuristic embedding fallback, future `@xenova/transformers` BGE generation as an offline script only.

---

## Source Of Truth

This plan follows the active reboot docs:

- `docs/SUPERPOWERS_REBOOT_PLAN.md`
- `docs/plans/reboot-mvp-implementation-plan.md`

It deliberately does not use the legacy LanceDB hybrid search modules as the MVP implementation path:

- `src/lib/search/index.ts`
- `src/lib/search.ts`
- `src/lib/search/hybrid.ts`
- `src/lib/db.ts`
- `src/lib/db/index.ts`

Those files can remain in the repo while Phase 2 routes avoid importing them.

## File Structure

Files to create:

- `docs/architecture/search-corpus-retrieval.md`
  Records the retrieval decision, LLM boundary, migration thresholds, and the corpus expansion model.

- `data/corpus-manifest.json`
  Versioned manifest describing corpus files, collections, and embedding artifact metadata.

- `src/lib/data/hash.ts`
  Small deterministic SHA-256 helper for passage text checksums.

- `src/lib/search/local-embedding-spec.json`
  Single source of truth for the local concept embedding model, including pattern order, hash bucket count, and deterministic query aliases.

- `src/lib/search/local-embedding.ts`
  Runtime local embedding helper used by `src/lib/search/json.ts`; it reads `local-embedding-spec.json` so query embedding semantics match generated passage artifacts.

- `src/lib/search/index-store.ts`
  Process-local singleton that loads corpus and embeddings once and exposes a typed search index.

- `src/lib/search/lexical.ts`
  Lightweight deterministic lexical scorer for exact terms, Chinese character n-grams, source, and chapter matches.

- `src/lib/search/fusion.ts`
  Deterministic result fusion for vector and lexical candidates.

- `src/lib/search/abuse-guard.ts`
  Small in-memory request guard for body-size and per-client rate limits on the public search endpoint.

- `tests/unit/utils/errors.test.ts`
  Verifies public error responses do not serialize server paths or exception causes for 5xx failures.

- `scripts/generate-search-artifacts.mjs`
  Offline artifact generator for local deterministic embeddings and v2 embedding artifact shape.

- `tests/unit/data/hash.test.ts`
- `tests/unit/search/index-store.test.ts`
- `tests/unit/search/local-embedding.test.ts`
- `tests/unit/search/lexical.test.ts`
- `tests/unit/search/fusion.test.ts`
- `tests/unit/search/abuse-guard.test.ts`
- `tests/fixtures/search-golden-queries.json`
- `tests/unit/search/golden-search.test.ts`

Files to modify:

- `src/types/index.ts`
  Add corpus metadata fields without changing the public `/api/search` response minimum fields.

- `src/lib/data/corpus.ts`
  Read manifest-aware corpus metadata while continuing to load current `data/sixclassics-sample.jsonl`.

- `src/lib/data/embeddings.ts`
  Load v2 embedding artifact shape and validate `model`, `dimension`, `corpusVersion`, `id`, and `textHash`.

- `src/lib/search/json.ts`
  Keep cosine scoring; remove request-time file loading assumptions from this file.

- `src/lib/search/service.ts`
  Use `index-store`, vector scoring, lexical scoring, and fusion behind a stable `searchPassages()` interface.

- `src/app/api/search/route.ts`
  Keep contract strict and bounded: `{ query, topK?, threshold? }`, bounded JSON body, and basic per-client rate limit.

- `src/lib/utils/errors.ts`
  Keep validation details for 4xx errors but sanitize internal details from 5xx responses.

- `tests/unit/data/corpus.test.ts`
- `tests/unit/data/embeddings.test.ts`
- `tests/unit/search/json-search.test.ts`
- `tests/integration/api/search.route.test.ts`
- `package.json`

---

## Task 1: Record The Retrieval Decision

**Files:**

- Create: `docs/architecture/search-corpus-retrieval.md`

- [ ] **Step 1: Create the architecture decision document**

Run:

```bash
mkdir -p docs/architecture
```

Write `docs/architecture/search-corpus-retrieval.md` with this content:

```markdown
# Search And Corpus Retrieval Architecture

Status: active
Date: 2026-04-24
Applies to: Phase 2 reboot MVP

## Decision

Phase 2 search uses local corpus artifacts, offline embeddings, and deterministic in-memory Top-K retrieval.

The primary retrieval path is:

query -> query embedding -> in-memory cosine scan -> lexical compensation -> deterministic fusion -> topK results

LLM calls are not part of first recall.

## Why

Search must be stable, testable, fast, and cheap before annotation and exploration depend on it.

Lite LLM search is useful for query rewrite, rerank, and explanation, but it is not deterministic enough to be the MVP search engine.

## Corpus Model

The initial collection is Six Classics. Additional classical works are added as new collection/work metadata, not as new search endpoints.

Every passage has:

- id
- source
- collection
- workId
- workTitle
- chapter
- section
- text
- textHash
- corpusVersion

The public `/api/search` response continues to expose at least:

- id
- source
- chapter
- section
- text
- score

Internal artifact metadata such as `textHash` and `corpusVersion` is not public API. It is used only for loader validation and stale-artifact detection.

## Migration Thresholds

- Under 20k passages: JSON artifact + process-local scan.
- 20k to 100k passages: local ANN index such as LanceDB, FAISS, or sqlite-vector.
- Over 100k passages or multi-user hosted search: managed vector service or pgvector.

The route contract remains stable during storage migration.

## Public Endpoint Guardrails

`POST /api/search` is public in MVP. The route must enforce:

- request body size limit of 2 KB
- `query` max length of 500 characters
- `topK` max of 10
- per-client in-memory rate limit for local MVP deployments

The in-memory rate limit is not a full production abuse system. It is the minimum guardrail for the JSON-first MVP path.

5xx errors from corpus or embedding loaders must not expose `filePath`, raw exception `cause`, or artifact internals in the public JSON response. Validation details may remain visible for 4xx request errors.

## Explicit Non-Goals

- No LanceDB dependency on the Phase 2 MVP path.
- No LLM first-recall search.
- No `/api/embed` dependency for homepage search.
- No dual request fields such as `top_k` and `topK`.
- No BGE corpus artifact unless the runtime query encoder uses the same BGE model and dimension.

## Deferred BGE Upgrade

BGE-M3 is a later artifact/model upgrade, not a Phase 2 execution task. Replacing `data/embeddings.json` with 1024-dimensional BGE vectors also requires replacing the runtime query embedding path with a matching BGE query encoder. Mixed 21-dimensional heuristic query vectors and 1024-dimensional BGE passage vectors are invalid.
```

- [ ] **Step 2: Verify the document exists**

Run:

```bash
test -f docs/architecture/search-corpus-retrieval.md
```

Expected: command exits with status `0`.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/search-corpus-retrieval.md
git commit -m "docs: record phase 2 retrieval architecture"
```

---

## Task 2: Add Text Hashing

**Files:**

- Create: `src/lib/data/hash.ts`
- Create: `tests/unit/data/hash.test.ts`

- [ ] **Step 1: Write the hash test**

Create `tests/unit/data/hash.test.ts`:

```ts
import { buildTextHash } from "@/lib/data/hash";

describe("buildTextHash", () => {
  it("returns a stable sha256 hash for normalized passage text", () => {
    expect(buildTextHash(" 学而时习之，不亦说乎？ ")).toBe(buildTextHash("学而时习之，不亦说乎？"));
    expect(buildTextHash("学而时习之，不亦说乎？")).toHaveLength(64);
  });

  it("changes when the passage text changes", () => {
    expect(buildTextHash("学而时习之")).not.toBe(buildTextHash("有朋自远方来"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/unit/data/hash.test.ts
```

Expected: FAIL because `src/lib/data/hash.ts` does not exist.

- [ ] **Step 3: Add the hash helper**

Create `src/lib/data/hash.ts`:

```ts
import crypto from "node:crypto";

export function buildTextHash(text: string): string {
  return crypto.createHash("sha256").update(text.trim(), "utf8").digest("hex");
}
```

- [ ] **Step 4: Keep type changes for Task 3**

Skip type changes in this task. Type and corpus loader changes land together in Task 3 so every commit stays green.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/data/hash.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/hash.ts tests/unit/data/hash.test.ts
git commit -m "feat: add passage text hashing"
```

---

## Task 3: Add Corpus Manifest And Manifest-Aware Loading

**Files:**

- Create: `data/corpus-manifest.json`
- Create: `tests/fixtures/empty-corpus-manifest.json`
- Modify: `src/types/index.ts`
- Modify: `src/lib/data/corpus.ts`
- Modify: `tests/unit/data/corpus.test.ts`
- Modify: `tests/unit/search/json-search.test.ts`

- [ ] **Step 1: Create the corpus manifest**

Create `data/corpus-manifest.json`:

```json
{
  "version": "sixclassics-sample-v1",
  "defaultCollection": "six_classics",
  "files": [
    {
      "path": "data/sixclassics-sample.jsonl",
      "collection": "six_classics"
    }
  ],
  "works": {
    "论语": {
      "workId": "lunyu",
      "workTitle": "论语"
    },
    "大学": {
      "workId": "daxue",
      "workTitle": "大学"
    },
    "中庸": {
      "workId": "zhongyong",
      "workTitle": "中庸"
    },
    "孟子": {
      "workId": "mengzi",
      "workTitle": "孟子"
    },
    "诗经": {
      "workId": "shijing",
      "workTitle": "诗经"
    },
    "尚书": {
      "workId": "shangshu",
      "workTitle": "尚书"
    }
  },
  "embeddingArtifact": {
    "path": "data/embeddings.json",
    "model": "infidao-local-concept-v1",
    "dimension": 21
  }
}
```

Create `tests/fixtures/empty-corpus-manifest.json`:

```json
{
  "version": "empty-fixture-v1",
  "defaultCollection": "test",
  "files": [
    {
      "path": "tests/fixtures/empty-corpus.jsonl",
      "collection": "test"
    }
  ],
  "works": {},
  "embeddingArtifact": {
    "path": "data/embeddings.json",
    "model": "infidao-local-concept-v1",
    "dimension": 3
  }
}
```

- [ ] **Step 2: Extend internal and public search types**

Modify `src/types/index.ts` so `PassageRecord` becomes the internal corpus shape:

```ts
export interface PassageRecord {
  id: string;
  source: string;
  collection: string;
  workId: string;
  workTitle: string;
  chapter: string;
  section: number;
  text: string;
  textHash: string;
  corpusVersion: string;
}
```

Replace `SearchResult extends PassageRecord` with a public response shape that does not expose artifact-integrity metadata:

```ts
export interface SearchResult {
  id: string;
  source: string;
  chapter: string;
  section: number;
  text: string;
  score: number;
}
```

- [ ] **Step 3: Update existing internal `PassageRecord` test fixtures**

Modify `tests/unit/search/json-search.test.ts` so its local corpus fixture includes the new internal metadata fields:

```ts
const basePassage = {
  collection: "six_classics",
  textHash: "0".repeat(64),
  corpusVersion: "sixclassics-sample-v1",
};

const corpus: PassageRecord[] = [
  {
    ...basePassage,
    id: "lunyu-1-1",
    source: "论语",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 1,
    text: "学而时习之，不亦说乎？",
  },
  {
    ...basePassage,
    id: "daxue-2-1",
    source: "大学",
    workId: "daxue",
    workTitle: "大学",
    chapter: "传二章",
    section: 1,
    text: "先治其国；欲治其国者，先齐其家。",
  },
  {
    ...basePassage,
    id: "zhongyong-1-4",
    source: "中庸",
    workId: "zhongyong",
    workTitle: "中庸",
    chapter: "第一章",
    section: 4,
    text: "中也者，天下之大本也；和也者，天下之达道也。",
  },
];
```

- [ ] **Step 4: Update corpus loader expectations**

Update `tests/unit/data/corpus.test.ts` so the loaded corpus is checked with manifest-derived fields:

```ts
expect(corpus).toHaveLength(20);
expect(corpus[0]).toMatchObject({
  id: "lunyu-1-1",
  source: "论语",
  collection: "six_classics",
  workId: "lunyu",
  workTitle: "论语",
  chapter: "学而篇",
  section: 1,
});
expect(corpus[0]?.textHash).toHaveLength(64);
expect(corpus[0]?.corpusVersion).toBe("sixclassics-sample-v1");

expect(corpus.find((passage) => passage.source === "大学")).toMatchObject({
  collection: "six_classics",
  workId: "daxue",
  workTitle: "大学",
});

expect(corpus.find((passage) => passage.source === "中庸")).toMatchObject({
  collection: "six_classics",
  workId: "zhongyong",
  workTitle: "中庸",
});
```

Update the unreadable and empty fixture tests to treat the argument as a manifest path:

```ts
it("fails with a typed error when the manifest is unreadable", async () => {
  await expect(loadCorpus(path.join(process.cwd(), "data", "missing-manifest.json"))).rejects.toMatchObject({
    code: "CORPUS_READ_FAILED",
    status: 500,
  });
});

it("fails with a typed error when a referenced corpus file is empty", async () => {
  const fixturePath = path.join(process.cwd(), "tests", "fixtures", "empty-corpus-manifest.json");
  await expect(loadCorpus(fixturePath)).rejects.toMatchObject({
    code: "CORPUS_EMPTY",
    status: 500,
  });
});
```

- [ ] **Step 5: Run tests to verify loader failure**

Run:

```bash
npm test -- tests/unit/data/hash.test.ts tests/unit/data/corpus.test.ts
```

Expected: FAIL until `loadCorpus()` reads `data/corpus-manifest.json` and maps each passage source through `manifest.works`.

- [ ] **Step 6: Update corpus loader implementation**

Modify `src/lib/data/corpus.ts`:

```ts
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
  works: Record<string, {
    workId: string;
    workTitle: string;
  }>;
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
```

- [ ] **Step 7: Run corpus tests**

Run:

```bash
npm test -- tests/unit/data/hash.test.ts tests/unit/data/corpus.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run type-check**

Run:

```bash
npm run type-check
```

Expected: any failures point to code constructing `PassageRecord` without the new metadata or code expecting `SearchResult` to include internal metadata. Update those call sites to use the correct internal or public type.

- [ ] **Step 9: Commit**

```bash
git add data/corpus-manifest.json tests/fixtures/empty-corpus-manifest.json src/types/index.ts src/lib/data/corpus.ts tests/unit/data/corpus.test.ts tests/unit/search/json-search.test.ts
git commit -m "feat: load corpus metadata for search"
```

---

## Task 4: Move Embeddings To A Versioned Artifact Contract

**Files:**

- Modify: `src/lib/data/embeddings.ts`
- Modify: `tests/unit/data/embeddings.test.ts`
- Create: `tests/fixtures/valid-embeddings.json`
- Modify: `tests/fixtures/malformed-embeddings.json`
- Modify: `tests/fixtures/missing-embedding.json`

- [ ] **Step 1: Update embedding loader tests**

Modify `tests/unit/data/embeddings.test.ts`:

```ts
import path from "node:path";
import { loadCorpus } from "@/lib/data/corpus";
import { loadEmbeddingArtifact, loadEmbeddingsForCorpus } from "@/lib/data/embeddings";

describe("embedding loaders", () => {
  it("loads the artifact envelope", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "valid-embeddings.json");
    const artifact = await loadEmbeddingArtifact(fixturePath);

    expect(artifact.model).toBe("infidao-local-concept-v1");
    expect(artifact.dimension).toBe(3);
    expect(artifact.corpusVersion).toBe("sixclassics-sample-v1");
    expect(artifact.items).toHaveLength(1);
  });

  it("fails with a typed error when the file is malformed", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "malformed-embeddings.json");
    await expect(loadEmbeddingArtifact(fixturePath)).rejects.toMatchObject({
      code: "EMBEDDINGS_MALFORMED",
      status: 500,
    });
  });

  it("fails with a typed error when a passage embedding is missing", async () => {
    const corpus = await loadCorpus();
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "missing-embedding.json");

    await expect(loadEmbeddingsForCorpus(corpus, fixturePath)).rejects.toMatchObject({
      code: "EMBEDDING_NOT_FOUND",
      status: 500,
    });
  });
});
```

- [ ] **Step 2: Replace embedding fixtures with v2-shape fixtures**

Replace `tests/fixtures/malformed-embeddings.json` with:

```json
{
  "model": "infidao-local-concept-v1",
  "dimension": "21",
  "corpusVersion": "sixclassics-sample-v1",
  "items": []
}
```

Create `tests/fixtures/valid-embeddings.json` with:

```json
{
  "model": "infidao-local-concept-v1",
  "dimension": 3,
  "corpusVersion": "sixclassics-sample-v1",
  "items": [
    {
      "id": "fixture-only",
      "textHash": "1111111111111111111111111111111111111111111111111111111111111111",
      "vector": [1, 0, 0]
    }
  ]
}
```

Replace `tests/fixtures/missing-embedding.json` with:

```json
{
  "model": "infidao-local-concept-v1",
  "dimension": 3,
  "corpusVersion": "sixclassics-sample-v1",
  "items": [
    {
      "id": "not-in-corpus",
      "textHash": "0000000000000000000000000000000000000000000000000000000000000000",
      "vector": [0, 0, 1]
    }
  ]
}
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- tests/unit/data/embeddings.test.ts
```

Expected: FAIL because `loadEmbeddingArtifact` is not implemented.

- [ ] **Step 4: Implement the v2 artifact loader**

Modify `src/lib/data/embeddings.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { PassageRecord } from "@/types";
import { RouteError } from "@/lib/utils/errors";

const DEFAULT_EMBEDDINGS_PATH = path.join(process.cwd(), "data", "embeddings.json");

export interface EmbeddingRecord {
  id: string;
  textHash: string;
  vector: number[];
}

export interface EmbeddingArtifact {
  model: string;
  dimension: number;
  corpusVersion: string;
  items: EmbeddingRecord[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isEmbeddingRecord(value: unknown): value is EmbeddingRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.textHash === "string" &&
    Array.isArray(candidate.vector) &&
    candidate.vector.length > 0 &&
    candidate.vector.every(isFiniteNumber)
  );
}

function isEmbeddingArtifact(value: unknown): value is EmbeddingArtifact {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.model === "string" &&
    typeof candidate.dimension === "number" &&
    typeof candidate.corpusVersion === "string" &&
    Array.isArray(candidate.items) &&
    candidate.items.length > 0 &&
    candidate.items.every(isEmbeddingRecord)
  );
}

export async function loadEmbeddingArtifact(filePath = DEFAULT_EMBEDDINGS_PATH): Promise<EmbeddingArtifact> {
  let fileContents: string;

  try {
    fileContents = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new RouteError(500, "EMBEDDINGS_READ_FAILED", "Embedding data could not be read.", {
      filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fileContents) as unknown;
  } catch (error) {
    throw new RouteError(500, "EMBEDDINGS_MALFORMED", "Embedding data must be valid JSON.", {
      filePath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isEmbeddingArtifact(parsed)) {
    throw new RouteError(500, "EMBEDDINGS_MALFORMED", "Embedding data does not match the v2 artifact shape.", {
      filePath,
    });
  }

  if (!parsed.items.every((record) => record.vector.length === parsed.dimension)) {
    throw new RouteError(500, "EMBEDDINGS_MALFORMED", "Embedding vectors must match the artifact dimension.", {
      filePath,
      dimension: parsed.dimension,
    });
  }

  return parsed;
}

export async function loadEmbeddingRecords(filePath = DEFAULT_EMBEDDINGS_PATH): Promise<EmbeddingRecord[]> {
  const artifact = await loadEmbeddingArtifact(filePath);
  return artifact.items;
}

export async function loadEmbeddingsForCorpus(
  corpus: PassageRecord[],
  filePath = DEFAULT_EMBEDDINGS_PATH,
): Promise<Map<string, number[]>> {
  const artifact = await loadEmbeddingArtifact(filePath);
  const recordMap = new Map(artifact.items.map((record) => [record.id, record]));

  for (const passage of corpus) {
    const record = recordMap.get(passage.id);

    if (!record) {
      throw new RouteError(500, "EMBEDDING_NOT_FOUND", "Embedding data is missing for a passage.", {
        filePath,
        passageId: passage.id,
      });
    }

    if (record.textHash !== passage.textHash) {
      throw new RouteError(500, "EMBEDDING_STALE", "Embedding data was generated from stale passage text.", {
        filePath,
        passageId: passage.id,
      });
    }

    if (artifact.corpusVersion !== passage.corpusVersion) {
      throw new RouteError(500, "EMBEDDING_VERSION_MISMATCH", "Embedding artifact does not match corpus version.", {
        filePath,
        passageId: passage.id,
        artifactVersion: artifact.corpusVersion,
        corpusVersion: passage.corpusVersion,
      });
    }
  }

  for (const record of artifact.items) {
    if (!corpus.some((passage) => passage.id === record.id)) {
      throw new RouteError(500, "EMBEDDING_ORPHANED", "Embedding data includes an unknown passage id.", {
        filePath,
        passageId: record.id,
      });
    }
  }

  return new Map(artifact.items.map((record) => [record.id, record.vector]));
}
```

- [ ] **Step 5: Run embedding tests**

Run:

```bash
npm test -- tests/unit/data/embeddings.test.ts
```

Expected: PASS. This task verifies the v2 loader and fixtures only; the production `data/embeddings.json` is regenerated in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/embeddings.ts tests/unit/data/embeddings.test.ts tests/fixtures/valid-embeddings.json tests/fixtures/malformed-embeddings.json tests/fixtures/missing-embedding.json
git commit -m "test: define embedding artifact contract"
```

---

## Task 5: Generate The Local Search Artifact

**Files:**

- Create: `src/lib/search/local-embedding-spec.json`
- Create: `src/lib/search/local-embedding.ts`
- Create: `tests/unit/search/local-embedding.test.ts`
- Create: `scripts/generate-search-artifacts.mjs`
- Modify: `package.json`
- Modify: `data/embeddings.json`

- [ ] **Step 1: Create the shared local embedding spec**

Create `src/lib/search/local-embedding-spec.json`:

```json
{
  "model": "infidao-local-concept-v1",
  "hashBuckets": 8,
  "conceptPatterns": [
    "学|习|修身|修|思|文|省|实践|学习|不知|不愠|三省|时习",
    "朋|友|交|来|友谊|朋友|关系",
    "君子|仁|德|忠|信|贤|善|品德|诚|义|困境|挫折|逆境|艰难",
    "孝|弟|悌|父母|家|亲",
    "国|民|政|治|天下|邦|治理|国家|管理",
    "中庸|中和|中|和|平衡|时中|大本|达道",
    "说|乐|喜|怒|哀|愠|困境|挫折|逆境|艰难|压力",
    "言|色|礼|表达|沟通",
    "慎|改|过|谨|节|勿|反省|自省|困境|挫折|逆境|压力|三省|不忠|不信",
    "道|本|命|性|教|至善|止|明德",
    "论语|孔子|学而",
    "大学|修身齐家治国平天下|明德",
    "中庸|中和"
  ],
  "queryAliases": [
    {
      "pattern": "不理解|别人不理解|被误解|没人理解",
      "replacement": " 人不知 不愠 不知"
    },
    {
      "pattern": "反省|自省|哪里做得不够|做得不够",
      "replacement": " 三省 吾日三省 不忠 不信 传不习 过勿惮改"
    },
    {
      "pattern": "学习之后|学习.*实践|实践",
      "replacement": " 学而时习 时习 学文"
    },
    {
      "pattern": "中庸和谐|和谐|平衡",
      "replacement": " 中和 中也 和也 大本 达道"
    }
  ]
}
```

- [ ] **Step 2: Create the runtime local embedding helper**

Create `tests/unit/search/local-embedding.test.ts`:

```ts
import embeddingSpec from "@/lib/search/local-embedding-spec.json";
import { buildLocalEmbedding, expandLocalQueryAliases, LOCAL_EMBEDDING_DIMENSION, LOCAL_EMBEDDING_MODEL } from "@/lib/search/local-embedding";

describe("local embedding spec", () => {
  it("uses the shared spec model and dimension", () => {
    expect(LOCAL_EMBEDDING_MODEL).toBe(embeddingSpec.model);
    expect(LOCAL_EMBEDDING_DIMENSION).toBe(embeddingSpec.conceptPatterns.length + embeddingSpec.hashBuckets);
    expect(buildLocalEmbedding("治理国家")).toHaveLength(LOCAL_EMBEDDING_DIMENSION);
  });

  it("expands deterministic modern-language aliases", () => {
    expect(expandLocalQueryAliases("面对别人不理解")).toContain("人不知");
    expect(expandLocalQueryAliases("反省自己哪里做得不够")).toContain("三省");
    expect(expandLocalQueryAliases("学习之后要实践")).toContain("学而时习");
  });
});
```

Create `src/lib/search/local-embedding.ts`:

```ts
import embeddingSpec from "@/lib/search/local-embedding-spec.json";

interface LocalEmbeddingSpec {
  model: string;
  hashBuckets: number;
  conceptPatterns: string[];
  queryAliases: Array<{
    pattern: string;
    replacement: string;
  }>;
}

const spec = embeddingSpec as LocalEmbeddingSpec;
const conceptPatterns = spec.conceptPatterns.map((pattern) => new RegExp(pattern, "gu"));
const queryAliases = spec.queryAliases.map(({ pattern, replacement }) => ({
  pattern: new RegExp(pattern, "gu"),
  replacement,
}));

export const LOCAL_EMBEDDING_MODEL = spec.model;
export const LOCAL_EMBEDDING_DIMENSION = conceptPatterns.length + spec.hashBuckets;

export function expandLocalQueryAliases(query: string): string {
  return queryAliases.reduce((expanded, { pattern, replacement }) => {
    return expanded.replace(pattern, (match) => `${match}${replacement}`);
  }, query);
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function hashToken(token: string): number {
  let hash = 2166136261;

  for (const character of token) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return Array.from(text.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.hypot(...values);

  if (magnitude === 0) {
    return values.map((_, index) => (index === conceptPatterns.length ? 1 : 0));
  }

  return values.map((value) => value / magnitude);
}

export function buildLocalEmbedding(text: string, options: { expandAliases?: boolean } = {}): number[] {
  const rawText = options.expandAliases === false ? text : expandLocalQueryAliases(text);
  const normalized = rawText.trim().toLowerCase();
  const vector = Array.from({ length: LOCAL_EMBEDDING_DIMENSION }, () => 0);

  conceptPatterns.forEach((pattern, index) => {
    vector[index] = countMatches(normalized, pattern) * 2;
  });

  for (const token of tokenize(normalized)) {
    const tokenIndex = conceptPatterns.length + (hashToken(token) % spec.hashBuckets);
    vector[tokenIndex] = (vector[tokenIndex] ?? 0) + 0.08;

    for (const character of token) {
      const characterIndex = conceptPatterns.length + (hashToken(character) % spec.hashBuckets);
      vector[characterIndex] = (vector[characterIndex] ?? 0) + 0.02;
    }
  }

  return normalizeVector(vector);
}
```

- [ ] **Step 3: Create the generator script**

Create `scripts/generate-search-artifacts.mjs`:

```js
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
```

- [ ] **Step 4: Add the npm script**

Modify `package.json` scripts:

```json
"generate-search-artifacts": "node scripts/generate-search-artifacts.mjs"
```

- [ ] **Step 5: Generate the artifact**

Run:

```bash
npm run generate-search-artifacts
```

Expected:

```text
Wrote 20 embeddings to /Users/aitoshuu/Documents/GitHub/InfiDao/data/embeddings.json
```

- [ ] **Step 6: Add the production artifact matching test**

Add this import near the existing imports in `tests/unit/data/embeddings.test.ts`:

```ts
import { buildLocalEmbedding } from "@/lib/search/local-embedding";
```

Add this test to the same file:

```ts
it("matches every production embedding to a passage id and text hash", async () => {
  const corpus = await loadCorpus();
  const embeddingMap = await loadEmbeddingsForCorpus(corpus);
  const firstPassage = corpus.find((passage) => passage.id === "lunyu-1-1");

  expect(firstPassage).toBeDefined();
  if (!firstPassage) {
    throw new Error("Expected lunyu-1-1 in the production corpus.");
  }

  expect(embeddingMap.get("lunyu-1-1")).toHaveLength(21);
  expect(embeddingMap.get("lunyu-1-1")).toEqual(
    buildLocalEmbedding(`${firstPassage.source} ${firstPassage.chapter} ${firstPassage.text}`, {
      expandAliases: false,
    }),
  );
  expect(embeddingMap.size).toBe(corpus.length);
});
```

- [ ] **Step 7: Run embedding tests**

Run:

```bash
npm test -- tests/unit/search/local-embedding.test.ts tests/unit/data/embeddings.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json src/lib/search/local-embedding-spec.json src/lib/search/local-embedding.ts tests/unit/search/local-embedding.test.ts tests/unit/data/embeddings.test.ts scripts/generate-search-artifacts.mjs data/embeddings.json
git commit -m "feat: generate versioned search artifacts"
```

---

## Task 6: Add A Process-Local Search Index

**Files:**

- Create: `src/lib/search/index-store.ts`
- Create: `tests/unit/search/index-store.test.ts`
- Modify: `src/lib/search/service.ts`

- [ ] **Step 1: Write the index-store test**

Create `tests/unit/search/index-store.test.ts`:

```ts
import { clearSearchIndexCache, loadSearchIndex } from "@/lib/search/index-store";

describe("search index store", () => {
  afterEach(() => {
    clearSearchIndexCache();
  });

  it("loads corpus and embeddings into a reusable search index", async () => {
    const first = await loadSearchIndex();
    const second = await loadSearchIndex();

    expect(first).toBe(second);
    expect(first.corpus.length).toBeGreaterThan(0);
    expect(first.embeddingMap.size).toBe(first.corpus.length);
    expect(first.dimension).toBe(21);
    expect(first.model).toBe("infidao-local-concept-v1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/unit/search/index-store.test.ts
```

Expected: FAIL because `index-store.ts` does not exist.

- [ ] **Step 3: Implement the index store**

Create `src/lib/search/index-store.ts`:

```ts
import type { PassageRecord } from "@/types";
import { loadCorpus } from "@/lib/data/corpus";
import { loadEmbeddingArtifact, loadEmbeddingsForCorpus } from "@/lib/data/embeddings";
import { LOCAL_EMBEDDING_DIMENSION, LOCAL_EMBEDDING_MODEL } from "@/lib/search/local-embedding";
import { RouteError } from "@/lib/utils/errors";

export interface SearchIndex {
  corpus: PassageRecord[];
  embeddingMap: Map<string, number[]>;
  model: string;
  dimension: number;
  corpusVersion: string;
}

let searchIndexPromise: Promise<SearchIndex> | null = null;

export async function loadSearchIndex(): Promise<SearchIndex> {
  if (!searchIndexPromise) {
    searchIndexPromise = (async () => {
      const corpus = await loadCorpus();
      const artifact = await loadEmbeddingArtifact();

      if (artifact.model !== LOCAL_EMBEDDING_MODEL || artifact.dimension !== LOCAL_EMBEDDING_DIMENSION) {
        throw new RouteError(500, "EMBEDDING_MODEL_MISMATCH", "Embedding artifact does not match the runtime query encoder.", {
          artifactModel: artifact.model,
          artifactDimension: artifact.dimension,
          runtimeModel: LOCAL_EMBEDDING_MODEL,
          runtimeDimension: LOCAL_EMBEDDING_DIMENSION,
        });
      }

      const embeddingMap = await loadEmbeddingsForCorpus(corpus);

      return {
        corpus,
        embeddingMap,
        model: artifact.model,
        dimension: artifact.dimension,
        corpusVersion: artifact.corpusVersion,
      };
    })().catch((error) => {
      searchIndexPromise = null;
      throw error;
    });
  }

  return searchIndexPromise;
}

export function clearSearchIndexCache(): void {
  searchIndexPromise = null;
}
```

- [ ] **Step 4: Update search service to use the index**

Modify `src/lib/search/service.ts`:

```ts
import { DEFAULT_SEARCH_THRESHOLD, DEFAULT_SEARCH_TOP_K, type SearchRequest, type SearchResult } from "@/types";
import { rankPassages } from "@/lib/search/json";
import { loadSearchIndex } from "@/lib/search/index-store";

export async function searchPassages({
  query,
  topK = DEFAULT_SEARCH_TOP_K,
  threshold = DEFAULT_SEARCH_THRESHOLD,
}: SearchRequest): Promise<SearchResult[]> {
  const index = await loadSearchIndex();

  return rankPassages({
    corpus: index.corpus,
    embeddingMap: index.embeddingMap,
    query,
    topK,
    threshold,
  });
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- tests/unit/search/index-store.test.ts tests/unit/search/json-search.test.ts tests/integration/api/search.route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/search/index-store.ts src/lib/search/service.ts tests/unit/search/index-store.test.ts
git commit -m "feat: cache local search index"
```

---

## Task 7: Add Lightweight Lexical Compensation

**Files:**

- Create: `src/lib/search/lexical.ts`
- Create: `tests/unit/search/lexical.test.ts`

- [ ] **Step 1: Write lexical scorer tests**

Create `tests/unit/search/lexical.test.ts`:

```ts
import type { PassageRecord } from "@/types";
import { rankLexicalCandidates } from "@/lib/search/lexical";

const base = {
  collection: "six_classics",
  corpusVersion: "sixclassics-sample-v1",
  textHash: "0".repeat(64),
};

const corpus: PassageRecord[] = [
  {
    ...base,
    id: "lunyu-1-1",
    source: "论语",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 1,
    text: "学而时习之，不亦说乎？",
  },
  {
    ...base,
    id: "daxue-1-1",
    source: "大学",
    workId: "daxue",
    workTitle: "大学",
    chapter: "经一章",
    section: 1,
    text: "大学之道，在明明德，在亲民，在止于至善。",
  },
  {
    ...base,
    id: "lunyu-1-4",
    source: "论语",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 4,
    text: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
  },
];

describe("rankLexicalCandidates", () => {
  it("rewards exact source and text matches", () => {
    const results = rankLexicalCandidates(corpus, "大学 明德", 5);

    expect(results[0]).toMatchObject({
      id: "daxue-1-1",
    });
    expect(results[0]?.lexicalScore).toBeGreaterThan(0);
  });

  it("returns an empty list when there is no lexical overlap", () => {
    expect(rankLexicalCandidates(corpus, "星际跃迁", 5)).toEqual([]);
  });

  it("uses deterministic classical aliases without promoting arbitrary single-character matches", () => {
    const results = rankLexicalCandidates(corpus, "反省自己哪里做得不够", 5);

    expect(results[0]?.id).toBe("lunyu-1-4");
    expect(results[0]?.matchedTerms).toEqual(expect.arrayContaining(["三省", "不忠", "不信"]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/unit/search/lexical.test.ts
```

Expected: FAIL because `src/lib/search/lexical.ts` does not exist.

- [ ] **Step 3: Implement lexical ranking**

Create `src/lib/search/lexical.ts`:

```ts
import type { PassageRecord } from "@/types";
import { expandLocalQueryAliases } from "@/lib/search/local-embedding";

export interface LexicalCandidate extends PassageRecord {
  lexicalScore: number;
  matchedTerms: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function buildQueryTerms(query: string): string[] {
  const normalized = normalize(expandLocalQueryAliases(query));
  const tokenTerms = Array.from(normalized.matchAll(/[\p{Script=Han}\p{Letter}\p{Number}]+/gu), (match) => match[0]);
  const hanCharacters = Array.from(normalized.matchAll(/\p{Script=Han}/gu), (match) => match[0]);
  const bigrams = hanCharacters.slice(0, -1).map((character, index) => `${character}${hanCharacters[index + 1]}`);

  return unique([...tokenTerms, ...bigrams]).filter((term) => term.length >= 2);
}

function scorePassage(passage: PassageRecord, terms: string[]): LexicalCandidate | null {
  const haystack = normalize(`${passage.source} ${passage.workTitle} ${passage.chapter} ${passage.text}`);
  const matchedTerms = terms.filter((term) => haystack.includes(term));

  if (matchedTerms.length === 0) {
    return null;
  }

  const exactSourceBoost = terms.includes(normalize(passage.source)) || terms.includes(normalize(passage.workTitle)) ? 0.35 : 0;
  const exactChapterBoost = terms.includes(normalize(passage.chapter)) ? 0.2 : 0;
  const overlapScore = matchedTerms.reduce((score, term) => score + Math.min(term.length / 4, 1), 0) / terms.length;
  const lexicalScore = Math.min(1, overlapScore + exactSourceBoost + exactChapterBoost);

  return {
    ...passage,
    lexicalScore: Number(lexicalScore.toFixed(4)),
    matchedTerms,
  };
}

export function rankLexicalCandidates(corpus: PassageRecord[], query: string, limit: number): LexicalCandidate[] {
  const terms = buildQueryTerms(query);

  if (terms.length === 0) {
    return [];
  }

  return corpus
    .map((passage) => scorePassage(passage, terms))
    .filter((candidate): candidate is LexicalCandidate => candidate !== null)
    .sort((left, right) => right.lexicalScore - left.lexicalScore)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run lexical tests**

Run:

```bash
npm test -- tests/unit/search/lexical.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/lexical.ts tests/unit/search/lexical.test.ts
git commit -m "feat: add lexical search compensation"
```

---

## Task 8: Fuse Vector And Lexical Candidates

**Files:**

- Create: `src/lib/search/fusion.ts`
- Create: `tests/unit/search/fusion.test.ts`
- Modify: `src/lib/search/json.ts`
- Modify: `src/lib/search/service.ts`

- [ ] **Step 1: Write fusion tests**

Create `tests/unit/search/fusion.test.ts`:

```ts
import type { SearchResult } from "@/types";
import type { LexicalCandidate } from "@/lib/search/lexical";
import { fuseSearchResults } from "@/lib/search/fusion";

const publicBase = {
  source: "论语",
  chapter: "学而篇",
  section: 1,
  text: "学而时习之，不亦说乎？",
};

const passageBase = {
  ...publicBase,
  collection: "six_classics",
  workId: "lunyu",
  workTitle: "论语",
  textHash: "0".repeat(64),
  corpusVersion: "sixclassics-sample-v1",
};

describe("fuseSearchResults", () => {
  it("merges duplicate vector and lexical candidates", () => {
    const vectorResults: SearchResult[] = [
      {
        ...publicBase,
        id: "lunyu-1-1",
        score: 0.72,
      },
    ];
    const lexicalResults: LexicalCandidate[] = [
      {
        ...passageBase,
        id: "lunyu-1-1",
        lexicalScore: 0.8,
        matchedTerms: ["学"],
      },
    ];

    const fused = fuseSearchResults(vectorResults, lexicalResults, 5, 0.3);

    expect(fused).toHaveLength(1);
    expect(fused[0]?.id).toBe("lunyu-1-1");
    expect(fused[0]?.score).toBeGreaterThan(0.72);
  });

  it("keeps lexical-only candidates when they pass the fused threshold", () => {
    const fused = fuseSearchResults([], [
      {
        ...passageBase,
        id: "lunyu-1-1",
        lexicalScore: 0.9,
        matchedTerms: ["论语"],
      },
    ], 5, 0.3);

    expect(fused.map((result) => result.id)).toEqual(["lunyu-1-1"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/unit/search/fusion.test.ts
```

Expected: FAIL because `src/lib/search/fusion.ts` does not exist.

- [ ] **Step 3: Implement fusion**

Create `src/lib/search/fusion.ts`:

```ts
import type { SearchResult } from "@/types";
import type { LexicalCandidate } from "@/lib/search/lexical";

export function fuseSearchResults(
  vectorResults: SearchResult[],
  lexicalResults: LexicalCandidate[],
  topK: number,
  threshold: number,
): SearchResult[] {
  const merged = new Map<string, SearchResult & { vectorScore?: number; lexicalScore?: number }>();

  for (const result of vectorResults) {
    merged.set(result.id, {
      ...result,
      vectorScore: result.score,
      lexicalScore: 0,
    });
  }

  for (const result of lexicalResults) {
    const existing = merged.get(result.id);

    if (existing) {
      existing.lexicalScore = Math.max(existing.lexicalScore ?? 0, result.lexicalScore);
      existing.score = Number(Math.min(1, existing.score + result.lexicalScore * 0.18).toFixed(4));
      continue;
    }

    merged.set(result.id, {
      id: result.id,
      source: result.source,
      chapter: result.chapter,
      section: result.section,
      text: result.text,
      score: Number((result.lexicalScore * 0.72).toFixed(4)),
      vectorScore: 0,
      lexicalScore: result.lexicalScore,
    });
  }

  return Array.from(merged.values())
    .filter((result) => result.score >= threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK)
    .map(({ vectorScore: _vectorScore, lexicalScore: _lexicalScore, ...result }) => result);
}
```

- [ ] **Step 4: Update vector ranker to use the shared local embedding helper**

Modify `src/lib/search/json.ts` so it imports and re-exports the shared helper created in Task 5:

```ts
import { buildLocalEmbedding } from "@/lib/search/local-embedding";

export function buildQueryEmbedding(query: string): number[] {
  return buildLocalEmbedding(query);
}
```

Delete the old local query embedding constants and helpers from `json.ts` (`CONCEPT_PATTERNS`, `HASH_BUCKETS`, `VECTOR_SIZE`, `countMatches`, `hashToken`, `tokenize`, and `normalizeVector`). After this step, `json.ts` must not define any concept pattern order of its own.

Then replace the return mapping inside `rankPassages()` so it does not spread the full internal `PassageRecord` into the public result:

```ts
return corpus
  .map((passage) => {
    const passageVector = embeddingMap.get(passage.id);

    if (!passageVector) {
      throw new RouteError(500, "EMBEDDING_NOT_FOUND", "Embedding data is missing for a passage.", {
        passageId: passage.id,
      });
    }

    return {
      id: passage.id,
      source: passage.source,
      chapter: passage.chapter,
      section: passage.section,
      text: passage.text,
      score: Number(cosineSimilarity(queryVector, passageVector).toFixed(4)),
    };
  })
  .filter((passage) => passage.score >= threshold)
  .sort((left, right) => right.score - left.score)
  .slice(0, topK);
```

- [ ] **Step 5: Update search service**

Modify `src/lib/search/service.ts`:

```ts
import { DEFAULT_SEARCH_THRESHOLD, DEFAULT_SEARCH_TOP_K, type SearchRequest, type SearchResult } from "@/types";
import { fuseSearchResults } from "@/lib/search/fusion";
import { rankLexicalCandidates } from "@/lib/search/lexical";
import { rankPassages } from "@/lib/search/json";
import { loadSearchIndex } from "@/lib/search/index-store";

export async function searchPassages({
  query,
  topK = DEFAULT_SEARCH_TOP_K,
  threshold = DEFAULT_SEARCH_THRESHOLD,
}: SearchRequest): Promise<SearchResult[]> {
  const index = await loadSearchIndex();
  const candidateLimit = Math.max(topK * 4, 20);

  const vectorResults = rankPassages({
    corpus: index.corpus,
    embeddingMap: index.embeddingMap,
    query,
    topK: candidateLimit,
    threshold: Math.max(0, threshold * 0.7),
  });
  const lexicalResults = rankLexicalCandidates(index.corpus, query, candidateLimit);

  return fuseSearchResults(vectorResults, lexicalResults, topK, threshold);
}
```

- [ ] **Step 6: Run search tests**

Run:

```bash
npm test -- tests/unit/search/lexical.test.ts tests/unit/search/fusion.test.ts tests/unit/search/json-search.test.ts tests/integration/api/search.route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/search/fusion.ts src/lib/search/json.ts src/lib/search/service.ts tests/unit/search/fusion.test.ts
git commit -m "feat: fuse vector and lexical search"
```

---

## Task 9: Add Golden Query Search Tests

**Files:**

- Create: `tests/fixtures/search-golden-queries.json`
- Create: `tests/unit/search/golden-search.test.ts`

- [ ] **Step 1: Create golden query fixture**

Create `tests/fixtures/search-golden-queries.json`:

```json
[
  {
    "query": "治理国家",
    "expectedTop1Ids": ["daxue-2-2"],
    "requiredTop3Ids": ["daxue-2-2", "daxue-2-1"],
    "bannedTop3Ids": ["zhongyong-1-2"],
    "minResults": 2
  },
  {
    "query": "朋友相处要诚信",
    "expectedTop1Ids": ["lunyu-1-4", "lunyu-1-7"],
    "requiredTop3Ids": ["lunyu-1-4", "lunyu-1-7"],
    "bannedTop3Ids": ["daxue-2-2"],
    "minResults": 2
  },
  {
    "query": "面对别人不理解",
    "expectedTop1Ids": ["lunyu-1-1"],
    "requiredTop3Ids": ["lunyu-1-1"],
    "bannedTop3Ids": ["daxue-2-2", "zhongyong-4-1"],
    "minResults": 1
  },
  {
    "query": "修身齐家治国平天下",
    "expectedTop1Ids": ["daxue-2-1", "daxue-2-2"],
    "requiredTop3Ids": ["daxue-2-1", "daxue-2-2"],
    "bannedTop3Ids": ["zhongyong-3-1"],
    "minResults": 2
  },
  {
    "query": "中庸和谐",
    "expectedTop1Ids": ["zhongyong-1-4"],
    "requiredTop3Ids": ["zhongyong-1-4", "zhongyong-1-3", "zhongyong-2-1"],
    "bannedTop3Ids": ["daxue-2-2"],
    "minResults": 2
  },
  {
    "query": "反省自己哪里做得不够",
    "expectedTop1Ids": ["lunyu-1-4", "lunyu-1-8"],
    "requiredTop3Ids": ["lunyu-1-4", "lunyu-1-8"],
    "bannedTop3Ids": ["daxue-2-2", "zhongyong-4-1"],
    "minResults": 1
  },
  {
    "query": "学习之后要实践",
    "expectedTop1Ids": ["lunyu-1-1"],
    "requiredTop3Ids": ["lunyu-1-1", "lunyu-1-6"],
    "bannedTop3Ids": ["daxue-2-2", "zhongyong-4-1"],
    "minResults": 2
  },
  {
    "query": "什么是至善",
    "expectedTop1Ids": ["daxue-1-1"],
    "requiredTop3Ids": ["daxue-1-1"],
    "bannedTop3Ids": ["lunyu-1-5"],
    "minResults": 1
  }
]
```

- [ ] **Step 2: Add golden query test**

Create `tests/unit/search/golden-search.test.ts`:

```ts
import goldenQueries from "../../fixtures/search-golden-queries.json";
import { searchPassages } from "@/lib/search/service";

describe("golden search queries", () => {
  it.each(goldenQueries)(
    "meets ranking and false-positive gates for $query",
    async ({ query, expectedTop1Ids, requiredTop3Ids, bannedTop3Ids, minResults }) => {
      const results = await searchPassages({
        query,
        topK: 5,
        threshold: 0.25,
      });

      const resultIds = results.map((result) => result.id);
      const top3Ids = resultIds.slice(0, 3);

      expect(results.length).toBeGreaterThanOrEqual(minResults);
      expect(expectedTop1Ids).toContain(resultIds[0]);

      for (const requiredId of requiredTop3Ids) {
        expect(top3Ids).toContain(requiredId);
      }

      for (const bannedId of bannedTop3Ids) {
        expect(top3Ids).not.toContain(bannedId);
      }
    },
  );
});
```

- [ ] **Step 3: Run golden tests**

Run:

```bash
npm test -- tests/unit/search/golden-search.test.ts
```

Expected: PASS. If a query fails, inspect the returned ranked list and decide whether the retrieval logic or the fixture expectation is wrong. Do not weaken this test back to "any expected id somewhere in top five" or "one expected id somewhere in top three".

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/search-golden-queries.json tests/unit/search/golden-search.test.ts
git commit -m "test: add golden search queries"
```

---

## Task 10: Keep The Public Search API Strict And Bounded

**Files:**

- Modify: `src/lib/utils/errors.ts`
- Create: `tests/unit/utils/errors.test.ts`
- Create: `src/lib/search/abuse-guard.ts`
- Create: `tests/unit/search/abuse-guard.test.ts`
- Modify: `src/app/api/search/route.ts`
- Modify: `tests/integration/api/search.route.test.ts`

- [ ] **Step 1: Add public error sanitization tests**

Create `tests/unit/utils/errors.test.ts`:

```ts
import { buildErrorResponse, RouteError } from "@/lib/utils/errors";

describe("buildErrorResponse", () => {
  it("keeps validation details for 4xx errors", async () => {
    const response = buildErrorResponse(new RouteError(400, "VALIDATION_ERROR", "Bad request.", {
      fieldErrors: {
        query: ["Required"],
      },
    }));

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: {
            query: ["Required"],
          },
        },
      },
    });
  });

  it("omits internal details for 5xx errors", async () => {
    const response = buildErrorResponse(new RouteError(500, "EMBEDDINGS_READ_FAILED", "Embedding data could not be read.", {
      filePath: "/Users/aitoshuu/Documents/GitHub/InfiDao/data/embeddings.json",
      cause: "ENOENT: no such file or directory",
    }));

    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: "EMBEDDINGS_READ_FAILED",
        message: "Embedding data could not be read.",
      },
    });
    expect(payload.error).not.toHaveProperty("details");
    expect(JSON.stringify(payload)).not.toContain("/Users/");
    expect(JSON.stringify(payload)).not.toContain("ENOENT");
  });
});
```

- [ ] **Step 2: Sanitize 5xx error details**

Modify `buildErrorResponse()` in `src/lib/utils/errors.ts`:

```ts
export function buildErrorResponse(error: unknown): Response {
  const normalized = normalizeError(error);
  const exposeDetails = normalized.status < 500 && normalized.details !== undefined;
  const apiError: ApiError = {
    code: normalized.code,
    message: normalized.message,
    ...(exposeDetails ? { details: normalized.details } : {}),
  };

  return Response.json(
    {
      success: false,
      error: apiError,
    },
    { status: normalized.status },
  );
}
```

- [ ] **Step 3: Add abuse guard tests**

Create `tests/unit/search/abuse-guard.test.ts`:

```ts
import { checkSearchRequestBudget, resetSearchAbuseGuard, SEARCH_BODY_LIMIT_BYTES } from "@/lib/search/abuse-guard";

describe("search abuse guard", () => {
  afterEach(() => {
    resetSearchAbuseGuard();
  });

  it("rejects oversized request bodies", () => {
    let error: unknown;

    try {
      checkSearchRequestBudget({
        clientKey: "local",
        bodyBytes: SEARCH_BODY_LIMIT_BYTES + 1,
        now: 1000,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "REQUEST_TOO_LARGE",
      status: 413,
    });
  });

  it("rate limits repeated requests from the same client", () => {
    for (let index = 0; index < 30; index += 1) {
      expect(checkSearchRequestBudget({
        clientKey: "client-a",
        bodyBytes: 100,
        now: 1000,
      })).toBeUndefined();
    }

    let error: unknown;

    try {
      checkSearchRequestBudget({
        clientKey: "client-a",
        bodyBytes: 100,
        now: 1000,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });
});
```

- [ ] **Step 4: Implement the abuse guard**

Create `src/lib/search/abuse-guard.ts`:

```ts
import { RouteError } from "@/lib/utils/errors";

export const SEARCH_BODY_LIMIT_BYTES = 2048;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

interface CheckSearchRequestBudgetOptions {
  clientKey: string;
  bodyBytes: number;
  now?: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

export function checkSearchRequestBudget({
  clientKey,
  bodyBytes,
  now = Date.now(),
}: CheckSearchRequestBudgetOptions): void {
  if (bodyBytes > SEARCH_BODY_LIMIT_BYTES) {
    throw new RouteError(413, "REQUEST_TOO_LARGE", "Search request body is too large.", {
      limitBytes: SEARCH_BODY_LIMIT_BYTES,
    });
  }

  const bucket = buckets.get(clientKey);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(clientKey, {
      windowStart: now,
      count: 1,
    });
    return;
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    throw new RouteError(429, "RATE_LIMITED", "Too many search requests. Try again shortly.");
  }
}

export function resetSearchAbuseGuard(): void {
  buckets.clear();
}
```

- [ ] **Step 5: Update route parsing to enforce body and rate limits**

Modify `src/app/api/search/route.ts` so parsing reads bounded text and uses client headers:

```ts
import { z } from "zod";
import { checkSearchRequestBudget, SEARCH_BODY_LIMIT_BYTES } from "@/lib/search/abuse-guard";
import { searchPassages } from "@/lib/search/service";
import { buildSuccessResponse } from "@/lib/utils/errors";
import { buildErrorResponse } from "@/lib/utils/errors";
import { RouteError } from "@/lib/utils/errors";

const SearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    topK: z.number().int().min(1).max(10).optional(),
    threshold: z.number().min(0).max(1).optional(),
  })
  .strict();

function getClientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anonymous";
}

async function readBoundedText(request: Request): Promise<{ body: string; bodyBytes: number }> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);

    if (Number.isFinite(declaredBytes) && declaredBytes > SEARCH_BODY_LIMIT_BYTES) {
      throw new RouteError(413, "REQUEST_TOO_LARGE", "Search request body is too large.");
    }
  }

  if (!request.body) {
    return {
      body: "",
      bodyBytes: 0,
    };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bodyBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bodyBytes += value.byteLength;

      if (bodyBytes > SEARCH_BODY_LIMIT_BYTES) {
        throw new RouteError(413, "REQUEST_TOO_LARGE", "Search request body is too large.");
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
  } catch (error) {
    if (error instanceof RouteError) {
      throw error;
    }

    throw new RouteError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  return {
    body,
    bodyBytes,
  };
}

async function parseBoundedJson(request: Request): Promise<unknown> {
  const { body, bodyBytes } = await readBoundedText(request);

  checkSearchRequestBudget({
    clientKey: getClientKey(request),
    bodyBytes,
  });

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RouteError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = SearchRequestSchema.parse(await parseBoundedJson(request));
    const results = await searchPassages({
      query: payload.query,
      ...(payload.topK !== undefined ? { topK: payload.topK } : {}),
      ...(payload.threshold !== undefined ? { threshold: payload.threshold } : {}),
    });
    return buildSuccessResponse(results);
  } catch (error) {
    return buildErrorResponse(error);
  }
}
```

- [ ] **Step 6: Update integration request helper**

Modify the imports and helper in `tests/integration/api/search.route.test.ts`:

```ts
import { resetSearchAbuseGuard } from "@/lib/search/abuse-guard";

afterEach(() => {
  resetSearchAbuseGuard();
});
```

```ts
function createRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
```

- [ ] **Step 7: Add response and non-leakage assertions**

Extend the valid request test in `tests/integration/api/search.route.test.ts`:

```ts
const payload = await response.json();

expect(payload).toMatchObject({
  success: true,
  data: expect.arrayContaining([
    expect.objectContaining({
      id: "daxue-2-2",
      source: "大学",
      chapter: expect.any(String),
      section: expect.any(Number),
      text: expect.any(String),
      score: expect.any(Number),
    }),
  ]),
});

expect(payload.data[0]).not.toHaveProperty("textHash");
expect(payload.data[0]).not.toHaveProperty("corpusVersion");
```

- [ ] **Step 8: Add a legacy-field rejection test**

Ensure `tests/integration/api/search.route.test.ts` contains:

```ts
it("rejects legacy field aliases", async () => {
  const response = await POST(
    createRequest({
      query: "治理国家",
      top_k: 3,
      hybrid: true,
    }),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({
    success: false,
    error: expect.objectContaining({
      code: "VALIDATION_ERROR",
    }),
  });
});
```

- [ ] **Step 9: Add abuse-control integration tests**

Add these tests to `tests/integration/api/search.route.test.ts`:

```ts
it("rejects oversized request bodies", async () => {
  const response = await POST(createRequest(`{"query":"${"治".repeat(3000)}"}`));

  expect(response.status).toBe(413);
  await expect(response.json()).resolves.toMatchObject({
    success: false,
    error: expect.objectContaining({
      code: "REQUEST_TOO_LARGE",
    }),
  });
});

it("rate limits repeated requests from one client", async () => {
  for (let index = 0; index < 30; index += 1) {
    const response = await POST(createRequest({
      query: "治理国家",
      topK: 1,
      threshold: 0.25,
    }, {
      "x-forwarded-for": "203.0.113.10",
    }));
    expect(response.status).toBe(200);
  }

  const limited = await POST(createRequest({
    query: "治理国家",
    topK: 1,
    threshold: 0.25,
  }, {
    "x-forwarded-for": "203.0.113.10",
  }));

  expect(limited.status).toBe(429);
});
```

- [ ] **Step 10: Run guard and integration tests**

Run:

```bash
npm test -- tests/unit/utils/errors.test.ts tests/unit/search/abuse-guard.test.ts tests/integration/api/search.route.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/utils/errors.ts src/lib/search/abuse-guard.ts src/app/api/search/route.ts tests/unit/utils/errors.test.ts tests/unit/search/abuse-guard.test.ts tests/integration/api/search.route.test.ts
git commit -m "feat: guard public search endpoint"
```

---

## Task 11: Full Verification

**Files:**

- No source edits unless verification fails.

- [ ] **Step 1: Regenerate artifacts**

Run:

```bash
npm run generate-search-artifacts
```

Expected:

```text
Wrote 20 embeddings to /Users/aitoshuu/Documents/GitHub/InfiDao/data/embeddings.json
```

- [ ] **Step 2: Run targeted search test suite**

Run:

```bash
npm test -- tests/unit/data/hash.test.ts tests/unit/data/corpus.test.ts tests/unit/data/embeddings.test.ts tests/unit/search/index-store.test.ts tests/unit/search/lexical.test.ts tests/unit/search/fusion.test.ts tests/unit/search/json-search.test.ts tests/unit/search/golden-search.test.ts tests/unit/search/abuse-guard.test.ts tests/unit/utils/errors.test.ts tests/integration/api/search.route.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full project checks**

Run:

```bash
npm run type-check
npm run lint
npm test
```

Expected: all commands pass.

- [ ] **Step 4: Manual API smoke test**

Start the app:

```bash
npm run dev
```

In another terminal, run:

```bash
curl -s http://localhost:3000/api/search \
  -H 'content-type: application/json' \
  -d '{"query":"治理国家","topK":5,"threshold":0.25}' | jq
```

Expected: JSON response with `success: true` and at least one result containing `id`, `source`, `chapter`, `section`, `text`, and `score`.

- [ ] **Step 5: Commit verification-only fixes**

If verification required source fixes, commit them:

```bash
git add src tests data package.json scripts docs
git commit -m "chore: verify phase 2 search path"
```

If no source fixes were needed, skip this commit.

---

## Deferred Backlog: BGE Artifact Upgrade

This is not part of Phase 2 execution.

BGE-M3 may replace the local concept embedding artifact later, but only as a paired change:

- offline corpus embedding generation writes `model: "BAAI/bge-m3"` and `dimension: 1024`
- runtime query embedding uses the same BGE model and returns 1024-dimensional vectors
- `rankPassages()` rejects model or dimension mismatch before scoring
- golden-query tests must improve or preserve top-1 and top-3 gates

Do not merge a BGE corpus artifact while the runtime query embedding path still uses `buildQueryEmbedding()` from the 21-dimensional local concept model.

---

## Self-Review

Spec coverage:

- Stable local vector retrieval: Tasks 4, 5, 6, 8.
- Corpus expansion beyond current sample: Tasks 2 and 3, plus the deferred BGE backlog note.
- Hybrid retrieval without LLM first recall: Tasks 7 and 8.
- Strict and bounded Phase 2 API contract: Task 10.
- Tests and measurable quality: Tasks 6, 7, 8, 9, 11.
- Future vector database migration boundary: Task 1.

Placeholder scan:

- No task depends on an unnamed owner.
- Every file creation task includes concrete content.
- Every code task includes a command and expected outcome.

Type consistency:

- `PassageRecord` gains metadata fields and `SearchResult` deliberately does not inherit them.
- `EmbeddingArtifact.items[].textHash` matches `PassageRecord.textHash`.
- `/api/search` request remains `query`, `topK`, and `threshold`.

---

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-04-24-phase-2-corpus-search.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, faster iteration.
2. **Inline Execution** - execute tasks in this session using `superpowers:executing-plans`, with checkpoints after each task group.
