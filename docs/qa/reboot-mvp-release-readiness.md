# Reboot MVP Release Readiness

Scope: quality/release convergence for the active reboot MVP path.

This document freezes deployment-facing defaults, canonical environment naming, and the final smoke matrix. It does not add new product behavior.

## 2026-07-26 Convergence Status

**Decision: blocked; not a current Release Candidate signoff.** The
2026-04-29 evidence below is historical MVP evidence only. The current search
implementation is frozen at `81c6365766a7cf8c578cef6b060c5e43345f0d35`; the
holdout protocol and evidence reclassification are frozen at
`71fa97e7da563abc1d3365292132d36a75e6682b`.

Before current release signoff, the project still needs:

- review of the independently authored one-shot frozen holdout v1; the current
  v1 result is recorded below as blocked and cannot authorize release signoff;
- two no-cache full Jest runs, two stability runs, artifact reproduction,
  build, standalone smoke, and current desktop/mobile manual acceptance;
- a current telemetry result, or the explicitly documented no-credential
  deterministic-fallback exception.

Visible golden and tuned-paraphrase regression fixtures protect known behavior;
they do not substitute for the independent holdout. See
`docs/qa/search-quality-methodology.md` for the frozen protocol and artifact
identities.

### Integration preflight complete

`f261607bf83560e746507e38d7dd93dffc5b8edb` integrates the upstream Simon
Rogers UI commit `906cde4` with the quality-convergence branch `de369e3`.
Its preflight passed type-check, lint, 12 UI suites / 48 tests, documentation
contracts, and the Next.js 15.5.18 production build. The search freeze diff is
empty. This is integration evidence only, not Task 7 or a Release Candidate
signoff.

### Resealed independent holdout handoff

`0e7a81768cbdfcf0b6cc8633edceee6e1e7c7990` is the reviewed Unit 1–4
integration base. The prior evaluator seal
`ba3353e267a4990fc74978bdd8ead1b67475b4e5` and
`609a792179b7118c7c111744b9bc6a1702092326` were superseded before any fixture
by `3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b`, which enforces default search
artifacts, an immutable 40-character lowercase fixture SHA, the sealed
`package.json` evaluator entrypoint, frozen corpus inputs, commit-chain
provenance, and one-shot evidence reservation. This hardening is not Task 7 or a
Release Candidate signoff; fixture intake, immutable v1 evidence, and final
clean-worktree verification remain required.

### Frozen holdout v1 result

The final authoring base was `057e05b88c3fa60461e74279eec6311fc840fc4e`.
The independent fixture commit was
`dc2944974ccf4a837a7894e12b073427d1d58cf0`, and the evaluated commit is the
same fixture SHA. The sealed one-shot evaluator recorded:

- Decision: **blocked**.
- In-domain: `0/24` (required `19`).
- OOD: `6/6` (required `6`).
- Fixture SHA-256:
  `da6827eb453bd65fb07bba04cfff5fd34d64a8184cdac7dbcf5cd2507c4b37df`.
- Evidence generated at `2026-08-08T09:20:49.944Z`.

The immutable evidence is in
`docs/qa/search-holdout-v1-results.json` and
`docs/qa/search-holdout-v1-report.md`. This failing v1 remains recorded and
must not be rerun or tuned; a future search-improvement cycle requires a new
v2 fixture. Task 7 and Release Candidate signoff remain blocked.

CI gate: `.github/workflows/reboot-mvp-ci.yml` runs on pull requests and pushes
to `main` with `SEARCH_EMBEDDING_BACKEND=local`. Its fixed verify order is:

1. `npm ci`
2. `npm run generate:release-artifacts`
3. `git diff --exit-code -- data/embeddings.json data/search-graph.json`
4. `npm run type-check`
5. `npm run lint`
6. `npm test -- --runInBand --no-cache`
7. `npm run test:stability`
8. `npm run test:search-quality`
9. `npm run build`
10. prepare standalone runtime files
11. `npm run smoke:release`

Both embeddings and graph artifacts must reproduce byte-for-byte before the
static gates run. Search quality is a blocking gate; production smoke validates
the deployed user path and does not replace ranking-quality evidence.

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
npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
npm run type-check
npm run lint
npm test -- --runInBand --no-cache
npm test -- --runInBand --no-cache
npm run test:stability
npm run test:stability
npm run test:search-quality
npm run build
```

Expected artifact generation line:

```text
Wrote 11829 embeddings
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
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
if [ -d public ]; then mkdir -p .next/standalone/public && cp -R public/. .next/standalone/public/; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
```

The script waits for `/api/health`, then verifies:

- `GET /api/health` -> `200`
- `GET /` -> `200`, reboot intro rendered, and referenced `/_next/static/*.js` assets return `200`
- `POST /api/search` -> `200`, `success: true`, non-empty results, and a valid search response shape (`id`, `source`, `chapter`, `text`, finite `section` and `score`) with no duplicate Top 5 IDs
- `POST /api/annotate` -> `200`, annotation payload with links for the actual Top 1 result returned by search
- `GET /api/internal/annotation-telemetry` -> production `404`
- `GET /api/embed` -> `410 LEGACY_EMBED_DISABLED`

Production smoke verifies that the user path works; it does not freeze ranking to
one passage ID. The `lunyu-1-8` result was a 2026-04-29 historical baseline
before the corpus expansion, not the current release contract. The Golden
search-quality gate (`tests/fixtures/search-golden-queries.json` via
`npm run test:search-quality`) blocks the ranking contract for `如何面对困境`:
`rysxguji-lunyu-15-2` and `rysxguji-mengzi-10-20` must both be in the Top 3,
and the generalized 中庸 passages are banned there.

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
| telemetry quality signals | Run multiple annotation requests across root and linked passages         | Summary includes p50/p95/p99 latency plus fallback breakdown by query hash, exploration depth, and slot.   |
| production internal route | `NODE_ENV=production`                                                    | `/api/internal/annotation-telemetry` returns `404`.                                                        |

## Historical Browser Smoke Evidence (2026-04-29)

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

## Historical Release Evidence (2026-04-29)

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

Sign off the current convergence candidate only when:

- The independently authored frozen holdout meets its recorded threshold. A
  failing v1 remains recorded and keeps the release decision `blocked`.
- The full clean-worktree command suite passes twice where required.
- Production internal telemetry route returns `404` and telemetry is either
  freshly validated with canonical credentials or retains the documented
  no-credential deterministic-fallback exception without claiming a canonical
  pass.
- Desktop and `390px` mobile MVP paths complete:
  `search -> annotate -> explore -> back -> reset -> leaf state`.
