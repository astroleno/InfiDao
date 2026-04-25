---
title: Reboot MVP Implementation Plan
created: 2026-04-24
updated: 2026-04-24
status: active
origin: docs/SUPERPOWERS_REBOOT_PLAN.md
branch: codex/reboot-mvp
plan_depth: deep
source_of_truth: confirmed
---

# Reboot MVP Implementation Plan

Created: 2026-04-24
Updated: 2026-04-24
Status: active
Origin: `docs/SUPERPOWERS_REBOOT_PLAN.md`

Source of truth for the reboot is fixed to:

- `docs/SUPERPOWERS_REBOOT_PLAN.md`
- `docs/plans/reboot-mvp-implementation-plan.md`

## 1. Problem Frame

The repo already contains usable UI fragments, data work, and API ideas, but the executable path is broken by contract drift and duplicate service entrypoints. The current top-level failure mode is not "missing features"; it is that the homepage, route handlers, and shared types disagree on request fields, response shapes, and which implementation is authoritative.

This plan implements the reboot strategy defined in `docs/SUPERPOWERS_REBOOT_PLAN.md`: rebuild one MVP path only, keep the current Next.js app as the runtime shell, use JSON-first search, return one-shot JSON from `/api/annotate`, and drive exploration by reusing `/api/annotate` with link-carried passage data.

## 2. Scope Boundary

In scope:

- Re-establish a single trustworthy implementation path in the existing Next.js app
- Deliver phases 1 through 5 from `docs/SUPERPOWERS_REBOOT_PLAN.md`
- Keep only `POST /api/search`, `POST /api/annotate`, and `GET /api/health` on the MVP path
- Add the minimum test and lint baseline needed to make the reboot executable
- Reuse the existing search and annotation components only after removing dormant controls

Out of scope:

- LanceDB, Redis, multi-provider orchestration, or server-side streaming as MVP requirements
- Public `/api/embed` or `/api/explore` participation in the user path
- Sorting, filtering, load-more, sharing, favorites, graph canvas, timeline view, or account features
- Rebuilding the app as a separate Vite frontend or introducing a second runtime

## 3. Requirements Traceability

- Single MVP path: `query -> search -> annotation/explain -> wiki explore`
  Source: `docs/SUPERPOWERS_REBOOT_PLAN.md` sections 1, 4, 6
- JSON-first search and no premature backend abstraction
  Source: `docs/SUPERPOWERS_REBOOT_PLAN.md` sections 7.1, 7.2, 8.3
- Three public HTTP endpoints only
  Source: `docs/SUPERPOWERS_REBOOT_PLAN.md` section 8.2.3
- `/api/annotate` returns one-shot JSON and links carry minimum follow-up passage data
  Source: `docs/SUPERPOWERS_REBOOT_PLAN.md` sections 8.2.1, 11.2
- Exploration is stack-based, leaf nodes are non-error states, and mobile panels have minimum accessibility rules
  Source: `docs/SUPERPOWERS_REBOOT_PLAN.md` sections 8.1.2, 13.4

## 4. Current Repo Findings

- `src/app/page.tsx` posts `limit` to `/api/search` and `passage_id` / `passage_text` to `/api/annotate`, while the current routes and types expect different shapes.
- `src/app/api/search/route.ts` and `src/app/api/annotate/route.ts` are coupled to legacy `db/search/llm/cache` entrypoints that the current type-check output already shows are drifting.
- `src/types/index.ts` mixes legacy `top_k`, `note`, `six_to_me`, `passage_id` style contracts with the reboot document's `topK`, `query`, `sixToMe`, `passageId` contract.
- `src/components/search/SearchResults.tsx`, `src/components/search/ResultCard.tsx`, and `src/components/annotation/AnnotationPanel.tsx` include deferred controls that would reintroduce scope creep if copied as-is.
- `package.json` exposes `jest` and `next lint`, but the repo currently lacks a root Jest config and root ESLint config file, so phase 1 must restore tool entrypoints before relying on them.
- There is no established `tests/` or `__tests__/` structure in the root app, so this plan explicitly creates test locations rather than assuming them.

## 5. Planning Decisions

- Rebuild in place on the current Next.js app instead of spinning up a parallel frontend.
- Replace route contracts top-down instead of trying to support old and new field names simultaneously.
- Treat Search / Annotation / Corpus / Health as logical boundaries first; extract them into their own modules only when code structure benefits from it.
- Keep state local to `src/app/page.tsx` through phase 4 unless a second caller forces shared state.
- Use one-shot JSON from `/api/annotate` through phase 4; any "streaming" visible to the user is a presentation behavior in the client.
- Reuse `/api/annotate` for exploration clicks; do not create a public `/api/explore` route for MVP.
- Add tests along the vertical slice, not as a cleanup pass at the end.

## 6. Existing Patterns To Follow

- `src/app/page.tsx` remains the single top-level orchestration page, but its branching and request payloads must be rewritten.
- `src/components/search/SearchBar.tsx` may be reused only after being reshaped into the old reference's focused "one thought" composer; avoid preserving the generic SaaS search-bar-with-two-inline-buttons layout.
- `src/components/annotation/AnnotationPanel.tsx` already has the tab structure needed for `六经注我` and `我注六经`, but its footer actions should be stripped for MVP.
- `ref/infidao---six-classics-annotate-me/components/IntroScreen.tsx`, `NodeCard.tsx`, `BackgroundLayer.tsx`, and `ThoughtTrace.tsx` are the Stage 2 UI/UX source of truth. Port their visible design and interaction intent as faithfully as possible: "输入一念 / 经典回应", stone/paper/zen palette, serif hierarchy, source/quote/commentary structure, and restrained ritual tone. They remain visual and interaction references only; they are not architectural baselines.
- `src/components/infinite-wiki/WikiExplorer.tsx` can inform later exploration structure, but phase 4 should build a smaller `WikiPanel.tsx` aligned to the reboot contract.

## 7. Phase Sequencing

Blocking order:

1. Phase 1 must land before any feature slice because it restores the toolchain, health route, and contract baseline.
2. Phase 2 must land before phase 3 because annotation depends on stable search results and request payloads.
3. Phase 3 must land before phase 4 because exploration is driven by annotation links.
4. Phase 5 only starts after phases 2 through 4 are already contract-stable.

Suggested merge checkpoints:

- Checkpoint A: phase 1 complete and green on `type-check`, `lint`, and basic tests
- Checkpoint B: phase 2 search path complete
- Checkpoint C: phase 3 annotation path complete
- Checkpoint D: phase 4 exploration path complete
- Checkpoint E: phase 5 polish and acceptance checklist complete

## 8. Implementation Units

### Phase 1: Clean Foundation

#### IU 1.1 Tooling and quality baseline

Outcome:

- `npm run lint`, `npm run test`, and `npm run type-check` resolve real project configuration rather than failing before source analysis.

Files:

- `package.json`
- `.eslintrc.json`
- `jest.config.js`
- `tests/setup/jest.setup.ts`
- `tsconfig.json`

Test files:

- `tests/smoke/tooling.smoke.test.ts`

Test scenarios:

- Jest can boot with the repo's path aliases and jsdom environment.
- The smoke test can import a file from `src/` through `@/` aliases.
- ESLint resolves a root config and runs against `src/` instead of failing on missing configuration.

Depends on:

- None

#### IU 1.2 Core contract reset and health route simplification

Outcome:

- The reboot contract becomes the only contract the app path cares about.
- `GET /api/health` returns the minimal MVP status shape defined in the origin doc.

Files:

- `src/types/index.ts`
- `src/app/api/health/route.ts`
- `src/lib/utils/errors.ts`

Test files:

- `tests/integration/api/health.route.test.ts`

Test scenarios:

- `GET /api/health` returns `{ success: true, data: { status: "ok" } }`.
- The health route does not import legacy `db`, `embed`, or `llm` services.
- The shared types expose reboot-aligned request and response names such as `topK`, `passageId`, `sixToMe`, and `meToSix`.

Depends on:

- IU 1.1

#### IU 1.3 Legacy path quarantine

Outcome:

- MVP entrypoints stop depending on duplicate `src/lib/*.ts` and `src/lib/*/index.ts` pairs.

Files:

- `src/app/api/search/route.ts`
- `src/app/api/annotate/route.ts`
- `src/app/api/health/route.ts`
- `src/app/page.tsx`

Test files:

- Covered transitively by phase 2 and phase 3 route tests

Test scenarios:

- App path imports only the chosen reboot modules for search, annotation, and health.
- No public route on the MVP path imports `src/lib/db.ts`, `src/lib/embed.ts`, or `src/lib/llm.ts`.

Depends on:

- IU 1.2

### Phase 2: Search Closure And Reference-Faithful UI Port

Stage 2 product direction:

- The user-approved reference UI in `ref/infidao---six-classics-annotate-me` is the UI/UX source of truth for this phase.
- Stage 2 should not land as a generic search results page or as a loose reinterpretation. It should land as the first production slice of the old "thought stream" experience inside the current Next.js app.
- The phase still stops at search closure technically, but the screen must already feel like "输入此刻一念，经典开始回应".
- Do not port the old runtime model: no frontend direct LLM calls, no auto infinite continuation, no forced auto-scroll stage.

Visual contract:

- Palette: stone/charcoal ground, paper text, one zen accent, minimal seal red only when a real stamp/action is present.
- Typography: define and use `font-classic` for Chinese classic text; do not depend on an undefined utility class.
- Composition: search-before state should be a faithful port of `IntroScreen`, not a marketing hero. Search-after state should be a faithful production adaptation of `NodeCard`, not a 3-card feature grid.
- Result hierarchy: source line, quote text, short match reason or score, one primary action to enter annotation. The hierarchy should visually match the old reference before adding new product chrome.
- Motion: entrance fade, loading breath, result reveal; all reduced-motion aware.

Non-goals for Stage 2:

- clickable atom branching across every word
- capture/share cards
- automatic continuation
- source settings modal
- free graph canvas
- any navigation item that is visible but not wired

#### IU 2.1 JSON corpus and embedding loaders

Outcome:

- The app can read passages and embeddings from `data/` without touching LanceDB.

Files:

- `src/lib/data/corpus.ts`
- `src/lib/data/embeddings.ts`
- `data/sixclassics-sample.jsonl`
- `data/embeddings.json`

Test files:

- `tests/unit/data/corpus.test.ts`
- `tests/unit/data/embeddings.test.ts`

Test scenarios:

- Corpus loader returns stable passage records with `id`, `source`, `chapter`, `section`, and `text`.
- Embedding loader matches embeddings to passage ids and surfaces a typed error when data is missing or malformed.
- Empty or unreadable data produces a controlled failure rather than crashing the request path.

Depends on:

- IU 1.2

#### IU 2.2 In-memory search service

Outcome:

- A thin search service can rank passages with `topK` and `threshold` using in-memory cosine similarity.

Files:

- `src/lib/search/json.ts`
- `src/lib/search/service.ts`
- `src/types/index.ts`

Test files:

- `tests/unit/search/json-search.test.ts`

Test scenarios:

- Results are sorted by descending score.
- `topK` limits the returned result count.
- `threshold` filters out weak matches.
- Empty corpus or empty match set returns an empty array, not an exception.

Depends on:

- IU 2.1

#### IU 2.3 Search API contract rewrite

Outcome:

- `POST /api/search` accepts only the reboot request shape and returns only the reboot response shape.

Files:

- `src/app/api/search/route.ts`
- `src/types/index.ts`
- `src/lib/search/service.ts`

Test files:

- `tests/integration/api/search.route.test.ts`

Test scenarios:

- Valid request with `query`, optional `topK`, and optional `threshold` returns `success: true` with `data`.
- Empty query returns `400`.
- Unknown legacy fields do not become an alternate source of truth for the route contract.
- Empty-result search returns `success: true` with `data: []` and does not masquerade as an internal error.

Depends on:

- IU 2.2

#### IU 2.4 Search UI orchestration

Outcome:

- The homepage can submit an explicit thought query, render reference-faithful classic response states, and hold enough state to feed later annotation.
- The first production UI slice inherits the old reference's mood and hierarchy while staying inside the current Next.js/Tailwind architecture.

Files:

- `src/app/page.tsx`
- `src/components/search/SearchBar.tsx`
- `src/components/search/SearchResults.tsx`
- `src/components/search/ResultCard.tsx`
- `src/app/globals.css`
- `tailwind.config.ts`

Test files:

- `tests/ui/search-bar.test.tsx`
- `tests/ui/home-page.search.test.tsx`

Test scenarios:

- Enter key submits the explicit current query.
- Hot term and random term actions do not rely on stale just-written state.
- Loading, empty, error, and success states are visually distinct.
- Sorting dropdown, load-more button, and non-MVP affordances are removed or hidden.
- Undefined styling utilities are eliminated: no MVP path may rely on missing `font-classic` or missing `primary-50/100/200/500/600/700/800` classes.
- Mobile search layout keeps input text and action controls from overlapping at narrow widths.
- The search-before screen is a faithful port of the old focused "one thought" composer: stone/paper/zen palette, serif hierarchy, sparse copy, no three-card marketing strip.
- Search results are a faithful production adaptation of the old `NodeCard` hierarchy: source, quote, concise response/match context, and one real annotation entry action.

Depends on:

- IU 2.3

#### IU 2.5 Reference UI port notes

Outcome:

- The team has explicit port notes that distinguish UI/UX elements to copy from runtime mechanics to reject before Phase 3 expands annotation UI.

Files:

- `docs/plans/reboot-mvp-implementation-plan.md`
- `src/app/page.tsx`
- `src/components/search/SearchBar.tsx`
- `src/components/search/SearchResults.tsx`
- `src/components/search/ResultCard.tsx`

UI/UX elements to copy:

- `IntroScreen` mood: single input, sparse copy, ritual entry.
- `NodeCard` hierarchy: source / quote / commentary / action.
- `BackgroundLayer` idea: semantic atmosphere through one large character or muted theme word, implemented only if it does not fight readability.
- `ThoughtTrace` idea: future exploration rail, deferred until annotation/exploration state exists.

Rejected mechanics:

- `span onClick` atoms without keyboard semantics.
- `h-screen` as the only viewport constraint.
- hidden scrollbars as the default reading model.
- Tailwind CDN/importmap/html2canvas CDN dependencies.

Test scenarios:

- Review checklist confirms each old reference element is classified as "copy now", "defer", or "reject runtime".
- Any copied interaction intent from the reference has keyboard/focus semantics before it appears in the MVP path.

Depends on:

- IU 2.4

### Phase 3: Annotation Closure

#### IU 3.1 Annotation prompt and service

Outcome:

- A one-shot annotation service returns `passageId`, `passageText`, `sixToMe`, `meToSix`, and `links`.

Files:

- `src/lib/annotation/prompt.ts`
- `src/lib/annotation/service.ts`
- `src/lib/llm/index.ts`
- `src/types/index.ts`

Test files:

- `tests/unit/annotation/service.test.ts`

Test scenarios:

- Service returns a full JSON annotation object, not stream chunks.
- Link entries include the minimum follow-up fields required by the reboot contract.
- Leaf nodes return `links: []` and are treated as successful responses.
- Provider or parsing failures map to structured errors instead of partial protocol output.

Depends on:

- IU 2.3

#### IU 3.2 Annotation API contract rewrite

Outcome:

- `POST /api/annotate` aligns exactly to the reboot JSON contract and does not expose streaming behavior.

Files:

- `src/app/api/annotate/route.ts`
- `src/types/index.ts`
- `src/lib/annotation/service.ts`

Test files:

- `tests/integration/api/annotate.route.test.ts`

Test scenarios:

- Valid request with `query`, `passageId`, `passageText`, and optional `style` returns a complete JSON response.
- Missing `query` or passage fields return `400`.
- Route does not switch behavior based on `Accept: text/event-stream`.
- Leaf-node responses preserve `success: true` with `links: []`.

Depends on:

- IU 3.1

#### IU 3.3 Annotation panel integration

Outcome:

- Search results can open the annotation panel and render stable loading, error, and completed states.

Files:

- `src/app/page.tsx`
- `src/components/annotation/AnnotationPanel.tsx`
- `src/components/annotation/AnnotationLinks.tsx`
- `src/components/annotation/StreamingText.tsx`
- `src/components/annotation/SixToMeView.tsx`
- `src/components/annotation/MeToSixView.tsx`

Test files:

- `tests/ui/annotation-panel.test.tsx`
- `tests/ui/home-page.annotate.test.tsx`

Test scenarios:

- Clicking `生成注释` opens a fixed panel without collapsing the search context.
- Loading, failure, and completion states are clearly separated.
- Tab switching preserves the received annotation content.
- Deferred footer actions such as favorite/share are absent in MVP mode.
- The panel's client-side "typing" effect is driven from completed JSON data, not from route streaming.

Depends on:

- IU 3.2

### Phase 4: Exploration Closure

#### IU 4.1 Exploration service and stack model

Outcome:

- The app has a clear stack-based exploration model driven by annotation links.

Files:

- `src/lib/wiki/service.ts`
- `src/lib/data/corpus.ts`
- `src/types/index.ts`

Test files:

- `tests/unit/wiki/service.test.ts`

Test scenarios:

- Root selection creates the first stack entry.
- Clicking a link pushes one new exploration node onto the stack.
- Back action pops exactly one node and restores the previous annotation payload.
- Missing or invalid link data results in a controlled "no further exploration" state instead of a thrown error.

Depends on:

- IU 3.3

#### IU 4.2 Wiki panel and link reuse flow

Outcome:

- The UI can move from one annotation to the next by reusing `/api/annotate`, with leaf-node and broken-link behavior fully defined.

Files:

- `src/components/wiki/WikiPanel.tsx`
- `src/app/page.tsx`
- `src/components/annotation/AnnotationLinks.tsx`
- `src/components/search/ResultCard.tsx`

Test files:

- `tests/ui/wiki-panel.test.tsx`
- `tests/ui/home-page.explore.test.tsx`

Test scenarios:

- Clicking a link reuses the current query plus link-carried passage data to call `/api/annotate`.
- When `links` is empty, the UI shows terminal copy such as "已到当前探索末端，可返回上一层或更换段落" and does not render a fake CTA.
- When link data is missing, the UI shows "此处暂无后续探索" while preserving back-navigation and result reselection.
- Selecting a new search result resets the old exploration stack.

Depends on:

- IU 4.1

#### IU 4.3 Mobile panel accessibility

Outcome:

- Mobile exploration and annotation panels satisfy the minimum accessibility contract from the origin document.

Files:

- `src/components/wiki/WikiPanel.tsx`
- `src/components/annotation/AnnotationPanel.tsx`
- `src/components/ui/Button.tsx`

Test files:

- `tests/ui/mobile-panel.accessibility.test.tsx`

Test scenarios:

- Opening a panel moves focus into the panel title or first actionable element.
- `Escape` closes the panel in keyboard-capable environments.
- The close action exposes a readable accessible name.
- Touch targets for primary panel controls meet the minimum `44x44px` size requirement.

Depends on:

- IU 4.2

### Phase 5: Interaction Polish

#### IU 5.1 MVP path cleanup

Outcome:

- The search-to-annotation-to-exploration path contains only real controls and intentional copy.

Files:

- `src/app/page.tsx`
- `src/components/search/SearchResults.tsx`
- `src/components/search/ResultCard.tsx`
- `src/components/annotation/AnnotationPanel.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Footer.tsx`

Test files:

- `tests/ui/home-page.polish.test.tsx`

Test scenarios:

- No visible control on the MVP path points to unimplemented sort, share, favorite, or graph features.
- Search-to-results and results-to-annotation transitions do not visibly reset the whole page.
- Layout remains usable on both desktop and mobile widths.

Depends on:

- IU 4.3

#### IU 5.2 Motion, readability, and acceptance checklist

Outcome:

- The app has a deliberate but lightweight final-pass polish and a durable acceptance artifact.

Files:

- `src/app/globals.css`
- `src/components/search/SearchBar.tsx`
- `src/components/annotation/StreamingText.tsx`
- `src/components/wiki/WikiPanel.tsx`
- `docs/qa/reboot-mvp-acceptance-checklist.md`

Test files:

- `tests/ui/keyboard-navigation.test.tsx`

Test scenarios:

- Keyboard navigation across search, result selection, panel open/close, and back-navigation remains stable.
- Motion does not hide state transitions or block usability.
- The acceptance checklist enumerates the full user path and matches the reboot document's MVP definition.

Depends on:

- IU 5.1

## 9. Test Strategy

Automated coverage for the reboot should come from three layers:

- Unit tests for JSON loaders, search ranking, annotation assembly, and exploration state helpers
- Integration tests for `src/app/api/search/route.ts`, `src/app/api/annotate/route.ts`, and `src/app/api/health/route.ts`
- UI tests for homepage orchestration, annotation panel states, exploration stack behavior, and mobile accessibility

Manual acceptance remains necessary for:

- Visual comparison against the desired reboot interaction quality
- Mobile drawer or bottom-sheet behavior on a real browser
- Final copy quality for leaf-node and error-adjacent states

## 10. Risks and Mitigations

- Contract drift returns through "temporary" legacy aliases
  Mitigation: reject dual-field support on the MVP path and update callers immediately
- Phase 1 turns into a refactor of every legacy module
  Mitigation: quarantine unused modules by import boundaries instead of rewriting them all
- Search quality stalls because embeddings are missing or mismatched
  Mitigation: make data-loader failures explicit in phase 2 and keep sample fixtures for tests
- Annotation work pulls real streaming back into scope
  Mitigation: treat any route-level streaming work as post-phase-5, not a phase 3 requirement
- Exploration UI grows into a graph project
  Mitigation: keep phase 4 to stack navigation plus a minimal panel only

## 11. Handoff Criteria

This plan is ready for execution when:

- The source of truth remains `docs/SUPERPOWERS_REBOOT_PLAN.md` plus this implementation plan
- The branch target is `codex/reboot-mvp`
- The work will be executed phase-by-phase rather than as a single large rewrite
- Tooling, tests, and acceptance checklist are treated as deliverables, not optional cleanup

The first execution task should be phase 1, IU 1.1 and IU 1.2 together, because they establish the minimum environment needed for every later vertical slice.
