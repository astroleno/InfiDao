# Graphify-Inspired Search Sidecar Implementation Plan

Status: proposed
Date: 2026-05-13
Scope: InfiDao retrieval, annotation links, and explorable relation context

## Goal

Add a small, deterministic knowledge-graph sidecar to InfiDao search so annotation links can be extended through graph relations without replacing the current JSON-first search path. Search explanations remain post-MVP.

The primary search path stays:

```text
query -> query embedding -> in-memory vector scan -> lexical candidates -> fusion -> topK results
```

The graph sidecar adds:

```text
topK passage ids -> graph neighbors / relation hints -> exploration links
```

A small curated concept seed sits beside the graph artifact:

```text
concept seed data -> graph concept nodes + mentions edges
```

Post-MVP, an intent registry may be added to migrate frontend query bridges, backend aliases, and UI entry prompts. That registry is not part of the MVP.

## Why This Plan

The current search stack is stable and test-covered, but still demo-sized: local concept embeddings, simple lexical matching, fixed fusion weights, and no active graph retrieval. `graphify-7` is useful because it models nodes, edges, provenance, confidence, communities, and graph traversal. It should be borrowed as an architecture pattern, not dropped into the Next.js request path as a Python runtime dependency.

## MVP Boundary

Phase 0 is a pre-MVP prerequisite. The MVP implementation is limited to Phases 1-4:

```text
guardrails -> artifact contract -> offline generator -> runtime graph service -> annotation graph links
```

MVP success means annotation links can use graph neighbors with fail-open lexical fallback, while existing `/api/search` behavior and response shape remain unchanged.

Phases 5-6 are post-MVP experiments:

- Search result explanation and diversity.
- Graph-assisted score boosts.
- Server-side query bridge migration.
- Intent registry, entry prompts, backend alias generation, and user prompt overlays.

These experiments must not block the MVP and must stay behind tests or internal flags until proven.

## Non-Goals

- Do not replace `/api/search` with Graphify, NetworkX, LanceDB, or an LLM-first search service.
- Do not add prompt-picker style substring search, popularity sorting, or remote prompt syncing to `/api/search`.
- Do not use the current `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, or any code graph as product search data.
- Do not expose inferred graph edges as facts without confidence labeling.
- Do not let user overlay mutate canonical corpus text, graph artifact edges, registry concepts, or confidence labels.
- Do not revive legacy `top_k`, `hybrid`, or old LanceDB search contracts.
- Do not build a full visual graph product before annotation links and result explanations work.
- Do not include Phases 5-6 in the first MVP delivery.
- Do not include `query_intent` nodes, entry prompts, backend alias generation, or query bridge migration in the first MVP delivery.

## Source Context

Current InfiDao search:

- `src/lib/search/service.ts`: orchestrates index loading, query encoding, vector ranking, lexical ranking, and fusion.
- `src/lib/search/index-store.ts`: process-local JSON corpus and embedding cache.
- `src/lib/search/local-embedding.ts`: deterministic concept/hash embedding model.
- `src/lib/search/lexical.ts`: alias, token, Chinese bigram, and source/chapter lexical compensation.
- `src/lib/search/fusion.ts`: deterministic vector/lexical fusion.
- `src/app/api/search/route.ts`: strict public search contract `{ query, topK?, threshold? }`.
- `src/lib/annotation/service.ts`: currently builds extension links from lexical candidates, not graph neighbors.

Graphify-7 patterns to borrow:

- Plain node/edge graph schema with provenance and confidence.
- Community labels and bridge nodes as exploration signals.
- BFS/DFS neighbor expansion with small token or result budgets.
- `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` confidence separation.
- Post-MVP `shortest_path` style explanations for why two concepts or passages relate.

Post-MVP prompt-picker style patterns to borrow:

- A versioned default library for reusable concepts, query intents, and entry prompts.
- Local user overlay semantics such as hidden, pinned, and custom entries without mutating canonical data.
- Simple keyword-based auto-classification as an offline generator rule, not a runtime search engine.
- Artifact signatures for cache invalidation and update diagnostics.

## Architecture Decision

Create a TypeScript/JSON graph sidecar that is generated offline and loaded alongside the existing search index.

The runtime should be simple:

- Load `data/search-graph.json` once per process through `loadSearchGraphForIndex(index, { required: false })`.
- Reuse the already-loaded `SearchIndex` from `loadSearchIndex()` so graph validation shares the same corpus, `corpusVersion`, and `textHash` data as the active search path.
- Build adjacency maps in memory.
- Traverse only 1 hop per MVP request, with depth 2 reserved for post-MVP explanation work.
- Prefer `EXTRACTED` edges for ranking and display.
- Treat `INFERRED` edges as weak exploration hints.
- Sanitize every graph-originated label, rationale, and relation hint before it reaches API or UI.
- Cap graph link output per passage.
- Keep all graph enhancement behind internal service calls.

The MVP concept seed should also be simple:

- Load versioned concept seed data from `data/search-concepts.json` during artifact generation.
- Treat concept seed files as product content, not application code.
- Generate concept nodes and direct `mentions` edges from curated patterns only when they match passage text or metadata.
- Keep any future intent registry or user overlay data out of the MVP graph artifact.

## Fail-Open Strategy

The graph sidecar is optional at runtime. It must never break the current search or annotation experience by default.

Runtime behavior:

- `loadSearchGraphForIndex(index, { required: false })` is the default for app code.
- Missing file, invalid JSON, schema mismatch, corpus mismatch, text hash mismatch, duplicate node id, dangling edge, or unsupported relation disables the sidecar for that process.
- When disabled, annotation links and search continue through the existing lexical/vector paths.
- The loader should return a typed disabled state such as `{ enabled: false, reason }`, not throw in default runtime mode.
- Log a concise warning once per process; do not spam per request.

Phase 0 pollution boundary:

- Product graph generation must never scan repository source, `ref/`, generated bundles, `graphify-out`, or the current developer code graph.
- `.graphifyignore` is only a hygiene aid for developer graphify/code-navigation runs.
- The product generator hard-codes its input boundary to `data/corpus-manifest.json`, the manifest-declared corpus files, and `data/search-concepts.json`.
- `data/search-graph.json` is a generated product artifact; code-navigation graph output is not product search data.

Strict behavior:

- `loadSearchGraphForIndex(index, { required: true })` is used by tests, CI, release checks, and artifact generation smoke tests.
- Required mode throws typed errors for missing/corrupt/stale artifacts.
- Required mode should fail CI on dangling edges, stale `textHash`, orphan passage nodes, or corpus version mismatch.

Concept seed behavior:

- Missing or invalid concept seed files should fail graph generation.
- Runtime graph loading should not depend on concept seed files once `data/search-graph.json` has been generated.
- Concept seed schema changes must bump `conceptSeedVersion` and the graph artifact signature.

## Concept Seed

Create one versioned seed file for curated concepts:

```json
{
  "schemaVersion": 1,
  "conceptSeedVersion": "search-concepts-v1",
  "concepts": [
    {
      "id": "learning-and-practice",
      "label": "学与实践",
      "conceptGroup": "learning-and-practice",
      "keywords": ["学", "习", "实践", "传不习"],
      "mentionPatterns": ["学而时习|时习之|传不习|温故而知新"]
    }
  ]
}
```

Concept seed rules:

- `concept.id` must be stable and unique.
- `mentionPatterns` may generate `EXTRACTED` `mentions` edges only when they match passage text or metadata directly.
- `mentionPatterns` must not be naked single-character patterns. Prefer phrases, named concepts, or context-bounded expressions with golden precision fixtures.
- `conceptGroup` is a curated topic grouping, not a graph clustering result.
- Any generated passage affinity beyond direct text or metadata matches remains `INFERRED` and is not exposed through MVP `relationHint`.
- Intent registry, backend aliases, UI entry prompts, and user overlays are deferred to Phase 6.

Suggested concept seed files:

- `data/search-concepts.json`
- `src/lib/search/concepts/schema.ts`
- `src/lib/search/concepts/load.ts`

## Proposed Data Model

Create a versioned graph artifact:

```json
{
  "schemaVersion": 1,
  "corpusVersion": "sixclassics-sample-v1",
  "conceptSeedVersion": "search-concepts-v1",
  "artifactSignature": "sha256:...",
  "generatedAt": "2026-05-13T00:00:00.000Z",
  "sourceManifestPath": "data/corpus-manifest.json",
  "nodes": [
    {
      "id": "passage:lunyu-1-1",
      "type": "passage",
      "label": "论语 学而 1",
      "passageId": "lunyu-1-1",
      "workId": "lunyu",
      "chapter": "学而",
      "textHash": "f9e4c2...",
      "provenance": {
        "source": "corpus-manifest",
        "sourceFile": "data/sixclassics-sample.jsonl"
      }
    },
    {
      "id": "concept:learning-and-practice",
      "type": "concept",
      "label": "学与实践",
      "conceptGroup": "learning-and-practice",
      "provenance": {
        "source": "concept-seed",
        "sourceFile": "data/search-concepts.json"
      }
    }
  ],
  "edges": [
    {
      "id": "mentions:passage:lunyu-1-1->concept:learning-and-practice",
      "source": "passage:lunyu-1-1",
      "target": "concept:learning-and-practice",
      "relation": "mentions",
      "confidence": "EXTRACTED",
      "weight": 1,
      "sourcePassageId": "lunyu-1-1",
      "rationale": "Passage explicitly discusses learning and practice.",
      "provenance": {
        "source": "concept-seed-pattern",
        "sourceFile": "data/search-concepts.json"
      }
    }
  ]
}
```

`textHash` format:

- `textHash` must exactly equal `buildTextHash(passage.text)`.
- Current `buildTextHash()` returns lowercase SHA-256 hex without a prefix.
- Do not store `sha256:` in passage `textHash`.
- The `sha256:` prefix is reserved for `artifactSignature`.

`artifactSignature` format:

- `artifactSignature` is `"sha256:" + sha256(canonicalPayload)`.
- `canonicalPayload` excludes `artifactSignature` and `generatedAt`.
- `canonicalPayload` includes schema version, corpus version, concept seed version, `sourceManifestPath`, sorted complete node records, and sorted complete edge records.
- Complete edge records include `id`, `source`, `target`, `relation`, `confidence`, `weight`, `sourcePassageId`, `rationale`, and `provenance`.
- Nodes are sorted by `id`; edges are sorted by `id`.
- `canonicalJson()` must recursively sort object keys lexicographically and normalize all strings to Unicode NFC before hashing.
- Arrays of record objects are sorted by stable `id`; scalar arrays are sorted lexicographically only when the schema defines them as set-like.
- Unknown fields are rejected by schema validation before canonicalization; do not silently include or drop them.
- Any semantic change to nodes, edges, rationale, provenance, weights, confidence labels, or source passage hashes must change the signature.

Artifact validation requirements:

- `corpusVersion` must match the loaded corpus manifest.
- `conceptSeedVersion` must match the concept seed used during artifact generation.
- `artifactSignature` must validate against the canonical payload.
- Every `passage` node must map to a real `PassageRecord.id`.
- Every `passage` node must include the current passage `textHash`.
- Every graph `textHash` must match `buildTextHash()` output for the corresponding corpus passage.
- Every passage in the corpus may have zero graph edges, but every graph passage node must be backed by corpus data.
- Every edge must include a stable `id`.
- Every edge endpoint must reference an existing node.
- Every edge must use a known relation and confidence value.
- Generator output must not contain `ref/`, `_nuxt`, `node_modules`, minified bundle symbols, or source-code function nodes.

Initial node types:

| Type      | Purpose                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| `passage` | Searchable corpus passage, mapped to `PassageRecord.id`.                                |
| `work`    | Classical work such as `lunyu`, `daxue`, or `zhongyong`.                                |
| `chapter` | Work-local chapter grouping.                                                            |
| `concept` | Curated concept such as learning, ritual, virtue, governance; may carry `conceptGroup`. |

Initial edge types:

| Relation         | Confidence Default | Purpose                                                             |
| ---------------- | ------------------ | ------------------------------------------------------------------- |
| `contains`       | `EXTRACTED`        | Work contains chapter, chapter contains passage.                    |
| `mentions`       | `EXTRACTED`        | Passage directly mentions a concept by curated pattern or metadata. |
| `resonates_with` | `INFERRED`         | Passage has curated semantic affinity with a concept or passage.    |
| `contrasts_with` | `INFERRED`         | Passage is useful as a contrast.                                    |
| `adjacent_to`    | `EXTRACTED`        | Nearby passages in the same chapter or sequence.                    |

## Public API Strategy

MVP should not change `/api/search` response shape. Graph data is used internally for diagnostics and annotation links.

For MVP annotation links:

- Only `EXTRACTED` graph edges may be converted into the existing `AnnotationLink.relationHint` string.
- `INFERRED` and `AMBIGUOUS` edges remain internal unless a future API shape can label confidence explicitly.
- If confidence cannot be shown, do not expose the edge.

Post-MVP, add optional metadata only after tests lock the behavior:

```ts
interface SearchResultExplanation {
  relationHints?: Array<{
    relation: string;
    targetLabel: string;
    confidence: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
    rationale?: string;
  }>;
  communities?: string[];
}
```

`communities` here means future detected graph communities, not curated `conceptGroup` labels. Do not overload `conceptGroup`, UI prompt `tags`, and detected community ids.

If annotation needs confidence/provenance in the UI, add a typed field such as `AnnotationLink.relationMeta` instead of overloading `relationHint`.

Do not accept new request fields until there is a concrete UI and tests for them.

## Sanitization And Runtime Limits

Graph artifacts are generated offline, but they still become API/UI text. Treat graph labels, rationales, and hints as untrusted display data.

Runtime limits:

- Maximum graph links per annotation response: 3.
- Maximum graph neighbors inspected per passage: 20.
- MVP traversal depth: 1 hop. Depth 2 and shortest-path traversal belong to Phase 5.
- Maximum display label length: 80 characters after trimming.
- Maximum relation string length: 40 characters.
- Maximum rationale length: 240 characters.
- Maximum final `relationHint` length: 180 characters.

Sanitization rules:

- Strip ASCII control characters except regular whitespace.
- Normalize whitespace runs to a single space.
- Normalize strings to Unicode NFC.
- Never render graph-originated strings through `dangerouslySetInnerHTML`.
- If graph strings are ever rendered into HTML/Markdown outside React text nodes, escape HTML-sensitive characters first.

Tests:

- Add a malicious graph fixture with control characters, long labels, long rationale, and HTML-looking text.
- Verify service output is trimmed, bounded, and safe as plain text.

## Milestones

| #   | Milestone                          | Success Criteria                                                                               |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | MVP: Graph Artifact Contract       | Schema, fixture, fail-open loader, and validation tests exist.                                 |
| 2   | MVP: Offline Graph Generator       | `data/search-graph.json` can be regenerated from current corpus and concept seed only.         |
| 3   | MVP: Graph Runtime Service         | In-memory adjacency lookup supports bounded neighbors and relation hints.                      |
| 4   | MVP: Annotation Link Upgrade       | `AnnotationLink.relationHint` can come from `EXTRACTED` graph neighbors with lexical fallback. |
| 5   | Post-MVP: Search Rerank Experiment | Optional graph boost/diversity pass is tested but not exposed as a public contract.            |
| 6   | Post-MVP: Query Bridge Migration   | Frontend hardcoded query bridges can be replaced by an intent registry and generated edges.    |

## Phase 0: Guardrails And Cleanup

| Task                                                         | Effort | Depends On | Done Criteria                                                                                                                                                       |
| ------------------------------------------------------------ | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Establish graph pollution hard gate                          | 2h     | None       | Product graph generator reads only `data/corpus-manifest.json` and declared corpus files; it never scans repo source, `ref/`, generated bundles, or `graphify-out`. |
| Establish graph seed input boundary                          | 1h     | None       | MVP generator may read only loaded corpus data plus `data/search-concepts.json`; it does not read `local-embedding-spec.json` or app source patterns.               |
| Add graph hygiene recommendation for developer graphify runs | 1h     | None       | `.graphifyignore` guidance exists for code-navigation graphs, but product artifact generation does not rely on it.                                                  |
| Document current active search path                          | 1h     | None       | Plan references active files and explicitly excludes legacy modules.                                                                                                |
| Confirm API contract constraints                             | 1h     | None       | Plan states `/api/search` remains `{ query, topK?, threshold? }`.                                                                                                   |

## Phase 1: Graph Artifact Contract

| Task                                                                         | Effort | Depends On | Done Criteria                                                                                                                                            |
| ---------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define `SearchGraphNode`, `SearchGraphEdge`, and `SearchGraphArtifact` types | 3h     | Phase 0    | Types cover node id, type, label, passage metadata, `textHash`, provenance, edge relation, confidence, weight, and rationale.                            |
| Add graph fixture under `tests/fixtures`                                     | 2h     | Types      | Fixture includes passage, work, chapter, concept, `textHash`, provenance, stable edge ids, and mixed confidence edges.                                   |
| Implement fail-open graph artifact loader                                    | 4h     | Types      | `loadSearchGraphForIndex(index, { required: false })` returns disabled state on missing/corrupt/stale artifacts; `required: true` throws typed errors.   |
| Add stale/orphan validation                                                  | 3h     | Loader     | Loader checks corpus version, passage ids, `textHash`, duplicate ids, dangling endpoints, relation values, and confidence values.                        |
| Add unit tests for malformed graph artifacts                                 | 4h     | Loader     | Missing file, invalid JSON, missing endpoint, invalid confidence, duplicate ids, stale `textHash`, orphan passage node, and corpus mismatch are covered. |

Suggested files:

- `src/lib/search/graph/types.ts`
- `src/lib/search/graph/store.ts`
- `tests/fixtures/search-graph.valid.json`
- `tests/fixtures/search-graph.invalid.json`
- `tests/unit/search/graph-store.test.ts`

## Phase 2: Offline Graph Generator

| Task                                                | Effort | Depends On          | Done Criteria                                                                                                                                                                                                     |
| --------------------------------------------------- | ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generate structural nodes from corpus manifest only | 3h     | Phase 1             | Work, chapter, and passage nodes are produced deterministically from `loadCorpus()` output and declared corpus files only.                                                                                        |
| Generate `contains` and `adjacent_to` edges         | 2h     | Structural nodes    | Every passage has chapter/work context and stable sequence neighbors.                                                                                                                                             |
| Add concept seed schema                             | 3h     | Phase 1             | `data/search-concepts.json` validates stable ids, labels, keywords, concept groups, and mention patterns.                                                                                                         |
| Generate first curated concept mappings             | 4h     | Concept seed schema | Concepts are derived only from concept seed `mentionPatterns` when passage text or metadata matches directly.                                                                                                     |
| Add concept precision fixtures                      | 3h     | Concept mappings    | Each seed concept has at least one positive and one negative fixture; naked single-character patterns are rejected.                                                                                               |
| Bind passage nodes to `textHash`                    | 2h     | Structural nodes    | Every passage node carries the same pure-hex `textHash` as `PassageRecord`, using the shared `buildTextHash()` helper.                                                                                            |
| Compute graph artifact signature                    | 3h     | Edge generation     | Signature changes when corpus hashes, concept seed version, node records, edge records, rationale, provenance, weights, or confidence labels change.                                                              |
| Write artifact to `data/search-graph.json`          | 2h     | Edge generation     | Script output is stable and pretty-printed.                                                                                                                                                                       |
| Add TypeScript generator runner                     | 2h     | Script              | Add `tsx` or equivalent runner and expose `npm run generate-search-graph` as `tsx scripts/generate-search-graph.ts`; generator imports `loadCorpus()` and `buildTextHash()` instead of copying corpus/hash logic. |
| Add generator smoke test                            | 4h     | Script              | Test verifies node/edge counts, concept seed provenance, no dangling edges, valid hex `textHash`, stable signature, and no `ref/`, bundle, or code-symbol nodes.                                                  |
| Add canonical signature tests                       | 3h     | Signature           | Same semantic payload with different field order has the same signature; changed rationale/provenance/weight/confidence changes the signature.                                                                    |

Suggested files:

- `data/search-graph.json`
- `data/search-concepts.json`
- `src/lib/search/concepts/schema.ts`
- `src/lib/search/concepts/load.ts`
- `scripts/generate-search-graph.ts`
- `package.json`
- `tests/unit/search/search-graph-generator.test.ts`

## Phase 3: Runtime Graph Service

| Task                                     | Effort | Depends On      | Done Criteria                                                                                                                                        |
| ---------------------------------------- | ------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build adjacency maps from real artifact  | 2h     | Phase 2         | Lookup by node id and passage id is O(1) using `data/search-graph.json` validated against the active `SearchIndex`.                                  |
| Connect loader to active search index    | 2h     | Phase 2         | `loadSearchGraphForIndex(index, options)` receives the `SearchIndex` from `loadSearchIndex()` and does not reimplement corpus manifest/hash loading. |
| Implement `getPassageNeighbors()`        | 3h     | Adjacency       | Returns bounded neighbors filtered by relation and confidence.                                                                                       |
| Implement `buildRelationHints()`         | 3h     | Neighbor lookup | Produces concise relation hints suitable for UI and annotation links.                                                                                |
| Implement output sanitization and limits | 3h     | Relation hints  | Labels, rationales, and relation hints are normalized, stripped of control characters, and length-limited before return.                             |
| Add disabled-sidecar behavior            | 2h     | Loader          | Service methods return empty graph results when loader is disabled in fail-open mode.                                                                |
| Add traversal and service smoke tests    | 3h     | Service         | Neighbor traversal cannot explode on dense graphs; real fixture artifact returns expected neighbors.                                                 |
| Add malicious artifact fixture tests     | 3h     | Sanitization    | Malicious graph strings are sanitized and output counts stay bounded.                                                                                |

Suggested files:

- `src/lib/search/graph/service.ts`
- `tests/unit/search/graph-service.test.ts`

## Phase 4: Annotation Link Upgrade

| Task                                                                     | Effort | Depends On   | Done Criteria                                                                                                                                          |
| ------------------------------------------------------------------------ | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add graph link lookup inside annotation service                          | 3h     | Phase 3      | Current passage can get depth 1 graph neighbors only; depth 2/path lookups stay out of MVP.                                                            |
| Preserve lexical fallback for every graph failure mode                   | 3h     | Graph lookup | Missing, disabled, corrupt, stale, or sparse graph results all fall back to existing lexical candidate logic.                                          |
| Filter visited passages                                                  | 2h     | Link merge   | Graph links do not repeat `visitedPassageIds` or current passage.                                                                                      |
| Populate `AnnotationLink.relationHint` only from `EXTRACTED` graph edges | 2h     | Link merge   | UI gets relation text without changing annotation API shape; inferred edges are not shown as unlabeled facts.                                          |
| Refactor annotation cache to cache LLM copy only                         | 4h     | Link merge   | Cache stores stable LLM-generated text/meta without graph links; graph links are rebuilt after cache hit so artifact updates cannot serve stale links. |
| Add graph-link golden fixtures                                           | 4h     | Link merge   | Tests cover relevant, non-duplicate, confidence-safe links and lexical fallback.                                                                       |

Primary target:

- `src/lib/annotation/service.ts`
- `src/lib/annotation/cache.ts`
- `tests/unit/annotation/cache.test.ts`

## Phase 5: Post-MVP Search Result Explanation And Diversity

| Task                                            | Effort | Depends On      | Done Criteria                                                                                                  |
| ----------------------------------------------- | ------ | --------------- | -------------------------------------------------------------------------------------------------------------- |
| Add internal graph metadata to fused candidates | 3h     | Phase 3         | Candidate can carry community and relation hints before final projection.                                      |
| Implement post-MVP path lookup                  | 4h     | Phase 3         | Adds `findPassagePaths()` or equivalent shortest-path explanation helper outside the MVP annotation-link path. |
| Add path explanation tests                      | 3h     | Path lookup     | Tests cover bounded depth, no-path behavior, and sanitized path explanation output.                            |
| Add optional graph diversity pass               | 4h     | Metadata        | Top-K avoids unnecessary same-community duplicates when scores are close.                                      |
| Add optional graph boost                        | 4h     | Metadata        | Strong `EXTRACTED` concept/path evidence can apply a small bounded boost.                                      |
| Keep public response unchanged by default       | 1h     | Boost/diversity | Existing API integration tests still pass.                                                                     |
| Add golden tests for graph-assisted ranking     | 4h     | Boost/diversity | Baseline relevance does not regress; diversity improves selected fixtures.                                     |

Primary targets:

- `src/lib/search/service.ts`
- `src/lib/search/fusion.ts`
- `tests/unit/search/golden-search.test.ts`

## Phase 6: Post-MVP Query Bridge Migration

| Task                                               | Effort | Depends On             | Done Criteria                                                                                                                                                |
| -------------------------------------------------- | ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Define intent registry schema                      | 4h     | Phase 4                | Registry covers query intents, backend aliases, UI empty-state entries, bridge summaries, fallback behavior, and entry prompt tags.                          |
| Promote intent registry to runtime source of truth | 4h     | Intent registry schema | Existing frontend bridges, backend aliases, UI empty-state entries, bridge summaries, and fallback behavior can be read from the registry with parity tests. |
| Generate backend aliases from registry             | 3h     | Intent registry        | `queryAliases`, graph intent edges, and UI entry prompts can be compared for parity.                                                                         |
| Add server-side query intent expansion helper      | 3h     | Phase 3                | Query expansion can be done before vector/lexical ranking.                                                                                                   |
| Move bridge attempts behind search service         | 4h     | Helper                 | Frontend no longer needs multiple search attempts for known bridge intents.                                                                                  |
| Add optional local entry-prompt overlay            | 4h     | Parity proven          | User preferences can hide or pin registry entry prompts without changing registry or graph artifact data.                                                    |
| Keep fallback behavior until parity is proven      | 2h     | Service bridge         | Existing home-page search tests remain green.                                                                                                                |

Primary target:

- `src/app/page.tsx`
- `src/lib/search/service.ts`
- `src/lib/search/graph/service.ts`
- `data/search-intents.json`

## Verification Plan

Run after Phase 1:

```bash
npm run type-check
npm test -- --runInBand
```

Run after Phase 2 and later:

```bash
npm run generate-search-graph
npm run type-check
npm test -- --runInBand
```

MVP required tests to add or update:

- Graph artifact loader rejects invalid schema and dangling edges.
- Graph artifact loader fails open in runtime mode and throws in required mode.
- Graph artifact loader rejects stale pure-hex `textHash`, orphan passage nodes, invalid artifact signatures, and corpus version mismatch.
- Concept seed loader rejects duplicate ids and invalid mention patterns.
- Concept precision fixtures reject naked single-character patterns and broad false positives.
- Generator smoke tests prove artifact nodes only come from corpus manifest and concept seed files and never from `ref/`, bundles, source symbols, or `graphify-out`.
- Graph generator uses the TypeScript runtime path and imports shared corpus/hash helpers.
- Canonical signature tests cover recursive key ordering, Unicode normalization, unknown-field rejection, and semantic-change detection.
- Graph service returns bounded neighbors and sanitized relation hints.
- Annotation links prefer `EXTRACTED` graph relations and fall back to lexical links on disabled or sparse graphs.
- Annotation cache stores only LLM copy; graph links are rebuilt after cache hits.
- Existing golden search queries do not regress.
- `/api/search` rejects legacy fields and keeps strict response contract.

MVP manual checks:

- Search "自律与痛苦" still returns relevant passages.
- Annotation links show relation hints when graph edges exist.
- Same passage does not appear as its own extension link.
- Results do not become dominated by inferred edges.

Post-MVP verification:

- Registry-generated aliases match current bridge behavior before frontend bridge constants are removed.
- Path explanation tests cover shortest-path output.
- Graph-assisted ranking golden tests prove optional boost/diversity does not regress baseline relevance.

## Dependency Map

```text
Phase 0: Guardrails (pre-MVP prerequisite)
  -> Phase 1: Graph Contract
    -> Phase 2: Offline Generator
      -> Phase 3: Runtime Service
        -> Phase 4: Annotation Links
          -> Phase 5: Search Diversity / Boost (post-MVP)
          -> Phase 6: Query Bridge Migration (post-MVP)
```

## Risks And Mitigation

| Risk                                            | Impact | Probability | Mitigation                                                                                                                     |
| ----------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Graph pollution from reference/generated files  | High   | High        | Do not use current code graph as product graph; generate domain graph only from corpus artifacts.                              |
| Inferred edges mislead users                    | High   | Medium      | Show confidence, rank `EXTRACTED` first, use `INFERRED` only as weak signal.                                                   |
| Sidecar artifact missing or corrupt             | Medium | Medium      | Runtime loader fails open and disables graph features; CI required mode catches it before release.                             |
| Sidecar artifact silently stale                 | High   | Medium      | Bind passage nodes to `textHash` and fail required validation on mismatch.                                                     |
| Concept pattern false positives                 | Medium | Medium      | Reject naked single-character patterns and require precision fixtures for each seed concept.                                   |
| Registry drift creates duplicate query behavior | Medium | Medium      | Keep intent registry post-MVP; add parity tests before deleting frontend bridge constants or backend aliases.                  |
| User overlay mutates canonical semantics        | High   | Low         | Keep overlay outside graph artifacts; allow hide/pin/custom entry prompts only, never passage text or edge confidence changes. |
| Annotation cache serves stale links             | Medium | Medium      | Cache only LLM copy; rebuild graph links after retrieving cached content.                                                      |
| Graph traversal adds request latency            | Medium | Medium      | Precompute adjacency maps and cap MVP traversal at 1 hop; keep depth 2 and shortest-path work post-MVP.                        |
| Search ranking regresses                        | High   | Medium      | Keep graph pass optional and protect with golden-query tests.                                                                  |
| API contract drifts                             | Medium | Medium      | Do not add request fields until UI and tests need them.                                                                        |
| MVP scope expands into graph UI                 | Medium | High        | First ship graph value through annotation links and relation hints.                                                            |

## Rollout Strategy

1. Land graph loader and generator with no runtime behavior change and required-mode CI validation.
2. Land the concept seed as generator input, with no UI or public API behavior change.
3. Use graph only in annotation links, with fail-open lexical fallback.
4. Keep MVP complete after Phase 4 once graph links are stable.
5. Add hidden graph metadata to search candidates for diagnostics only after MVP.
6. Enable graph diversity/boost behind an internal flag only after golden-query parity.
7. Replace frontend query bridge retries only after the shared intent registry matches current behavior.
8. Add user entry-prompt overlay only after registry-backed entry prompts are stable.

## Definition Of Done

MVP done:

- `data/search-graph.json` can be regenerated deterministically.
- Product graph generation reads only corpus manifest files.
- Product graph generation reads concept seed data only from `data/search-concepts.json`.
- Concept seed file validates before graph generation.
- Graph artifact signature includes corpus hashes, concept seed version, complete node records, and complete edge records.
- Canonical signature tests prove field order stability and semantic-change sensitivity.
- Passage graph nodes include `textHash` and provenance.
- Passage graph `textHash` values exactly match `buildTextHash()` pure hex output.
- Graph-originated labels, rationales, and relation hints are sanitized and length-limited.
- Annotation graph links are capped to 3 per response.
- Graph loader validates against the active `SearchIndex` from `loadSearchIndex()`.
- Graph loader supports fail-open runtime mode and strict required mode.
- Graph loader and service have unit coverage.
- Annotation links can use graph neighbors and still fall back to lexical ranking.
- Existing `/api/search` integration tests pass unchanged.
- Relation hints come only from `EXTRACTED` edges unless a future `relationMeta` field exposes confidence.
- Annotation cache stores only LLM copy and cannot serve stale graph links after artifact changes.
- No Python or NetworkX dependency is added to the Next.js request path.

Post-MVP done:

- Golden search queries do not regress with graph diversity or boost enabled.
- Query bridge migration has an intent registry that generates graph edges, backend aliases, and UI fallback entries.
- Optional user overlay can hide or pin entry prompts without mutating canonical corpus, registry, or graph artifact data.
