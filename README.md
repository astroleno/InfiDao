# InfiDao 六经注我

InfiDao is a Next.js 15 application for connecting modern questions with
classical Chinese passages. Its active Reboot MVP path is:

```text
query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state
```

The public API contract remains:

- `POST /api/search`
- `POST /api/annotate`
- `GET /api/health`

## Current Status

The project is in **quality/release convergence**, not currently signed off as
a Release Candidate. The searchable MVP, deterministic fallback annotation,
and release gates are implemented. Final signoff still requires an independent
frozen holdout, a clean-worktree verification of the integrated release commit,
and current desktop/mobile manual acceptance.

Authoritative release evidence:

- `docs/qa/2026-07-26-quality-convergence-baseline.md`
- `docs/qa/search-quality-methodology.md`
- `docs/qa/reboot-mvp-release-readiness.md`
- `docs/qa/reboot-mvp-acceptance-checklist.md`

## Architecture

- Runtime search is JSON-first: local JSONL passages, committed embeddings, and
  in-memory hybrid retrieval. It does not contact Daizhige at request time.
- The optional search-graph sidecar is fail-open and does not change public
  search-ranking weights.
- Annotation returns one JSON response. When no provider credentials are
  configured, the user still receives deterministic fallback copy.
- Exploration is a stack: following a link adds a level; selecting a new root
  result resets the stack.

## Quick Start

Prerequisite: Node.js 20 (CI uses Node 20). Optional annotation-provider
credentials may be placed in `.env.local`; without them the deterministic
fallback remains available.

```bash
npm ci
npm run generate:release-artifacts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and try `如何面对困境`.

Install Chromium once before the first local browser run, then execute the E2E
suite. Playwright starts a development server on `127.0.0.1:3100` automatically.

```bash
npx playwright install chromium
npm run test:e2e
```

## Verification

Run the release gates in this order:

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
npm run test:e2e
npm run build
```

The quality gate checks the visible golden regression suite and verifies that
the embeddings and graph artifacts reproduce exactly. The known tuned-paraphrase
fixtures are regression evidence, not unseen generalization; the independent
one-shot holdout protocol is in `docs/qa/search-quality-methodology.md`.

After `npm run build`, run the standalone production smoke:

```bash
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
mkdir -p .next/standalone/.next/static
cp -R .next/static/. .next/standalone/.next/static/
if [ -d public ]; then mkdir -p .next/standalone/public && cp -R public/. .next/standalone/public/; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
E2E_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

Local E2E runs use the development server by default. The `E2E_BASE_URL` form
above is the explicit manual check for a production standalone server; browser
E2E is intentionally not part of the GitHub Actions workflow.

For canonical annotation telemetry validation, use a fresh development or test
server with credentials; the telemetry route is intentionally unavailable in
production standalone mode. See `docs/qa/reboot-mvp-release-readiness.md` for
the full matrix and the accepted no-credential fallback exception.

## Local Corpus and Artifacts

`guji-core-v1` covers 14 works. The rysxguji acquisition batch contains 11,809
passages with matching provenance records; the combined runtime corpus contains
11,829 passages and embeddings. The optional graph artifact currently has
12,825 nodes and 24,084 edges.

Daizhige is an acquisition-time source only. To rebuild local artifacts after a
corpus change:

```bash
node scripts/rysxguji/build-corpus.mjs
npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
```

See `data/rysxguji/README.md` and
`docs/rysxguji-local-corpus/IMPLEMENTATION_PLAN.md` for provenance and corpus
constraints.

## Active Commands

| Command                              | Purpose                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| `npm run dev`                        | Start the local development server.                         |
| `npm run build` / `npm run start`    | Build or run the Next.js production app.                    |
| `npm run generate:release-artifacts` | Regenerate embeddings and the graph sidecar.                |
| `npm run type-check`                 | Type-check app, tests, and active TypeScript scripts.       |
| `npm run lint`                       | Lint `src`, `tests`, and active scripts with zero warnings. |
| `npm test -- --runInBand --no-cache` | Run the full unit and integration suite deterministically.  |
| `npm run test:e2e`                   | Run the desktop and mobile Chromium Reboot MVP path.        |
| `npm run test:stability`             | Run the cold-start-sensitive suites.                        |
| `npm run test:search-quality`        | Check search quality and artifact reproducibility.          |
| `npm run smoke:release`              | Exercise a deployed or standalone production path.          |
| `npm run smoke:telemetry`            | Validate dev/test annotation telemetry.                     |

## Project Layout

```text
app/                 Next.js routes and the MVP page
src/lib/search/      local embedding, lexical, fusion, evidence, graph support
src/lib/annotation/  one-shot annotation runtime and deterministic fallback
tests/               unit, integration, UI, and release-contract checks
scripts/             artifact generation, quality gates, and smoke scripts
data/                committed local corpus, embeddings, and graph artifacts
docs/qa/             release evidence and acceptance records
```

## Contributing

Keep changes within the Reboot MVP architecture: no request-time online corpus
dependency, no public A2A route, and no change to the public API contract
without an explicit product decision. Regenerate artifacts and run the relevant
gates whenever changing corpus or search code.

## License

MIT. See [LICENSE](./LICENSE).
