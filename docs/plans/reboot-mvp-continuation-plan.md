# Reboot MVP Continuation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish reboot MVP release readiness after the 2026-04-29 review.

**Architecture:** Keep the MVP path inside the existing Next.js App Router app. Preserve the current JSON-first search, one-shot `/api/annotate`, stack-based exploration, and dark ritual-shell UI. Treat telemetry, browser smoke reliability, and final UI polish as release blockers.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Jest, Next route handlers, `agent-browser` for manual headed browser review.

---

## Current Evidence

Automated commands passed on 2026-04-29:

- `npm run generate-search-artifacts`
- `npm run type-check`
- `npm run lint`
- `npm test -- --runInBand`
- `npm run build`
- `SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release`

Browser review evidence from 2026-04-29:

- Desktop: search results, root annotation, linked exploration, back navigation, and new-result reset were exercised.
- Mobile: home, results, and root annotation were exercised at `390x844`.
- Temporary screenshots were saved under `.tmp/browser-smoke/` during the review session. Regenerate them if the directory is missing.

Known release blockers:

- Annotation telemetry sometimes reports timeout fallback and raises `FALLBACK_RATE_HIGH` or `P95_LATENCY_HIGH`.
- Selected result cards keep showing loading copy after annotation content is available.
- Browser smoke needs a more stable repeatable procedure; long `agent-browser` headed sessions sometimes jumped to `about:blank`.

## File Map

- `src/app/page.tsx`: owns search state, annotation state, selected result state, and exploration stack orchestration.
- `src/components/search/SearchResults.tsx`: renders result cards and injects the active mobile annotation panel under the selected result.
- `src/components/search/ResultCard.tsx`: renders each passage result and selected/loading status copy.
- `src/components/annotation/AnnotationPanel.tsx`: renders annotation tabs, leaf state, link exploration actions, and retry behavior.
- `src/components/wiki/WikiPanel.tsx`: renders exploration path and back navigation.
- `src/app/layout.tsx`: owns metadata, manifest link, service worker registration, and production analytics script injection.
- `src/lib/annotation/telemetry.ts`: computes fallback and latency alerts.
- `src/lib/annotation/llm.ts`: resolves annotation provider slots and migration warnings.
- `docs/qa/reboot-mvp-release-readiness.md`: release decision criteria and smoke matrix.
- `docs/qa/reboot-mvp-acceptance-checklist.md`: user-path acceptance checklist.

## Task 1: Fix Selected Result Status Copy

**Files:**

- Modify: `src/components/search/ResultCard.tsx`
- Modify: `src/components/search/SearchResults.tsx`
- Modify: `tests/ui/home-page.search.test.tsx`

- [x] Step 1: Add a UI regression test.

Add an assertion to the existing annotation success test in `tests/ui/home-page.search.test.tsx`:

```tsx
expect(screen.queryByText("当前正在为这一句请求注释")).not.toBeInTheDocument();
expect(screen.getByText("当前注释已展开，可沿右侧继续探索")).toBeInTheDocument();
```

Run:

```bash
npm test -- tests/ui/home-page.search.test.tsx --runInBand
```

Expected result before implementation: the new assertion fails because the loading copy remains visible.

- [x] Step 2: Pass annotation completion state into result cards.

Update `SearchResultsProps` in `src/components/search/SearchResults.tsx`:

```tsx
activeAnnotationPassage: string | null;
```

Pass it from `src/app/page.tsx` as:

```tsx
activeAnnotationPassage={annotation?.passageId ?? null}
```

Then pass this boolean into `ResultCard`:

```tsx
hasCompletedAnnotation={activeAnnotationPassage === result.id}
```

- [x] Step 3: Update `ResultCard` copy.

Add this prop:

```tsx
hasCompletedAnnotation: boolean;
```

Render selected status as:

```tsx
{
  isSelected && (
    <div className="mt-4 text-xs tracking-[0.2em] text-zen/80">
      {isAnnotating
        ? "当前正在为这一句请求注释"
        : hasCompletedAnnotation
          ? "当前注释已展开，可沿右侧继续探索"
          : "当前结果已选中"}
    </div>
  );
}
```

- [x] Step 4: Verify the focused UI test.

Run:

```bash
npm test -- tests/ui/home-page.search.test.tsx --runInBand
```

Expected result: pass.

## Task 2: Stabilize Annotation Telemetry Release Gate

**Files:**

- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `.env.example`
- Optional modify: `src/lib/annotation/llm.ts`
- Optional modify: `src/lib/annotation/telemetry.ts`
- Optional create: `scripts/annotation-telemetry-smoke.mjs`
- Optional modify: `package.json`

- [x] Step 1: Reproduce telemetry with canonical env.

Run a dev server or standalone server with canonical env only:

```bash
ANNOTATION_LLM_MODE=fast \
ANNOTATION_LLM_TIMEOUT_MS=5000 \
ANNOTATION_TELEMETRY=on \
LLM_MODEL_PRIMARY=gpt-5.4-nano \
LLM_BASE_URL_PRIMARY=https://api.openai.com/v1 \
LLM_API_KEY_PRIMARY="$LLM_API_KEY_PRIMARY" \
LLM_MODEL_SECONDARY=gemini-3.1-flash-lite-preview \
LLM_BASE_URL_SECONDARY=https://api.openai.com/v1 \
LLM_API_KEY_SECONDARY="$LLM_API_KEY_SECONDARY" \
npm run dev
```

Then call:

```bash
curl -sS http://127.0.0.1:3000/api/internal/annotation-telemetry
```

Expected release-ready result: `llm.warnings` is empty and `summary.alerts` is empty after representative annotate requests.

- [x] Step 2: Decide whether this is environment or code.

If provider calls succeed below 5000ms, document the passing run in `docs/qa/reboot-mvp-release-readiness.md`.

If provider calls continue to time out, choose one path and record it:

- Fix provider configuration, base URL, model name, or key selection.
- Increase `ANNOTATION_LLM_TIMEOUT_MS` and `ANNOTATION_P95_ALERT_MS` together only if product latency accepts it.
- Accept deterministic fallback as a release exception and write the exception into release notes before signoff.

- [x] Step 3: Add a repeatable telemetry smoke if the issue recurs.

Create `scripts/annotation-telemetry-smoke.mjs` that:

- Reads `SMOKE_BASE_URL`.
- Posts `/api/search` with `如何面对困境`.
- Posts `/api/annotate` for the top result.
- Reads `/api/internal/annotation-telemetry`.
- Fails when `data.summary.alerts.length > 0`.
- Fails when `data.llm.warnings.length > 0` for canonical env.

Add this package script:

```json
"smoke:telemetry": "node scripts/annotation-telemetry-smoke.mjs"
```

- [x] Step 4: Verify telemetry.

Run:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:telemetry
```

Expected result: pass, or a documented release exception exists.

## Task 3: Repeat Browser Smoke Without Session Drift

**Files:**

- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`
- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Optional create: `docs/qa/reboot-mvp-browser-smoke-2026-04-29.md`

- [x] Step 1: Use a stable server.

Prefer standalone production mode for browser smoke:

```bash
npm run build
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then cp -R public .next/standalone/public; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```

- [x] Step 2: Run desktop headed smoke.

Use `agent-browser` headed mode from a fresh session:

```bash
agent-browser close --all
agent-browser --headed open http://127.0.0.1:3001
agent-browser set viewport 1440 1000
```

Exercise:

- Click `如何面对困境`.
- Click the first `进入注我`.
- Click the first `探索此段落`.
- Click `返回上一层`.
- From depth 2, select the second search result and verify path resets to `第 1 层`.

Expected result: no layout overlap; path returns and resets correctly.

- [x] Step 3: Run mobile headed smoke.

Use:

```bash
agent-browser close --all
agent-browser --headed open http://127.0.0.1:3001
agent-browser set viewport 390 844
```

Exercise:

- Home first screen.
- Search result list.
- First result annotation panel.
- First link exploration.

Expected result: search controls fit, result text does not overflow, and annotation appears below the selected result.

- [x] Step 4: Record the result.

If the product passes, mark the browser smoke items in `docs/qa/reboot-mvp-acceptance-checklist.md` as complete and add a dated note to `docs/qa/reboot-mvp-release-readiness.md`.

If `agent-browser` jumps to `about:blank`, restart the browser session and do not count that screenshot as a product failure.

## Task 4: Clean Non-Blocking Next.js Runtime Warnings

**Files:**

- Modify: `src/app/layout.tsx`
- Create or remove references for: `public/manifest.json`, `public/sw.js`, `public/favicon.ico`, `public/analytics.js`
- Modify: `tests/ui/layout-polish.test.tsx`

- [x] Step 1: Move viewport and theme color out of metadata.

In `src/app/layout.tsx`, export `viewport` separately using Next.js 14 conventions:

```tsx
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};
```

Remove `viewport` and `themeColor` from `metadata`.

- [x] Step 2: Set metadata base.

Add:

```tsx
metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
```

- [x] Step 3: Remove or satisfy missing asset references.

Either create real files in `public/`, or remove registration and script injection until those assets exist. For MVP release, prefer removing production-only analytics and service worker registration unless the assets are intentionally shipped.

- [x] Step 4: Verify build logs.

Run:

```bash
npm run build
```

Expected result: no metadata viewport/themeColor warnings and no missing asset requests during smoke.

## Task 5: Final Release Signoff Pass

**Files:**

- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`
- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `README.md`

- [x] Step 1: Run full automated gate.

Run:

```bash
npm run generate-search-artifacts
npm run type-check
npm run lint
npm test -- --runInBand
npm run build
```

Expected result: all commands exit 0.

- [x] Step 2: Run production smoke.

Run:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
```

Expected result: release smoke passes.

- [x] Step 3: Run telemetry and browser smoke.

Run the Task 2 telemetry smoke and Task 3 headed browser smoke.

Expected result: telemetry has no alerts, or a release exception is documented; desktop and mobile browser smoke pass.

- [x] Step 4: Update release readiness.

In `docs/qa/reboot-mvp-release-readiness.md`, add a dated signoff entry with:

- Command outputs summarized.
- Browser smoke result.
- Telemetry result.
- Accepted exceptions, if any.

- [x] Step 5: Update README status.

Move `README.md` from `release-readiness review` language to `release candidate` only after all release signoff checks pass.

## 2026-04-29 Completion Note

All continuation tasks were executed. Final automated gate passed:
`generate-search-artifacts`, `type-check`, `lint`, Jest `--runInBand`, and
`build`. Production smoke passed against a standalone server. Headed desktop and
mobile browser smoke passed and were recorded in the QA docs. Telemetry smoke
reproduced provider tail latency at the 5s budget; `FALLBACK_RATE_HIGH` and
`P95_LATENCY_HIGH` are accepted as the release-candidate exception because the
annotation endpoint still returns deterministic annotation content and runtime
LLM warnings remain empty under canonical env.
