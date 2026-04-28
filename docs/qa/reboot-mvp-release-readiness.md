# Reboot MVP Release Readiness

Scope: release prep for the active reboot MVP path after Phase 6.4.

This document freezes deployment-facing defaults, canonical environment naming, and the final smoke matrix. It does not add new product behavior.

## Canonical Annotation Env

Use these variables for annotation LLM runtime configuration:

```bash
ANNOTATION_LLM_MODE=fast
ANNOTATION_LLM_TIMEOUT_MS=6000
ANNOTATION_CACHE_TTL_MS=600000
ANNOTATION_CACHE_MAX_ENTRIES=100
ANNOTATION_TELEMETRY=on

LLM_MODEL_PRIMARY=gpt-5.4-nano
LLM_BASE_URL_PRIMARY=https://api.openai.com/v1
LLM_API_KEY_PRIMARY=...
LLM_MODEL_SECONDARY=gemini-3.1-flash-lite-preview
LLM_BASE_URL_SECONDARY=https://api.openai.com/v1
LLM_API_KEY_SECONDARY=...
```

Legacy annotation aliases remain migration compatibility only:

```text
LLM_PROVIDER
LLM_MODEL
LLM_BASE_URL
LLM_API_KEY
LLM_PROVIDE_2
LLM_PROVIDER_2
LLM_MODEL_2
LLM_BASE_URL_2
LLM_API_KEY_2
OPENAI_API_KEY
OPENAI_API_KEY_2
OPENAI_BASE_URL
OPENAI_BASE_URL_2
```

Migration rule: if any legacy alias is still selected by the annotation runtime, `/api/internal/annotation-telemetry` must show `migrationRequired: true` and a non-empty `llm.warnings` list. With canonical env only, each configured slot must show `canonicalConfigured: true`, `migrationRequired: false`, and `llm.warnings: []`.

## Production Defaults

- `ANNOTATION_LLM_MODE=fast`: prefer the secondary fast slot, then fail over to primary.
- `ANNOTATION_LLM_TIMEOUT_MS=6000`: one shared deadline across all provider slots for a single annotation generation.
- `ANNOTATION_CACHE_TTL_MS=600000`: cache successful deterministic or LLM annotation results for 10 minutes.
- `ANNOTATION_CACHE_MAX_ENTRIES=100`: keep the in-process annotation cache bounded.
- Annotate body ceiling is `10_240` bytes, aligned with `passageText.max(2000)` for CJK input.
- Annotate rate limit is 20 requests per client per 60 seconds.
- `/api/internal/annotation-telemetry` is dev/test only; production must return `404`.

## Required Commands

Run these before release signoff:

```bash
PATH=/opt/homebrew/bin:$PATH npm run generate-search-artifacts
PATH=/opt/homebrew/bin:$PATH npm run type-check
PATH=/opt/homebrew/bin:$PATH npm run lint
PATH=/opt/homebrew/bin:$PATH npm test -- --runInBand
```

Expected artifact generation line:

```text
Wrote 20 embeddings
```

## Release Smoke Matrix

Run the matrix against a dev server configured with canonical env first.

| Case                      | Setup                                                                    | Expected                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `fast` mode               | `ANNOTATION_LLM_MODE=fast` with both slots configured                    | `/api/annotate` returns `200`; telemetry mode is `fast`.                                                   |
| `quality` mode            | `ANNOTATION_LLM_MODE=quality` with both slots configured                 | `/api/annotate` returns `200`; telemetry mode is `quality`.                                                |
| timeout fallback          | Configure a very low `ANNOTATION_LLM_TIMEOUT_MS` or unavailable provider | `/api/annotate` still returns `200` with deterministic copy; telemetry has `fallbackReason: "timeout"`.    |
| provider failover         | First selected slot returns provider error while second slot succeeds    | `/api/annotate` returns LLM copy; telemetry has `fallbackHit: true` and `fallbackReason: "slot_failover"`. |
| cache hit                 | Repeat the same `query + passageId + passageText + style + mode` request | Second request avoids provider call; telemetry has `provider: "cache"` and `cacheHit: true`.               |
| oversized body            | Send annotate body above `10_240` bytes                                  | `/api/annotate` returns `413` and `REQUEST_TOO_LARGE`.                                                     |
| rate limit                | Send 21 annotate requests from one client within 60 seconds              | The 21st request returns `429` and `RATE_LIMITED`.                                                         |
| telemetry canonical       | Canonical env only                                                       | `/api/internal/annotation-telemetry` returns `200`, `llm.warnings: []`, and no API key material.           |
| telemetry legacy          | Legacy aliases only                                                      | `/api/internal/annotation-telemetry` returns migration warnings and no API key material.                   |
| production internal route | `NODE_ENV=production`                                                    | `/api/internal/annotation-telemetry` returns `404`.                                                        |

## Minimal Curl Smoke

```bash
curl -sS http://localhost:3001/api/health

curl -sS -X POST http://localhost:3001/api/search \
  -H 'content-type: application/json' \
  --data '{"query":"如何面对困境","topK":5}'

curl -sS -X POST http://localhost:3001/api/annotate \
  -H 'content-type: application/json' \
  --data '{"query":"如何面对困境","passageId":"lunyu-1-1","passageText":"学而时习之，不亦说乎？","style":"modern"}'

curl -sS http://localhost:3001/api/internal/annotation-telemetry
```

## Release Decision

Sign off only when:

- Full command suite passes.
- Canonical telemetry smoke has `llm.warnings: []`.
- Legacy telemetry smoke produces migration warnings without secrets.
- Production internal telemetry route returns `404`.
- MVP browser path still completes: `search -> annotate -> explore -> back -> reset -> leaf state`.
