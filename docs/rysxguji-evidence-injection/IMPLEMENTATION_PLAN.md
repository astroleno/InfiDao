# Rysxguji Online Evidence Injection Implementation Plan

Date: 2026-05-19

## Goal

Add `ref/rysxguji` as an online, server-side external classical-text evidence source for annotation generation.

This plan does not add rysxguji texts to `data/corpus-manifest.json`, does not regenerate embeddings, and does not change the local search index. The first implementation should enrich annotation responses with short, linked source excerpts fetched from external guji sources, starting with Daizhige.

## Decision

Use rysxguji as an online evidence injection layer in `/api/annotate`, not as an embeddings-backed corpus expansion.

Reasoning:

- Current product flow is `query -> local search -> selected passage -> annotation`.
- External guji evidence is most useful when generating the annotation explanation and citations.
- Current `/api/search` response is intentionally local and compact.
- Ingesting external texts into embeddings is a later, separate path for stable high-value works.

## Inputs Used

Skills used:

- `rysxguji`: external guji source workflow and Daizhige usage rules.
- `architecture-strategist`: integration boundary and layering review.
- `project-planner`: phased implementation plan, tasks, dependencies, risks.

Agents used:

- Architecture explorer: reviewed current API, search, annotation, cache, types, UI boundaries.
- Testing/risk explorer: reviewed test strategy, performance budget, failure fallback, security, source attribution.

Graph context:

- `graphify-out/GRAPH_REPORT.md` is `compressed,dataless` and blocks reads on this machine.
- `graphify-out/graph.json` was used for god-node and community navigation before raw file reads.

## Fresh Performance Test Results

Environment:

- Secondary annotation model configured as `gemini-3.1-flash-lite-preview`.
- Provider key was present in `.env`; key value was not printed.
- Daizhige requests require a real User-Agent. Python `urllib` without explicit User-Agent produced zero usable evidence in the first rerun.

Test shape:

- Three realistic annotation scenarios.
- Each scenario generated three guji search terms.
- Terms were queried concurrently against `https://daizhige.org/api/search`.
- Top evidence excerpts were injected into flash-lite.

Cold online results with User-Agent:

| Case | Search Wall | Model Time | Total | Evidence | Search Status |
| --- | ---: | ---: | ---: | ---: | --- |
| 困境 | 6.580s | 2.736s | 9.318s | 3 | 3/3 OK |
| 修身 | 2.713s | 2.370s | 5.083s | 3 | 3/3 OK |
| 不被理解 | 4.081s | 3.049s | 7.131s | 3 | 3/3 OK |

Summary:

- Search median: 4.081s.
- Model median: 2.736s.
- Total median: 7.131s.
- Total max: 9.318s.

JSON output test:

- `max_tokens=180` caused invalid JSON because the response was truncated.
- `response_format: { "type": "json_object" }` alone did not fix truncation.
- `max_tokens=360` plus strict short-answer instructions returned valid JSON in 2.068s.

Implication:

- Cold online evidence injection is feasible, but it is not a 5s p95 path.
- Product should support explicit external evidence mode, caching, and graceful timeout.
- If the MVP must preserve current fast annotation latency, external evidence should be disabled by default or limited to cache hits / short timeout.

## Architecture Overview

Current local search path:

- `/api/search` validates `query/topK/threshold` and calls local search.
- `src/lib/search/service.ts` runs vector + lexical search over local in-memory corpus.
- `src/lib/search/index-store.ts` loads `data/corpus-manifest.json` and `data/embeddings.json`.

Current annotation path:

- `/api/annotate` validates `query/passageId/passageText/style/visitedPassageIds`.
- `src/lib/annotation/service.ts` builds annotation copy, cache, telemetry, and links.
- `src/lib/annotation/llm.ts` builds the LLM prompt and calls OpenAI-compatible chat completions.
- `src/components/annotation/AnnotationPanel.tsx` is the right UI surface for external source display.

Architectural rule:

- Keep `/api/search` and local corpus retrieval stable.
- Add external guji evidence as annotation enrichment.
- Do not mix external web links into internal annotation navigation links.

## Proposed Data Contract

```ts
export type ExternalGujiProvider = "daizhige";

export type ExternalGujiStatus =
  | "disabled"
  | "hit"
  | "miss"
  | "timeout"
  | "error";

export interface ExternalGujiCitation {
  provider: ExternalGujiProvider;
  title: string;
  collection?: string;
  chapter?: string;
  url: string;
  quote: string;
  matchedTerms: string[];
  retrievedAt: string;
  verificationStatus: "search_snippet" | "page_verified";
}

export interface ExternalGujiEvidenceBundle {
  status: ExternalGujiStatus;
  query: string;
  citations: ExternalGujiCitation[];
  elapsedMs: number;
  cacheHit: boolean;
  warnings?: string[];
}

export interface AnnotationExternalSourceOptions {
  enabled?: boolean;
  mode?: "fast" | "balanced";
  limit?: number;
  providers?: ExternalGujiProvider[];
}
```

`AnnotationResult` should gain:

```ts
externalEvidence?: ExternalGujiEvidenceBundle;
```

## Runtime Modes

Use two modes rather than pretending one latency budget fits all:

| Mode | Purpose | Search Budget | Expected Cold Total | Behavior |
| --- | --- | ---: | ---: | --- |
| `fast` | Protect current annotation speed | 1500-2000ms | Usually no cold evidence | Return local annotation if external search misses timeout |
| `balanced` | User opted into stronger external sourcing | 6500-7000ms | 5-10s | Wait for evidence, then call flash-lite with citations |

Default recommendation:

- Ship behind `ANNOTATION_EXTERNAL_SOURCES=off`.
- Enable `fast` in UI only after tests pass.
- Add `balanced` for explicit “加强信源” interactions or internal evaluation.

## Module Plan

Create:

- `src/lib/external-guji/types.ts`
- `src/lib/external-guji/config.ts`
- `src/lib/external-guji/daizhige-client.ts`
- `src/lib/external-guji/query-expander.ts`
- `src/lib/external-guji/normalizer.ts`
- `src/lib/external-guji/cache.ts`
- `src/lib/external-guji/service.ts`

Modify:

- `src/types/index.ts`
- `src/app/api/annotate/route.ts`
- `src/lib/annotation/service.ts`
- `src/lib/annotation/llm.ts`
- `src/lib/annotation/cache.ts`
- `src/lib/annotation/telemetry.ts`
- `src/components/annotation/AnnotationPanel.tsx`
- `src/app/page.tsx`

Avoid modifying:

- `data/corpus-manifest.json`
- `data/embeddings.json`
- `data/search-graph.json`
- `src/lib/search/index-store.ts`
- `src/lib/search/service.ts` in the first implementation
- `src/components/search/ResultCard.tsx`
- `src/components/annotation/AnnotationLinks.tsx`

## Implementation Phases

### Phase 1: External Guji Service Foundation

Goal: fetch and normalize Daizhige evidence without touching annotation behavior.

| Task | Effort | Depends On | Done Criteria |
| --- | ---: | --- | --- |
| Define external guji types | 2h | None | Types compile and are exported from a single module |
| Add config resolver | 3h | Types | Env flags, timeout, limits, mode defaults are validated |
| Implement query expander | 4h | Types | Generates quoted classical search terms from query + selected passage |
| Implement Daizhige client | 6h | Config | Uses HTTPS, User-Agent, quoted `q`, timeout, host allowlist |
| Implement normalizer | 4h | Client | Strips HTML, truncates quotes, builds canonical Daizhige URLs |
| Implement in-memory cache | 4h | Types | TTL, defensive copy, cache key by normalized terms/options |
| Unit tests for service layer | 6h | All above | Client/normalizer/cache tests pass |

Phase 1 notes:

- Daizhige search terms must be wrapped in English double quotes.
- Use `fetch` with explicit `User-Agent`; tests showed default Python UA failed to produce evidence.
- Do not fetch full book pages in the synchronous path.

### Phase 2: Annotation Integration

Goal: allow `/api/annotate` to request server-side external evidence.

| Task | Effort | Depends On | Done Criteria |
| --- | ---: | --- | --- |
| Extend annotate request schema | 3h | Phase 1 types | Accepts optional `externalSources`; rejects client-submitted evidence |
| Extend annotation result type | 2h | Phase 1 types | Response can include `externalEvidence` |
| Integrate evidence service in `createAnnotation` | 6h | Phase 1 service | Evidence fetched before LLM only when enabled |
| Update annotation cache key | 4h | Evidence integration | Cache distinguishes evidence mode/status/hash |
| Extend LLM input and prompt | 5h | Evidence integration | Prompt includes citations as evidence, not instructions |
| Add JSON output guard | 4h | LLM update | Parses valid JSON, strips fences if present, handles truncation |
| Annotation tests | 6h | All above | Hit/miss/timeout/cache tests pass |

Prompt requirements:

- External text must be labeled as citation material, not instructions.
- Model may cite only supplied evidence.
- If no evidence is available, model must not invent source links.
- Use `max_tokens >= 360` for structured citation JSON.

### Phase 3: UI Evidence Display

Goal: show external citations in annotation panel without changing search cards or internal navigation.

| Task | Effort | Depends On | Done Criteria |
| --- | ---: | --- | --- |
| Add UI type handling | 2h | Phase 2 result type | Client accepts optional `externalEvidence` |
| Add annotation panel source section | 5h | UI type handling | Displays title, quote, provider, link, status |
| Add loading/error copy for evidence status | 3h | Panel section | `timeout/miss/error/disabled` states are clear but quiet |
| Add a11y tests | 4h | Panel section | Source links have accessible names and no overlap |

UI rules:

- Keep `ResultCard` focused on local Six Classics passage.
- Keep `AnnotationLinks` for internal exploration only.
- External links open as citations, not navigation nodes.

### Phase 4: Telemetry, Abuse Guard, and Rollout

Goal: make online dependency observable and safely degradable.

| Task | Effort | Depends On | Done Criteria |
| --- | ---: | --- | --- |
| Add evidence telemetry fields | 4h | Phase 2 | Records status, elapsed, cache hit, citation count |
| Add outbound budget guard | 5h | Config | Per-client/minute and global/minute external lookup limits |
| Add smoke script coverage | 4h | Telemetry | Smoke can validate enabled/disabled modes |
| Add docs and env examples | 3h | Config | README/env example documents new flags |
| Rollout checklist | 2h | All above | Default off, fast mode test, balanced mode manual test |

Suggested telemetry fields:

- `externalEvidence.status`
- `externalEvidence.elapsedMs`
- `externalEvidence.cacheHit`
- `externalEvidence.citationCount`
- `externalEvidence.mode`
- `externalEvidence.provider`

## Environment Flags

```env
ANNOTATION_EXTERNAL_SOURCES=off
RYSXGUJI_PROVIDER=daizhige
RYSXGUJI_MODE=fast
RYSXGUJI_FAST_TIMEOUT_MS=1800
RYSXGUJI_BALANCED_TIMEOUT_MS=7000
RYSXGUJI_CACHE_TTL_MS=86400000
RYSXGUJI_MAX_TERMS=3
RYSXGUJI_MAX_CITATIONS=3
RYSXGUJI_MAX_QUOTE_CHARS=160
RYSXGUJI_OUTBOUND_LIMIT_PER_MINUTE=5
```

Do not make `RYSXGUJI_ALLOWED_HOSTS` purely user-configurable. Keep a code-level allowlist and allow config only to narrow it.

## Test Plan

Create:

- `tests/unit/external-guji/daizhige-client.test.ts`
- `tests/unit/external-guji/query-expander.test.ts`
- `tests/unit/external-guji/normalizer.test.ts`
- `tests/unit/external-guji/cache.test.ts`
- `tests/unit/external-guji/security.test.ts`

Extend:

- `tests/unit/annotation/service.test.ts`
- `tests/unit/annotation/llm.test.ts`
- `tests/integration/api/annotate.route.test.ts`
- `tests/ui/annotation-panel.a11y.test.tsx`
- `scripts/annotation-telemetry-smoke.mjs`

Validation commands:

```bash
npm test -- tests/unit/external-guji --runInBand
npm test -- tests/unit/annotation/service.test.ts tests/unit/annotation/llm.test.ts --runInBand
npm test -- tests/integration/api/annotate.route.test.ts --runInBand
npm test -- tests/ui/annotation-panel.a11y.test.tsx --runInBand
npm run type-check
npm run lint
ANNOTATION_EXTERNAL_SOURCES=on RYSXGUJI_MODE=fast ANNOTATION_TELEMETRY=on npm run smoke:telemetry
```

Key test cases:

- Adds English double quotes to Daizhige search terms.
- Sends explicit User-Agent.
- Rejects non-HTTPS, localhost, private IP, and non-allowlisted redirects.
- Strips HTML and scripts from highlights.
- Truncates quote length before prompt injection.
- Timeout returns `externalEvidence.status = "timeout"` and keeps annotation HTTP 200.
- Cache hit does not call external source.
- Evidence-enabled and evidence-disabled annotation cache keys do not collide.
- LLM prompt treats evidence as source material, not instructions.
- Model output parser handles valid JSON and rejects/repairs fenced or truncated output.
- UI renders citations accessibly.

## Acceptance Criteria

Functional:

- `/api/annotate` can return annotation with optional `externalEvidence`.
- External citations include title, quote, provider, URL, matched terms, and retrieval time.
- No client can submit arbitrary citation content as trusted evidence.
- Annotation still succeeds when Daizhige times out or returns no results.

Performance:

- Cache hit evidence retrieval target: <= 50ms.
- `fast` cold external budget: <= 2000ms, allowed to return no evidence.
- `balanced` cold external budget: <= 7000ms, expected total 5-10s based on tests.
- LLM structured output uses enough token budget to avoid truncation.

Safety:

- External source default is off.
- SSRF protections are tested.
- Prompt injection protections are tested.
- Full book text is not exposed through API.
- Third-party API keys are never hardcoded.

UX:

- Local search result cards remain unchanged.
- Annotation panel shows external citations only when present.
- Miss/timeout states are quiet and do not look like product errors.

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
| --- | --- | --- | --- |
| Cold online path takes 7-10s | High | High | Default off/fast mode, cache, explicit balanced mode |
| Daizhige rejects default clients | Medium | High | Explicit User-Agent and contract tests |
| Model returns invalid JSON | Medium | Medium | `max_tokens >= 360`, short-output prompt, parser guard |
| External snippets contain prompt injection | High | Medium | Strip HTML, quote fencing, prompt says evidence is not instruction |
| SSRF through configurable source URL | High | Low | Hardcoded provider and host allowlist |
| Copyright/source reuse concerns | Medium | Medium | Short excerpts, source links, no full-text API exposure |
| Annotation cache mixes evidence/no-evidence | Medium | Medium | Include evidence mode and evidence hash in cache key |

## Future Path: Offline Embeddings

Use offline ingestion only after the online path proves which sources are repeatedly valuable.

Offline candidate criteria:

- Same work/source appears frequently in telemetry.
- Source licensing and usage are acceptable.
- Text can be chunked into stable passages with provenance.
- It improves retrieval quality beyond annotation-only citations.

Offline ingestion would be a separate project:

- Download or curate selected texts.
- Split into `text/source/chapter/section`.
- Add to corpus manifest.
- Regenerate embeddings and graph artifacts.
- Add golden search tests.

That path should not block this online evidence injection MVP.
