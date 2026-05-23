# Simon Rogers Main Screen Integration Plan

> **For agentic workers:** This plan is currently **blocked**. Do not implement product code until Phase 0 is complete and checked off. Work task-by-task, keep checkboxes current, verify after each phase, and do not widen scope into search, annotation, wiki, or API refactors unless a task explicitly says so.

**Created:** 2026-05-19
**Last reviewed:** 2026-05-21
**Status:** implementation in progress on clean clone
**Goal:** 接入 Simon Rogers 式沉浸文字场到 InfiDao 主屏，让首页第一视口更像“经文展场”，同时保留 reboot MVP 主路径：`query -> search -> result -> annotate -> links -> explore -> back`.

---

## 1. Current Blocking Findings

### P0: Repository Baseline Is Not Trustworthy

The current workspace cannot be used as an implementation base.

- Key app files may be present and readable, but the current repo integrity and broad deletion state are not trustworthy.
- `git status` reports broad deletion across app, docs, scripts, tests, and refs.
- Prior work found dataless/missing object risk in local files.
- `graphify-out/GRAPH_REPORT.md` is not available in this workspace, so graph findings cannot be used as a reliable local baseline.

**Hard gate:** restore a clean repo, create a fresh clone, or create a known-good worktree before touching product implementation.

### P1: Preview-First Architecture Required

Do not replace `/` first. Build the new experience at:

- `src/app/simon-rogers-preview/page.tsx`

Only after visual, interaction, a11y, and main-path regression checks pass should `/` be switched in a final small step.

### P1: Existing Home Must Be Preserved Explicitly

The plan must preserve the existing home page through Git before it is replaced.

- Create a feature branch or clean worktree for the new work.
- Preserve the old home on a separate branch or tag before switching `/`.
- Do not use `/home` as the old-home route by default: `next.config.js` already redirects `/home` to `/`.
- Include rollback commands in the final switch phase.

### P1: Desirable Friction Is A Product Requirement

The experience should occasionally slow the user down in a designed way. This is not the same as blocking input accidentally.

MVP rules:

- A short-query gate may appear before submitting when the normalized query is very short.
- A reading gate may appear after clicking a result and before annotation opens.
- Every gate must have an explicit continue or skip action.
- Reduced-motion users should get the same decision point without timed motion.

### P1: Flow Continuity Must Be Designed

The kinetic layer cannot hard-cut into a plain results page. The plan must specify the state and transition path:

`idle -> typing -> friction -> submitting -> results -> annotation -> explore -> back`

Also cover:

- `error`
- `empty results`
- `back to search`
- reduced motion

### P1: Decorative Layer and Controls Are Separate

The moving text field is decorative:

- `aria-hidden="true"`
- `pointer-events-none`
- no tab stops

The pause control is not decorative:

- separate sibling or parent-level control
- focusable
- `aria-pressed`
- at least 44px target height

### P1: Reboot MVP Main Path Needs Regression Coverage

Tests must prove the preserved path still works:

`search result -> annotate -> links/wiki explore -> back`

### P2: CSS-Only Testing Must Be Precise

- Animation cleanup test is conditional. Add it only if JS animation, rAF, observer, or event listeners are introduced.
- Reduced-motion tests should check actual computed behavior or stable rendered fallback, not only class names.

---

## 2. Product Decision

**Decision:** Use Simon Rogers-style spatial text motion as inspiration for the InfiDao main screen, but only borrow the mechanism. Do not copy external code, fonts, text, color systems, or site structure.

**MVP direction:** CSS-first kinetic text field behind the search entry experience, implemented first on a preview route.

**Do not do in MVP:**

- Do not introduce Three.js, Canvas, WebGL, iframe, or a third-party animation runtime.
- Do not reuse Simon Rogers copy, fonts, site assets, CSS, or personal visual identity.
- Do not use `setInterval(16)` or full DOM polling.
- Do not change `/api/search`, `/api/annotate`, `src/lib/search/*`, `src/lib/annotation/*`, or `src/lib/wiki/service.ts`.
- Do not migrate the current page state machine into a new global store.
- Do not replace `/` until the preview route passes review.

**Visual thesis:** 暖黑纸墨空间里，经文短句像绕着隐形柱体缓慢升起；搜索输入仍是主动作，动效只是把“写下一念，听见回应”变成展场。

---

## 3. Target Architecture

### Preview Route

Add a new route first:

- `src/app/simon-rogers-preview/page.tsx`

This route should import the shared home experience component and allow isolated browser review without changing production `/`.

### Shared Components

Recommended component split:

- `src/components/home/KineticTextField.tsx`
- `src/components/home/KineticPauseControl.tsx`
- `src/components/home/DesirableFrictionGate.tsx`
- `src/components/home/HomeEntryExperience.tsx`
- `src/components/home/kineticTextCopy.ts`

`HomeEntryExperience` owns the first-screen composition. It should receive handlers from the page layer and should not call APIs directly unless the current `/` already does so through the same boundary.

### State Model

Define a narrow local UI state model:

- `idle`: static or slow kinetic field, input ready.
- `typing`: kinetic field dims or slows; suggestions remain visible.
- `friction`: short-query direction gate or skippable reading gate.
- `submitting`: input remains visible, progress is calm and non-blocking.
- `results`: kinetic field transitions out or becomes subdued background without covering results.
- `annotation`: no kinetic overlay over annotation aside or mobile reader.
- `explore`: wiki stack remains primary; background is quiet.
- `back`: returns to a coherent search state, not a cold reset unless user explicitly resets.
- `error`: preserves query and offers retry without visual panic.

### Desirable Friction Spec

Short-query direction gate:

- Trigger when the normalized query is 1-4 CJK characters, 1-12 Latin letters, or 1-2 words.
- Do not trigger if the query is empty.
- Do not trigger again for the same normalized query in the same browser session.
- Show exactly 2-3 fixed choices from a local config, not from an external service. Suggested MVP choices:
  - `修身`: focus on inward cultivation, conduct, restraint, attention.
  - `处世`: focus on relation, timing, speech, obligation.
  - `观变`: focus on change, pattern, consequence, uncertainty.
- Selection does not silently rewrite the visible query in MVP. It records a local `selectedDirection` for framing copy and transition state, then submits the original query through the existing search handler.
- If later work wants query expansion, the expanded query must be visible and editable before submit.
- `Continue without direction` submits the original query and marks the gate complete for that normalized query.

Reading entry gate:

- Trigger after a result card action such as "沿此句入经" and before calling the existing annotation handler.
- Default dwell: 800ms; allowed range: 600-1200ms.
- Show a visible `Skip` or `Continue` control immediately.
- Auto-continue only when reduced motion is not enabled and the control remains available.
- Do not repeat for the same result id in the same browser session.
- On timeout, skip, or continue, enter the existing annotation flow; do not fork annotation state.

Keyboard and a11y rules:

- Direction choices and skip/continue controls must be reachable in tab order.
- The gate must not trap focus.
- Escape or an equivalent explicit skip action exits the current gate and continues to the next expected state.

### Visual Acceptance Spec

The "Simon Rogers-style spatial text immersion" must be testable through screenshots and DOM inspection.

First viewport hierarchy:

- The search input cluster remains the primary focal object.
- Desktop search cluster sits near the visual center, roughly 40-55% down the viewport.
- Mobile search cluster sits above the lower thumb zone, roughly 32-48% down the viewport.
- Kinetic text fills the first viewport behind the input, not inside a card.

Text field density and depth:

- Desktop shows 18-36 visible text fragments across at least three perceived depth bands.
- Mobile shows 8-18 visible text fragments with enough spacing to avoid visual noise.
- Foreground/background bands differ by opacity, blur, scale, or translate depth.
- Decorative text must not obscure the input, submit control, suggestions, or focus ring.

Motion and focus behavior:

- Motion is slow and atmospheric, not marquee-like; loop durations should generally be 24-60s.
- No large horizontal sweep across the input zone.
- While the input is focused or the user is typing, kinetic opacity/noise drops visibly.
- On submit/results, the kinetic layer fades or recedes within 250-500ms before results become primary.
- Under reduced motion, the field becomes static or near-static with no automatic drift.

Screenshot review:

- Capture desktop `1440x900`, desktop `1280x720`, mobile `390x844`, and mobile `375x667`.
- Review idle, focused input, friction gate, submitting, results, annotation, and reduced-motion states.
- A screenshot fails if text overlaps controls, focus is unclear, horizontal overflow appears, or results/annotation are covered.

### Safe Integration Boundary

The kinetic field is a visual shell only:

- Input props: `lines`, `paused`, `reducedMotion`, `phase`, `tone`.
- No search results, annotation payloads, wiki stack, or API lifecycle.
- Background layer stays `pointer-events-none` and `aria-hidden`.
- Pause/skip controls are separate interactive controls outside the decorative layer.

---

## 4. Branch, Snapshot, and Rollback Policy

### Required Before Implementation

- [x] Confirm `src/app/page.tsx`, `src/app/globals.css`, and `src/app/ritual-scroll/page.tsx` exist and are readable.
- [x] Confirm `git fsck` or equivalent repo integrity check does not report blocking object errors.
- [x] Confirm `git status --short` is understood and does not contain unexplained broad deletions.
- [x] Create or switch to a clean implementation branch, for example `codex/simon-rogers-main-screen`.
- [x] Preserve the current home page on a branch or tag before final `/` replacement.

Example commands, to be adapted to the actual clean repo state:

```bash
git switch -c codex/simon-rogers-main-screen
git branch preserve/pre-simon-home-2026-05-21
git status --short
```

### Final Switch Rollback

The final switch phase must record rollback commands before changing `/`.

Example rollback shape:

```bash
git switch codex/simon-rogers-main-screen
git restore --source preserve/pre-simon-home-2026-05-21 -- src/app/page.tsx
npm run type-check
npm run lint
```

Do not run destructive commands such as `git reset --hard` unless explicitly authorized.

---

## 5. Target File Map

### New Files

- `src/app/simon-rogers-preview/page.tsx`
- `src/components/home/HomeEntryExperience.tsx`
- `src/components/home/KineticTextField.tsx`
- `src/components/home/KineticPauseControl.tsx`
- `src/components/home/DesirableFrictionGate.tsx`
- `src/components/home/kineticTextCopy.ts`
- `tests/ui/home-page.simon-rogers-entry.test.tsx`
- `tests/ui/home-page.reduced-motion.test.tsx`
- `tests/ui/home-friction-gate.test.tsx`
- `tests/ui/home-main-path.regression.test.tsx`
- `tests/ui/simon-rogers-preview.test.tsx`

### Conditional New Files

- `tests/ui/home-page.animation-cleanup.test.tsx`, only if JS animation, rAF, observers, or event listeners are introduced.

### Modify Files

- `src/app/page.tsx`, only in final switch phase.
- `src/app/globals.css`, only for namespaced kinetic utilities.
- `tailwind.config.ts`, only for tokens/keyframes that cannot live cleanly in CSS.
- `src/app/ritual-scroll/page.tsx`, only after deciding whether it shares the new component.
- `tests/ui/ritual-scroll-page.test.tsx`, only after the route role is clarified.
- Create or update `docs/simon-rogers-adjustment-guide.md`

### Avoid Files Unless Required

- `src/app/api/search/route.ts`
- `src/app/api/annotate/route.ts`
- `src/lib/search/*`
- `src/lib/annotation/*`
- `src/lib/wiki/service.ts`

---

## 6. Milestones

| # | Milestone | Target | Success Criteria |
|---|-----------|--------|------------------|
| 0 | Repo Baseline Recovered | Before work | Clean clone/worktree, readable home files, no unexplained broad deletion |
| 1 | Preview Route Working | Day 1 | `/simon-rogers-preview` renders without touching `/` |
| 2 | UX State Spec Implemented | Day 1-2 | idle/typing/friction/submitting/results/annotation/explore/error/back are visible and testable |
| 3 | Kinetic Layer Guarded | Day 2 | decorative layer cannot block input, pause control is separate |
| 4 | MVP Main Path Preserved | Day 2-3 | search -> annotate -> links/wiki -> back regression passes |
| 5 | Final `/` Switch | After review | `/` replacement is a small patch with rollback documented |

---

## 7. Implementation Tasks

### Phase 0: Restore Repo Baseline

- [x] **Task 0.1: Establish clean implementation base**
  - Effort: 1-2h
  - Files: none expected
  - Done criteria:
    - Work happens in a clean clone or clean worktree.
    - `src/app/page.tsx`, `src/app/globals.css`, and `src/app/ritual-scroll/page.tsx` are readable.
    - Broad deletions are either gone or explicitly explained.
    - No product code changes start before this passes.

- [x] **Task 0.2: Preserve current home**
  - Effort: 30m
  - Files: Git only
  - Done criteria:
    - Existing `/` state is preserved in a branch or tag.
    - Feature branch/worktree is ready.
    - Rollback source is named in the implementation notes.

### Phase 1: Build Preview Route and Composition Boundary

- [x] **Task 1.1: Create preview route**
  - Effort: 1-2h
  - Files: `src/app/simon-rogers-preview/page.tsx`
  - Depends on: Phase 0
  - Done criteria:
    - Route renders the new entry experience without modifying `/`.
    - Route can be browser-reviewed independently.
    - No production home behavior changes.

- [x] **Task 1.2: Create owned copy source**
  - Effort: 2h
  - Files: `src/components/home/kineticTextCopy.ts`
  - Done criteria:
    - Exports short Chinese text lines grouped by type: `classic`, `thought`, `response`.
    - Uses project-owned or public-domain-safe text only.
    - Contains 12-24 short lines for MVP.

- [x] **Task 1.3: Create CSS-first kinetic component**
  - Effort: 4-6h
  - Files: `src/components/home/KineticTextField.tsx`
  - Depends on: Task 1.2
  - Done criteria:
    - Renders repeated lines with `aria-hidden="true"`.
    - Uses `pointer-events-none`.
    - Uses CSS animation with staggered delays, `transform`, `opacity`, and `perspective`.
    - No timers, DOM polling, search state, or annotation/wiki state.
    - Supports `paused` without leaking state into search flow.

- [x] **Task 1.4: Add pause control as separate control**
  - Effort: 2h
  - Files: `src/components/home/KineticPauseControl.tsx`
  - Depends on: Task 1.3
  - Done criteria:
    - Control is outside the decorative kinetic layer.
    - Keyboard-focusable, 44px target minimum, visible focus ring.
    - Uses `aria-pressed`.
    - Hidden or replaced with static status under reduced motion.

### Phase 2: Add UX Flow and Desirable Friction

- [x] **Task 2.1: Create entry experience state shell**
  - Effort: 4-6h
  - Files: `src/components/home/HomeEntryExperience.tsx`
  - Depends on: Phase 1
  - Done criteria:
    - Encodes `idle`, `typing`, `friction`, `submitting`, `results`, `annotation`, `explore`, `error`, and `back` display states.
    - Search input remains the primary action.
    - Results and annotation surfaces are never covered by the kinetic layer.

- [x] **Task 2.2: Implement desirable friction gate**
  - Effort: 3-5h
  - Files: `src/components/home/DesirableFrictionGate.tsx`
  - Depends on: Task 2.1
  - Done criteria:
    - Short query gate follows the threshold and same-session repeat rules in the Desirable Friction Spec.
    - Direction choices are fixed local options and do not silently rewrite the visible query.
    - Result entry gate runs after result click and before annotation, with 800ms default dwell and 600-1200ms allowed range.
    - Skip/continue lands in the expected next state: search submit for query gate, annotation flow for reading gate.
    - Gate never traps keyboard or screen reader users.

- [x] **Task 2.3: Add namespaced styles**
  - Effort: 2-3h
  - Files: `src/app/globals.css`, optionally `tailwind.config.ts`
  - Depends on: Task 1.3
  - Done criteria:
    - Adds namespaced utilities such as `.kinetic-text-stage`, `.kinetic-text-perspective`, `.kinetic-text-line`.
    - Adds namespaced keyframes, not generic `scroll-up` changes that could affect `/ritual-scroll`.
    - Uses existing paper/ink/zen/seal style tokens where available.
    - Avoids high-saturation blue/purple and pure black.

- [x] **Task 2.4: Lock visual acceptance contract**
  - Effort: 1-2h
  - Files: `src/components/home/HomeEntryExperience.tsx`, `src/components/home/KineticTextField.tsx`, `src/app/globals.css`
  - Depends on: Task 2.1, Task 2.3
  - Done criteria:
    - Implements the first viewport hierarchy from the Visual Acceptance Spec.
    - Implements desktop/mobile text density and at least three perceived depth bands.
    - Focus/typing visibly reduces kinetic noise.
    - Submit/results state fades or recedes the kinetic layer within 250-500ms.
    - Reduced motion renders a static or near-static field.

### Phase 3: Preview Verification Before `/`

- [x] **Task 3.1: Preview route tests**
  - Effort: 3-4h
  - Files: `tests/ui/simon-rogers-preview.test.tsx`
  - Depends on: Phase 2
  - Done criteria:
    - Preview route renders input, submit, and kinetic field.
    - Decorative layer is not focusable.
    - Pause control is focusable and independent.
    - Initial render does not call `/api/search` or `/api/annotate`.

- [x] **Task 3.2: Reduced-motion behavior test**
  - Effort: 3-4h
  - Files: `tests/ui/home-page.reduced-motion.test.tsx`
  - Depends on: Phase 2
  - Done criteria:
    - Mocks `prefers-reduced-motion: reduce`.
    - Verifies computed animation is disabled or static fallback is rendered.
    - Main input and submit remain usable.
    - Static fallback does not duplicate screen reader content.

- [x] **Task 3.3: Friction gate test**
  - Effort: 3-4h
  - Files: `tests/ui/home-friction-gate.test.tsx`
  - Depends on: Phase 2
  - Done criteria:
    - Runs against `/simon-rogers-preview` or a shared `HomeEntryExperience` harness before `/` is switched.
    - Short query shows 2-3 direction choices.
    - Continue without direction and direction selection both reach the correct search submit state.
    - Result reading gate appears after result click and before annotation.
    - Skip/continue reaches annotation flow without trapping keyboard focus.
    - Same query/result gate does not repeat in the same session.

- [x] **Task 3.4: Main path regression test**
  - Effort: 4-6h
  - Files: `tests/ui/home-main-path.regression.test.tsx`
  - Depends on: Phase 2
  - Done criteria:
    - Runs against `/simon-rogers-preview` or a shared `HomeEntryExperience` harness before `/` is switched.
    - Covers search result -> annotate -> links/wiki explore -> back.
    - Confirms query/results state remains coherent after back.
    - Confirms kinetic layer does not cover annotation aside or mobile reader.

- [x] **Task 3.5: Conditional cleanup test**
  - Effort: 0-4h
  - Files: `tests/ui/home-page.animation-cleanup.test.tsx`
  - Depends on: Phase 2
  - Done criteria:
    - If MVP stays CSS-only, document that no cleanup test is required.
    - If JS animation is introduced, verify observer disconnect, frame cancellation, and listener cleanup.

### Phase 4: Decide `/ritual-scroll` Role

- [x] **Task 4.1: Decide route role**
  - Effort: 1h
  - Files: `src/app/ritual-scroll/page.tsx`
  - Depends on: Phase 3
  - Done criteria:
    - Either `/ritual-scroll` wraps the shared kinetic component, or remains an explicitly separate experiment.
    - No duplicate Simon Rogers implementation drifts across multiple files.

- [x] **Task 4.2: Create or update stale docs/tests**
  - Effort: 1-2h
  - Files: create or update `docs/simon-rogers-adjustment-guide.md`, update `tests/ui/ritual-scroll-page.test.tsx`
  - Depends on: Task 4.1
  - Done criteria:
    - Removes stale route references that no longer describe the architecture.
    - Points to the preview route and shared component.
    - Explains safe knobs: speed, delay, opacity, depth, pause, reduced motion.

### Phase 5: Final Switch to `/`

- [x] **Task 5.0: Record rollback before touching `/`**
  - Effort: 30m
  - Files: implementation notes or PR description
  - Depends on: Phase 3 review pass, Task 0.2
  - Done criteria:
    - Names preserved old-home branch/tag.
    - Lists exact rollback command for `src/app/page.tsx`.
    - States that `/home` was not used because it redirects to `/`.
    - Completed before `src/app/page.tsx` is modified.

- [x] **Task 5.1: Prepare final switch patch**
  - Effort: 1-2h
  - Files: `src/app/page.tsx`
  - Depends on: Task 5.0
  - Done criteria:
    - `/` imports or composes the previewed `HomeEntryExperience`.
    - Patch is small and easy to revert.
    - Existing search/annotation/wiki handlers are preserved.

- [x] **Task 5.2: Add home entry regression test**
  - Effort: 2-3h
  - Files: `tests/ui/home-page.simon-rogers-entry.test.tsx`
  - Depends on: Task 5.1
  - Done criteria:
    - Runs against `/` after the final switch.
    - Home title/input/submit/suggestions still render.
    - Kinetic layer is decorative and not focusable.
    - Search flow still uses the existing handler boundary.

- [x] **Task 5.3: Verify rollback remains accurate**
  - Effort: 30m
  - Files: implementation notes or PR description
  - Depends on: Task 5.1
  - Done criteria:
    - Existing rollback note still points at the preserved old-home branch/tag.
    - Rollback command still applies cleanly to `src/app/page.tsx`.
    - Any final switch changes are reflected in the implementation notes.

### Phase 6: Verification

- [x] **Task 6.1: Focused automated verification**
  - Effort: 1-2h
  - Commands:
    - `npm test -- tests/ui/simon-rogers-preview.test.tsx --runInBand`
    - `npm test -- tests/ui/home-page.simon-rogers-entry.test.tsx --runInBand`
    - `npm test -- tests/ui/home-page.reduced-motion.test.tsx --runInBand`
    - `npm test -- tests/ui/home-friction-gate.test.tsx --runInBand`
    - `npm test -- tests/ui/home-main-path.regression.test.tsx --runInBand`
    - `npm test -- tests/ui/search-bar.test.tsx tests/ui/annotation-panel.a11y.test.tsx --runInBand`
  - Done criteria:
    - All focused tests pass.

- [x] **Task 6.2: Core gates**
  - Effort: 1-2h
  - Commands:
    - `npm run type-check`
    - `npm run lint`
    - `npm test -- --runInBand`
  - Done criteria:
    - No type/lint/test regression.

- [x] **Task 6.3: Browser visual review**
  - Effort: 2-4h
  - Viewports:
    - Desktop `1440x900`
    - Desktop `1280x720`
    - Mobile `390x844`
    - Mobile `375x667`
  - Done criteria:
    - Screenshots cover idle, focused input, friction gate, submitting, results, annotation, and reduced-motion states.
    - Input is never blocked.
    - No horizontal overflow.
    - Focus ring visible over kinetic layer.
    - Search result, annotation aside, mobile reader remain unobstructed.
    - Reduced motion produces a calm static experience.
    - The preview route and `/` match after final switch.

---

## 8. Acceptance Criteria

- [x] Phase 0 is complete before implementation starts.
- [x] `/simon-rogers-preview` lands and passes review before `/` changes.
- [x] Existing `/` is preserved through branch/tag before replacement.
- [x] Rollback instructions are written before final switch.
- [x] Main screen first viewport clearly has Simon Rogers-style spatial text immersion.
- [x] Search remains the primary action and is never accidentally blocked.
- [x] Desirable friction is designed, skippable, and testable.
- [x] Search, annotation, links/wiki, and back data flow remain unchanged.
- [x] Decorative kinetic layer is `aria-hidden` and outside tab order.
- [x] Pause/skip controls are independent interactive controls.
- [x] `prefers-reduced-motion` has a complete static or reduced experience.
- [x] All new styles use project visual tokens and namespaced kinetic selectors.
- [x] No new runtime dependency is added.
- [x] No external personal copy, fonts, iframe, or archived third-party script is reused.
- [x] Focused tests, type-check, lint, and Jest pass.

---

## 9. Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Dirty repo causes false implementation | Critical | High | Phase 0 hard gate; clean clone/worktree before coding |
| `/` replacement loses old home | High | Medium | Preserve branch/tag; final switch is separate; rollback command recorded |
| Preview diverges from final `/` | Medium | Medium | Shared `HomeEntryExperience`; final `/` composes previewed component |
| Visual layer blocks input | High | Medium | `pointer-events-none`, z-index audit, browser screenshots |
| Pause control becomes hidden with background | Medium | Medium | Separate control outside decorative layer |
| Desirable friction becomes frustrating | Medium | Medium | Short duration, explicit skip/continue, keyboard safe |
| Motion harms accessibility | High | Medium | pause button, reduced motion, computed behavior tests |
| `page.tsx` state machine breaks | High | Medium | Keep kinetic component stateless relative to search/annotation/wiki |
| Animation costs too much CPU | Medium | Medium | CSS-first MVP; no polling; conditional cleanup test |
| Mobile reader covered by fixed layer | High | Low | Transition layer out before annotation; mobile path regression |
| Copyright/style overcopying | Medium | Medium | Owned Chinese copy and project tokens only |

---

## 10. Future Enhancements

Only after MVP passes:

- Query-reactive text field: background phrases adapt to bridge concepts from the current question.
- Center focus via `requestAnimationFrame + IntersectionObserver`, borrowed from `/ritual-scroll`, not `setInterval`.
- Sumie-inspired CSS mask/blur/noise for search hit moments.
- Browser-level Playwright visual regression with desktop/mobile/reduced-motion screenshots.
- Real a11y scanner via `jest-axe` or `@axe-core/playwright`.

---

## 11. Executor Notes

- Treat this as blocked until Phase 0 is checked off.
- Build in preview route first; do not touch `/` during preview work.
- Treat `src/app/page.tsx` as the final orchestration boundary and keep the final patch small.
- Prefer one reusable component over multiple experiment implementations.
- If a task requires changing search/annotation APIs, stop and write a deviation note before proceeding.
- Before final handoff, summarize changed files, verification commands, and any unverified visual risks.
