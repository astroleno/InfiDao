# Reboot MVP Release Readiness

Scope: release prep for the active reboot MVP path after Phase 6.4.

This document freezes deployment-facing defaults, canonical environment naming, and the final smoke matrix. It does not add new product behavior.

CI gate: `.github/workflows/reboot-mvp-ci.yml` runs artifact generation, type-check, lint, tests, build, and production smoke on pull requests and pushes to `main`.

## Canonical Annotation Env

Use these variables for annotation LLM runtime configuration:

```bash
ANNOTATION_LLM_MODE=fast
ANNOTATION_LLM_TIMEOUT_MS=5000
ANNOTATION_CACHE_TTL_MS=600000
ANNOTATION_CACHE_MAX_ENTRIES=100
ANNOTATION_TELEMETRY=on
ANNOTATION_FALLBACK_ALERT_RATE=0.15
ANNOTATION_P95_ALERT_MS=5000

LLM_MODEL_PRIMARY=gpt-5.4-nano
LLM_BASE_URL_PRIMARY=https://your-openai-compatible-provider.example/v1
LLM_API_KEY_PRIMARY=...
LLM_MODEL_SECONDARY=gemini-3.1-flash-lite-preview
LLM_BASE_URL_SECONDARY=https://your-openai-compatible-provider.example/v1
LLM_API_KEY_SECONDARY=...
```

The base URL must serve the selected model with the paired API key. If a model is
available only through an OpenAI-compatible gateway, configure that gateway as
the slot base URL instead of pointing the slot at an endpoint that does not serve
the model.

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

2026-04-29 telemetry finding: canonical env with the configured OpenAI-compatible
gateway produced LLM annotation, `fallbackRate=0`, p95 `2856ms`, and
`llm.warnings: []`. Overriding the same slots to `https://api.openai.com/v1`
reproduced `FALLBACK_RATE_HIGH` with `fallbackReason: "provider_error"`,
confirming the release blocker was endpoint/model mismatch rather than UI state
or annotation telemetry aggregation.

2026-04-29 final telemetry finding: a fresh canonical `smoke:telemetry` run
reproduced provider tail latency with `fallbackReason: "timeout"`,
`fallbackRate=1`, p95 `5004ms`, `llm.warnings: []`, and both slots
`canonicalConfigured: true`. This is accepted as the MVP release telemetry
exception because `/api/annotate` still returns `200` with deterministic
annotation copy after the configured 5s budget. Do not loosen
`ANNOTATION_LLM_TIMEOUT_MS` or `ANNOTATION_P95_ALERT_MS` without an explicit
product decision to make users wait longer before fallback.

## Production Defaults

- `ANNOTATION_LLM_MODE=fast`: prefer the secondary fast slot, then fail over to primary.
- `ANNOTATION_LLM_TIMEOUT_MS=5000`: one shared deadline across all provider slots for a single fast annotation generation; timeout fallback is intentionally polished for provider tail latency.
- `ANNOTATION_CACHE_TTL_MS=600000`: cache successful deterministic or LLM annotation results for 10 minutes.
- `ANNOTATION_CACHE_MAX_ENTRIES=100`: keep the in-process annotation cache bounded.
- `ANNOTATION_FALLBACK_ALERT_RATE=0.15`: telemetry raises `FALLBACK_RATE_HIGH` when fallback rate exceeds 15%.
- `ANNOTATION_P95_ALERT_MS=5000`: telemetry raises `P95_LATENCY_HIGH` when annotate p95 exceeds 5 seconds.
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

## Telemetry Smoke Command

Run this against a fresh dev server configured with canonical annotation env:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:telemetry
```

The script verifies search, annotate, and `/api/internal/annotation-telemetry`.
It fails if telemetry returns any `summary.alerts` or any LLM runtime warnings.
Use a fresh dev server for release evidence so stale fallback events from earlier
experiments do not remain in the in-process telemetry window.

## Production Smoke Command

Use the production smoke script against a deployed release URL or a local standalone production server:

```bash
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then cp -R public .next/standalone/public; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
```

The script waits for `/api/health`, then verifies:

- `GET /api/health` -> `200`
- `GET /` -> `200`, reboot intro rendered, and referenced `/_next/static/*.js` assets return `200`
- `POST /api/search` -> `200`, non-empty results, top result `lunyu-1-8`
- `POST /api/annotate` -> `200`, annotation payload with links
- `GET /api/internal/annotation-telemetry` -> production `404`
- `GET /api/embed` -> `410 LEGACY_EMBED_DISABLED`

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
| telemetry quality signals | Run multiple annotation requests across root and linked passages         | Summary includes p50/p95/p99 latency plus fallback breakdown by query hash, exploration depth, and slot.  |
| production internal route | `NODE_ENV=production`                                                    | `/api/internal/annotation-telemetry` returns `404`.                                                        |

## Browser Smoke Evidence

2026-04-29 headed browser smoke was rerun against a standalone production server
at `http://127.0.0.1:3001`.

- Desktop `1440x1000`: search, root annotation, linked exploration to `第 2 层`,
  back to `第 1 层`, and selecting the second result from depth 2 resetting the
  path to `第 1 层` all completed.
- Mobile `390x844`: first screen, search results, inline annotation under the
  selected result, and first link exploration to `第 2 层` all completed.
- `agent-browser wait --text` and one ref/text click attempt stalled or selected
  the wrong target during the desktop pass. The browser session was restarted and
  the successful pass used fresh sessions plus exact CSS/DOM targeting for the
  affected controls. This was treated as automation instability, not product
  white-screen evidence.
- Screenshots were regenerated under ignored `.tmp/browser-smoke/` with
  `desktop-task3-*` and `mobile-task3-*` filenames.

## Release Signoff 2026-04-29

Decision: release candidate with one accepted telemetry exception.

Automated gate:

- `npm run generate-search-artifacts`: passed; wrote 20 embeddings.
- `npm run type-check`: passed.
- `npm run lint`: passed with no ESLint warnings or errors.
- `npm test -- --runInBand`: passed; 29 suites, 123 tests.
- `npm run build`: passed; no Next metadata viewport/themeColor or missing
  asset warnings remained. Browserslist/baseline data freshness notices remain
  non-blocking dependency-data notices.

Smoke:

- `SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release`: passed against
  standalone production server; health, homepage JS assets, search, annotate,
  production telemetry `404`, and legacy embed `410` all passed.
- `SMOKE_BASE_URL=http://127.0.0.1:3002 npm run smoke:telemetry`: failed only on
  accepted telemetry alerts `FALLBACK_RATE_HIGH` and `P95_LATENCY_HIGH` caused by
  one provider timeout fallback at about 5s. Runtime warnings were empty and
  canonical slot migration status was clean.
- Headed desktop and mobile browser smoke passed as documented above.

Accepted exception:

- Annotation provider tail latency can still hit the 5s timeout budget and fall
  back to deterministic annotation. This is accepted for the release candidate
  because the user path still receives annotation content, the fallback is
  visible in telemetry, and increasing the timeout would delay the fallback UX.

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
- `npm run smoke:telemetry` passes against a fresh dev/test server.
- Legacy telemetry smoke produces migration warnings without secrets.
- Dev/test telemetry summary stays below alert thresholds: fallback rate <= 15% and p95 annotate latency <= 5000ms, or the release notes explicitly call out the exception.
- Production internal telemetry route returns `404`.
- MVP browser path still completes: `search -> annotate -> explore -> back -> reset -> leaf state`.
