# UI Accessibility and Quality Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed accessibility release blockers and correctness debt without changing the Reboot MVP search, annotation, or exploration contracts.

**Architecture:** Keep `HomeEntryExperience` as the active orchestration surface, but move transient overlays onto the existing Radix Dialog primitive, give search and annotation transitions explicit focus targets, and keep sticky elements outside overflow scroll containers. Introduce semantic color and font contracts at the design-system boundary, delete disconnected pre-reboot API state layers instead of adapting them, and use real Fetch API responses in server-route tests.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript 5.6, Tailwind CSS 3.4, Radix Dialog, Jest + Testing Library, Playwright Chromium for the one browser-only sticky/focus verification, Fontsource self-hosted fonts.

**Spec:** `docs/SUPERPOWERS_REBOOT_PLAN.md`, `docs/plans/reboot-mvp-implementation-plan.md`, `docs/superpowers/specs/2026-08-30-playwright-e2e-design.md`

## Global Constraints

- Preserve the public flow: `query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state`.
- Preserve the confirmed decision that Playwright E2E stays outside `.github/workflows/reboot-mvp-ci.yml`; browser tests remain local/manual release checks.
- Treat WCAG AA `4.5:1` as the minimum ratio for normal text and `3:1` for large text and meaningful non-text controls.
- Preserve the stone/paper/zen palette and restrained seal-red accent; accessibility changes use semantic tokens rather than replacing the visual system.
- Query and reading gates are modal interruptions: focus enters the gate, Tab stays inside, Escape cancels the gate, and cancellation restores the trigger.
- Reading gates do not disappear on a timer. Entering annotation requires an explicit `继续入经` action.
- Escape from a reading gate must not start an annotation request or set the session-completion flag.
- No new global state library or parallel frontend state path is introduced.
- Delete disconnected pre-reboot search/annotation hooks and stores; do not adapt them to coexist with `HomeEntryExperience`.
- Before Task 1 starts, the existing uncommitted Playwright work must be completed and committed as its own baseline by its current owner. If that baseline is still uncommitted, execute the test/edit steps but skip every commit step in this plan; staging whole files such as `package.json` or `tests/e2e/reboot-mvp.spec.ts` would otherwise absorb unrelated work.
- After the Playwright baseline exists, every commit step stages only the files named by that task.
- Do not create a branch as part of this plan.

## Finding Disposition

| Finding                              | Plan treatment                                                            |
| ------------------------------------ | ------------------------------------------------------------------------- |
| #1 color contrast                    | Fix in Task 1; release-blocking.                                          |
| #2 friction-gate focus/timing        | Fix in Task 2.                                                            |
| #3 overflow breaks sticky            | Fix in Task 4 and verify in a real browser.                               |
| #4 search completion announcement    | Fix in Task 5.                                                            |
| #5 desktop focus loss                | Fix in Task 3.                                                            |
| #6 decorative/repeated semantics     | Fix in Task 5.                                                            |
| #7 excluded drifted state layers     | Fix in Task 7 by deletion and restored static coverage.                   |
| #8 E2E absent from GitHub Actions    | Accepted architecture risk; no workflow change.                           |
| #9 Response mock/source-string tests | Split: real Response in Task 8; replace only brittle behavior assertions. |
| #10 nested state setters             | Fix in Task 6.                                                            |
| #11 unshipped fonts                  | Fix in Task 9 with self-hosted Fontsource packages.                       |

---

### Task 1: Add accessible semantic text colors

**Files:**

- Modify: `src/app/globals.css:10-88`
- Modify: `tailwind.config.ts:16-32`
- Modify: `src/components/home/HomeEntryExperience.tsx:1390-1450`
- Modify: `src/components/annotation/AnnotationPanel.tsx:115-375`
- Create: `tests/unit/ui/color-contrast.test.ts`
- Modify: `tests/ui/layout-polish.test.tsx:35-100`

**Interfaces:**

- Consumes: existing `--background`, `--reader-surface`, `--reader-surface-muted`, and `--seal` HSL tokens.
- Produces: `--text-subdued`, `--seal-foreground`, Tailwind `text-subdued`, and Tailwind `text-seal-foreground`.

- [ ] **Step 1: Write the failing token contrast test**

Create `tests/unit/ui/color-contrast.test.ts` with a CSS-variable parser and WCAG ratio calculation. The assertions must cover every supported dark reading surface:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

type Rgb = readonly [number, number, number];

function readHslVariable(source: string, name: string): readonly [number, number, number] {
  const match = source.match(
    new RegExp(`--${name}:\\s*(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`),
  );
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Missing HSL variable: ${name}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function hslToRgb([hue, saturationPercent, lightnessPercent]: readonly [
  number,
  number,
  number,
]): Rgb {
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = lightness - chroma / 2;
  const raw =
    section < 1
      ? [chroma, x, 0]
      : section < 2
        ? [x, chroma, 0]
        : section < 3
          ? [0, chroma, x]
          : section < 4
            ? [0, x, chroma]
            : section < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return raw.map(channel => Math.round((channel + offset) * 255)) as unknown as Rgb;
}

function luminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("reader text color contrast", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const surfaces = ["background", "reader-surface", "reader-surface-muted"] as const;

  it.each(["text-subdued", "seal-foreground"] as const)(
    "keeps %s at 4.5:1 on every reader surface",
    token => {
      const foreground = hslToRgb(readHslVariable(css, token));
      for (const surface of surfaces) {
        expect(
          contrast(foreground, hslToRgb(readHslVariable(css, surface))),
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
```

- [ ] **Step 2: Run the test and verify the semantic tokens are missing**

Run:

```bash
npm test -- tests/unit/ui/color-contrast.test.ts --runInBand
```

Expected: FAIL with `Missing HSL variable: text-subdued`.

- [ ] **Step 3: Add the semantic tokens and Tailwind mappings**

Add the same values under both `:root` and `.dark` in `src/app/globals.css`:

```css
--text-subdued: 28 12% 60%;
--seal-foreground: 7 55% 67%;
```

Extend `tailwind.config.ts` without changing the existing decorative `seal` color:

```ts
colors: {
  subdued: "hsl(var(--text-subdued))",
  seal: {
    DEFAULT: "hsl(var(--seal))",
    foreground: "hsl(var(--seal-foreground))",
  },
}
```

- [ ] **Step 4: Replace failing user-visible text classes**

In `HomeEntryExperience.tsx`, change all four visible small-copy uses at the intro/result headings (`INFIDAO`, `写下一念，按回车回应`, `沿下一句探索`, and `此刻一念`) from `text-stone-500`/`text-stone-600` to `text-subdued`. For example:

```tsx
className = "mt-12 hidden text-xs tracking-[0.26em] text-subdued md:block";
```

```tsx
className = "hidden text-right text-xs tracking-[0.26em] text-subdued md:block";
```

In `AnnotationPanel.tsx`, use `text-seal-foreground` for the textual labels `断`, `卷首 · 此刻一念`, `原句 · 此刻一念`, `注`, and `止`. Change the `原句与段落标尺` summary and the four reading-stage labels from `text-stone-500` to `text-subdued`. Keep `border-seal/*` unchanged, because the darker red remains the decorative border token. The centered `·` separators and disabled-control colors may retain `text-stone-600`, because they are decorative or exempt disabled states.

- [ ] **Step 5: Update the design-token contract test**

Add these exact assertions to `tests/ui/layout-polish.test.tsx`:

```ts
expect(globalsSource).toContain("--text-subdued:");
expect(globalsSource).toContain("--seal-foreground:");
expect(tailwindSource).toContain('subdued: "hsl(var(--text-subdued))"');
expect(tailwindSource).toContain('foreground: "hsl(var(--seal-foreground))"');
```

- [ ] **Step 6: Run focused verification**

Run:

```bash
npm test -- tests/unit/ui/color-contrast.test.ts tests/ui/layout-polish.test.tsx --runInBand
npm run type-check:app
npm run lint
rg -n "text-stone-(500|600)|text-seal(?:[\\s\"/])" src/components/home/HomeEntryExperience.tsx src/components/annotation/AnnotationPanel.tsx
```

Expected: tests and static checks pass with zero warnings. The final search reports only centered decorative separators and disabled-control classes; it reports no user-readable label using `text-stone-500`, `text-stone-600`, or `text-seal`.

- [ ] **Step 7: Commit only the color work**

```bash
git add src/app/globals.css tailwind.config.ts src/components/home/HomeEntryExperience.tsx src/components/annotation/AnnotationPanel.tsx tests/unit/ui/color-contrast.test.ts tests/ui/layout-polish.test.tsx
git commit -m "fix: meet reader text contrast requirements"
```

---

### Task 2: Give friction gates a real modal and cancellation lifecycle

**Files:**

- Modify: `src/components/home/DesirableFrictionGate.tsx`
- Modify: `src/components/home/HomeEntryExperience.tsx:80-120, 940-1125, 1360-1390`
- Modify: `src/components/search/SearchBar.tsx:70-110`
- Modify: `tests/ui/home-friction-gate.test.tsx`
- Modify: `tests/ui/home-page.animation-cleanup.test.tsx`

**Interfaces:**

- Consumes: `@radix-ui/react-dialog`, `PendingQueryGate`, `PendingReadingGate`, `focusResultAction()`.
- Produces: `onCancel: () => void`, query `returnFocusId`, explicit reading confirmation, and Escape cancellation that never performs search/annotation.

- [ ] **Step 1: Replace timer-oriented tests with modal lifecycle tests**

Add tests that assert initial focus, Escape behavior, and focus restoration. The reading-gate test must use the real focused button instead of dispatching `keydown` directly to a non-focusable region:

```tsx
it("focuses the reading gate and Escape returns to the result without annotating", async () => {
  render(<SimonRogersPreviewPage />);
  fireEvent.change(screen.getByLabelText("输入此刻的一念"), { target: { value: "如何面对困境" } });
  fireEvent.click(screen.getByRole("button", { name: "请经典回应" }));
  const resultAction = await screen.findByRole("button", { name: "用这一句回应我" });
  fireEvent.click(resultAction);

  const dialog = screen.getByRole("dialog", { name: "入经前停顿" });
  await waitFor(() => expect(dialog).toContainElement(document.activeElement));
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });

  await waitFor(() => expect(resultAction).toHaveFocus());
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "入经前停顿" })).not.toBeInTheDocument();
});
```

Add a fake-timer test that advances 10 seconds and confirms the gate is still present and `onContinue` has not fired.

- [ ] **Step 2: Run the focused tests and verify current behavior fails**

Run:

```bash
npm test -- tests/ui/home-friction-gate.test.tsx tests/ui/home-page.animation-cleanup.test.tsx --runInBand
```

Expected: FAIL because the current gate is a `region`, it does not own focus, and the reading gate auto-completes.

- [ ] **Step 3: Rebuild `DesirableFrictionGate` with Radix Dialog**

Replace the fixed `role="region"` wrappers and dwell timer with the existing Radix primitive:

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { useId } from "react";

interface GateLifecycleProps {
  onCancel: () => void;
}

export function DesirableFrictionGate(props: DesirableFrictionGateProps & GateLifecycleProps) {
  const descriptionId = useId();

  return (
    <Dialog.Root
      open
      onOpenChange={open => {
        if (!open) props.onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-ink/65 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={descriptionId}
          className="fixed left-1/2 top-[18vh] z-40 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 border-y border-zen/45 bg-ink/95 px-5 py-6 text-paper shadow-[0_24px_80px_-46px_rgba(199,179,139,0.55)] md:top-[24vh] md:px-8 md:py-8"
        >
          <Dialog.Title className="text-2xl leading-snug font-classic md:text-3xl">
            {props.mode === "query"
              ? `“${props.query}” 很短，可以先选一个入经方向。`
              : props.targetLabel}
          </Dialog.Title>
          <Dialog.Description id={descriptionId} className="mt-3 text-sm leading-7 text-stone-300">
            {props.mode === "query"
              ? "方向只记录为本次阅读语气，不会改写你的原问。"
              : "先停一息，再决定是否让注语展开。"}
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Move the current query direction grid and reading passage/button group from `DesirableFrictionGate.tsx:103-166` directly between `Dialog.Description` and `Dialog.Content`. Do not change their direction selection callbacks in this step. Remove `gateKey`, its reset effect, `dwellMs`, `readingDwellMs`, `readingReducedMotion`, the timeout effect, and `onKeyDown` on the container. Radix owns Tab trapping and Escape detection.

- [ ] **Step 4: Make reading cancellation distinct from continuation**

Replace the reading button pair with:

```tsx
<Dialog.Close asChild>
  <button
    type="button"
    className="inline-flex min-h-11 items-center justify-center border border-stone-700 px-5 py-2 text-sm tracking-[0.16em] text-stone-300 transition hover:border-zen hover:text-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
  >
    返回回应列表
  </button>
</Dialog.Close>
<button
  type="button"
  onClick={() => complete("continue")}
  className="inline-flex min-h-11 items-center justify-center border border-zen bg-zen px-5 py-2 text-sm tracking-[0.16em] text-ink transition hover:border-paper hover:bg-paper active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink"
>
  继续入经
</button>
```

`onCancel` must not call `complete("continue")` or write the reading session flag.

- [ ] **Step 5: Capture and restore the query trigger**

Give the SearchBar submit button a stable id:

```tsx
<button
  id={`${inputId}-submit`}
  type="submit"
  disabled={!canSubmit}
  className={`inline-flex min-w-40 items-center justify-center rounded-full border px-6 py-3 text-sm tracking-[0.28em] transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-zen focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-not-allowed disabled:border-stone-800 disabled:bg-transparent disabled:text-stone-700 disabled:shadow-none disabled:active:scale-100 ${
    hasQuery
      ? "border-zen bg-zen text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] hover:border-paper hover:bg-paper"
      : "border-stone-700 text-stone-300 hover:border-zen hover:text-paper"
  }`}
>
  {isLoading ? "经典回应中" : "请经典回应"}
</button>
```

Extend `PendingQueryGate` with `returnFocusId: string`. In `handleSearch`, capture the current focused id with a stable fallback:

```ts
const returnFocusId =
  document.activeElement instanceof HTMLElement && document.activeElement.id
    ? document.activeElement.id
    : "thought-query";
setPendingQueryGate({ query: nextQuery, normalizedQuery, returnFocusId });
```

Add `cancelQueryGate()` that stores the id, clears the pending gate, and schedules `document.getElementById(returnFocusId)?.focus()` in `requestAnimationFrame`.

- [ ] **Step 6: Add reading cancellation in `HomeEntryExperience`**

Add:

```ts
const cancelReadingGate = () => {
  const passageId = pendingReadingGate?.passageId ?? null;
  setPendingReadingGate(null);
  focusResultAction(passageId);
};
```

Pass `onCancel={cancelReadingGate}` to the reading gate and `onCancel={cancelQueryGate}` to the query gate. Keep `completeReadingGate()` as the only path that writes `READING_FRICTION_SESSION_PREFIX` and invokes `performAnnotate()`.

- [ ] **Step 7: Run gate verification**

Run:

```bash
npm test -- tests/ui/home-friction-gate.test.tsx tests/ui/home-page.animation-cleanup.test.tsx tests/ui/home-page.search.test.tsx --runInBand
npm run type-check:app
npm run lint
```

Expected: gates are exposed as dialogs, focus is inside them, Escape cancels, cancellation restores focus, and advancing timers never starts a request.

- [ ] **Step 8: Commit only the modal lifecycle**

```bash
git add src/components/home/DesirableFrictionGate.tsx src/components/home/HomeEntryExperience.tsx src/components/search/SearchBar.tsx tests/ui/home-friction-gate.test.tsx tests/ui/home-page.animation-cleanup.test.tsx
git commit -m "fix: make friction gates keyboard-safe dialogs"
```

---

### Task 3: Move focus into desktop annotation and preserve return focus

**Files:**

- Modify: `src/components/home/HomeEntryExperience.tsx:640-835, 985-1090, 1250-1300, 1525-1560`
- Modify: `tests/ui/home-main-path.regression.test.tsx`
- Modify: `tests/ui/home-page.search.test.tsx`

**Interfaces:**

- Consumes: `activeReadingTarget`, `isDesktopLayout`, `hasAnnotationSurface`, `mobileAnnotationReaderRef`.
- Produces: `desktopAnnotationReaderRef`, a focusable annotation region, and one focus-handoff effect shared by loading/success/error states.

- [ ] **Step 1: Add failing desktop focus tests**

After clicking `继续入经`, assert that focus moves to the desktop annotation region while the annotation request is pending:

```tsx
const continueButton = screen.getByRole("button", { name: "继续入经" });
fireEvent.click(continueButton);
await waitFor(() => {
  expect(screen.getByRole("region", { name: "注我阅读视图" })).toHaveFocus();
});
```

Add a second assertion that returning to the result list on mobile restores `annotation-action-${passageId}`.

- [ ] **Step 2: Run the tests and verify desktop focus has no destination**

Run:

```bash
npm test -- tests/ui/home-main-path.regression.test.tsx tests/ui/home-page.search.test.tsx --runInBand
```

Expected: FAIL because only the mobile reader currently calls `.focus()`.

- [ ] **Step 3: Make the annotation surface a focusable named region**

Add a desktop ref and update `renderAnnotationSurface`:

```tsx
const desktopAnnotationReaderRef = useRef<HTMLDivElement | null>(null);

const renderAnnotationSurface = (idPrefix: string, placement: "desktop" | "mobile") => (
  <div
    ref={placement === "desktop" ? desktopAnnotationReaderRef : undefined}
    role="region"
    aria-label="注我阅读视图"
    tabIndex={-1}
    className="text-stone-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zen/45"
  >
    <WikiPanel stack={wikiStack} onBack={handleWikiBack} placement={placement} />
    <AnnotationPanel
      idPrefix={idPrefix}
      query={searchQuery}
      annotation={annotation}
      isLoading={isAnnotating}
      error={annotationError}
      targetLabel={annotationTargetLabel}
      activeTab={activeAnnotationTab}
      onActiveTabChange={setActiveAnnotationTab}
      onWikiNavigate={handleWikiNavigate}
      onRetry={handleAnnotationRetry}
      placement={placement}
    />
  </div>
);
```

- [ ] **Step 4: Generalize the existing focus effect**

Keep the mobile scroll behavior, but select the correct reader before scheduling focus:

```ts
useEffect(() => {
  if (!hasAnnotationSurface || activeReadingTarget === null) return undefined;
  const reader = isDesktopLayout
    ? desktopAnnotationReaderRef.current
    : isMobileAnnotationReaderOpen
      ? mobileAnnotationReaderRef.current
      : null;
  if (!reader) return undefined;

  const frame = window.requestAnimationFrame(() => {
    reader.focus({ preventScroll: true });
    if (!isDesktopLayout)
      reader.scrollIntoView({ block: "start", behavior: prefersReducedMotion ? "auto" : "smooth" });
  });
  return () => window.cancelAnimationFrame(frame);
}, [
  activeReadingTarget,
  hasAnnotationSurface,
  isDesktopLayout,
  isMobileAnnotationReaderOpen,
  prefersReducedMotion,
]);
```

- [ ] **Step 5: Run focused verification**

Run:

```bash
npm test -- tests/ui/home-main-path.regression.test.tsx tests/ui/home-page.search.test.tsx --runInBand
npm run type-check:app
npm run lint
```

Expected: desktop and mobile reader focus tests pass without changing request counts or search results.

- [ ] **Step 6: Commit only focus handoff changes**

```bash
git add src/components/home/HomeEntryExperience.tsx tests/ui/home-main-path.regression.test.tsx tests/ui/home-page.search.test.tsx
git commit -m "fix: hand focus to annotation readers"
```

---

### Task 4: Restore sticky positioning by removing false scroll containers

**Files:**

- Modify: `src/components/home/HomeEntryExperience.tsx:690-745, 1275-1335, 1540-1560`
- Modify: `src/components/annotation/AnnotationPanel.tsx:115-375`
- Modify: `tests/ui/home-page.search.test.tsx`
- Modify: `tests/e2e/reboot-mvp.spec.ts`

**Interfaces:**

- Consumes: desktop `aside.lg:sticky`, mobile reader header `sticky top-0`, mobile action bar `sticky bottom-0`.
- Produces: a non-scroll-container page shell and annotation wrappers; clipping remains on the absolute decorative layer.

- [ ] **Step 1: Add a failing structural regression test**

Render `HomePage`, complete a search and annotation, then assert the shell and annotation region do not use `overflow-hidden` while the decorative layer still does:

```tsx
const shell = container.firstElementChild as HTMLElement;
const decorativeLayer = container.querySelector(".pointer-events-none.absolute.inset-0");
const annotationPanel = container.querySelector(".annotation-panel");
expect(shell).not.toHaveClass("overflow-hidden");
expect(decorativeLayer).toHaveClass("overflow-hidden");
expect(screen.getByRole("region", { name: "注我阅读视图" })).not.toHaveClass("overflow-hidden");
expect(annotationPanel).not.toHaveClass("overflow-hidden");
```

- [ ] **Step 2: Run the test and verify the current false scroll containers fail it**

Run:

```bash
npm test -- tests/ui/home-page.search.test.tsx --runInBand
```

Expected: FAIL on the root and annotation wrappers.

- [ ] **Step 3: Change clipping to `overflow-x-clip` only where required**

Change the root shell to:

```tsx
className = "relative min-h-screen min-h-[100dvh] overflow-x-clip ritual-shell text-paper";
```

Keep `overflow-hidden` on the `pointer-events-none absolute inset-0` decorative layer. Remove `overflow-hidden` from the annotation surface wrapper and the successful/mobile `AnnotationPanel` root. Error/loading panels may retain clipping only if they contain no sticky descendant.

Add a stable selector to the mobile action bar:

```tsx
<div
  data-testid="mobile-annotation-actions"
  className="sticky bottom-0 z-10 border-t border-stone-800/70 bg-ink/92 px-4 py-2 backdrop-blur"
>
```

- [ ] **Step 4: Add a real-browser sticky assertion to the existing local E2E**

After annotation content appears in `tests/e2e/reboot-mvp.spec.ts`, verify the desktop reader stays at its `top-8` offset after scrolling:

```ts
if (test.info().project.name === "desktop") {
  const reader = page.getByRole("region", { name: "注我阅读视图" });
  await reader.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 500));
  const box = await reader.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(24);
  expect(box!.y).toBeLessThanOrEqual(40);
}
```

For the mobile project, scroll the annotation content and assert the bottom action bar remains within 2px of `window.innerHeight`:

```ts
if (test.info().project.name === "mobile") {
  const actionBar = page.getByTestId("mobile-annotation-actions");
  await actionBar.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 400));
  const position = await actionBar.evaluate(element => ({
    bottom: element.getBoundingClientRect().bottom,
    viewportHeight: window.innerHeight,
  }));
  expect(Math.abs(position.viewportHeight - position.bottom)).toBeLessThanOrEqual(2);
}
```

- [ ] **Step 5: Run unit and browser verification**

Run:

```bash
npm test -- tests/ui/home-page.search.test.tsx --runInBand
npm run test:e2e -- --project=desktop --project=mobile
```

Expected: the structural test passes and both sticky assertions pass in Chromium. This is the one browser-only verification required by the finding; do not add it to GitHub Actions.

- [ ] **Step 6: Commit only overflow/sticky changes**

```bash
git add src/components/home/HomeEntryExperience.tsx src/components/annotation/AnnotationPanel.tsx tests/ui/home-page.search.test.tsx tests/e2e/reboot-mvp.spec.ts
git commit -m "fix: restore sticky reader positioning"
```

---

### Task 5: Announce search completion and hide decorative duplicates

**Files:**

- Modify: `src/components/search/SearchResults.tsx`
- Modify: `src/components/home/HomeEntryExperience.tsx:1324-1355`
- Modify: `src/app/ritual-scroll/page.tsx:166-210`
- Modify: `tests/ui/home-page.search.test.tsx`
- Modify: `tests/ui/home-main-path.regression.test.tsx`
- Modify: `tests/ui/ritual-scroll-page.test.tsx`

**Interfaces:**

- Consumes: `results`, `query`, `mode`, `bridgeSummary`, `LINE_GROUPS`.
- Produces: one persistent search status message, one accessible ritual-scroll content copy, and one level-one heading.

- [ ] **Step 1: Add failing accessibility behavior tests**

For search success:

```tsx
expect(
  await screen.findByRole("status", { name: "已找到 1 则关于如何治理国家的经典回应" }),
).toBeInTheDocument();
```

For the home atmosphere:

```tsx
const atmosphere = container.querySelector("[data-home-atmosphere]");
expect(atmosphere).toHaveAttribute("aria-hidden", "true");
```

For ritual scroll:

```tsx
expect(screen.getByRole("main")).toBeInTheDocument();
expect(screen.getByRole("heading", { level: 1, name: "六经注我" })).toBeInTheDocument();
expect(container.querySelector("[data-line-group='second']")).toHaveAttribute(
  "aria-hidden",
  "true",
);
```

- [ ] **Step 2: Run the tests and verify the missing semantics**

Run:

```bash
npm test -- tests/ui/home-page.search.test.tsx tests/ui/home-main-path.regression.test.tsx tests/ui/ritual-scroll-page.test.tsx --runInBand
```

Expected: FAIL because search success has no status, the home atmosphere wrapper is not hidden, and ritual-scroll has no main/h1 or hidden duplicate.

- [ ] **Step 3: Add a stable result announcement**

At the top of `SearchResults`, add:

```tsx
const modeLabel = isBridge ? "经典词路" : isFallback ? "旁通入口" : "经典回应";

<p
  role="status"
  aria-live="polite"
  aria-atomic="true"
  aria-label={`已找到 ${results.length} 则关于${query}的${modeLabel}`}
  className="sr-only"
>
  已找到 {results.length} 则关于{query}的{modeLabel}
</p>;
```

The status remains mounted for the lifetime of the result list. Do not put `role="status"` on the entire results container.

- [ ] **Step 4: Hide the complete home atmosphere layer**

Change the absolute decorative wrapper to:

```tsx
<div
  data-home-atmosphere
  aria-hidden="true"
  className="pointer-events-none absolute inset-0 overflow-hidden"
>
```

Keep `KineticTextField`'s own `aria-hidden="true"`; nested hiding is harmless and makes the component safe when reused elsewhere.

- [ ] **Step 5: Give ritual-scroll one accessible copy and heading**

Replace the root `<div>`/`</div>` pair at `ritual-scroll/page.tsx:167-209` with this exact `<main>` class expression:

```tsx
<main
  className={
    shouldRenderStatic
      ? "min-h-screen min-h-[100dvh] overflow-y-auto bg-background py-12"
      : "fixed inset-0 overflow-hidden bg-background"
  }
>
```

Keep the pause button and animated container between the root tags unchanged. Replace only the current `LINE_GROUPS` mapping with the following block so the duplicate is hidden and the first non-empty line is the visible h1:

```tsx
{
  (shouldRenderStatic ? ["static"] : LINE_GROUPS).map(group => (
    <div
      key={group}
      data-line-group={group}
      aria-hidden={group === "second" ? "true" : undefined}
      className={shouldRenderStatic ? "py-4" : "py-40"}
    >
      {TEXT_LINES.map((line, index) => (
        <div
          key={`${group}-${index}`}
          className="text-line mb-4 flex justify-center px-8"
          style={{
            transformStyle: shouldRenderStatic ? undefined : "preserve-3d",
            minHeight: line ? "2.8rem" : "1.25rem",
          }}
        >
          {index === 0 && group !== "second" ? (
            <h1 className="max-w-3xl text-center font-classic text-[1.35rem] italic leading-relaxed text-zen md:text-[1.55rem] lg:text-[1.75rem]">
              {line}
            </h1>
          ) : (
            <p className="max-w-3xl text-center font-classic text-[1.35rem] italic leading-relaxed text-zen md:text-[1.55rem] lg:text-[1.75rem]">
              {line || "\u00A0"}
            </p>
          )}
        </div>
      ))}
    </div>
  ));
}
```

Close the root with `</main>`.

- [ ] **Step 6: Replace brittle ritual-scroll source assertions with behavior**

Delete assertions for literal implementation strings such as `nearViewport.forEach`, the exact effect dependency string, and component function names. Keep behavior checks for pause/resume, reduced-motion static rendering, one accessible heading, one hidden duplicate, and cleanup of observer/listener mocks.

- [ ] **Step 7: Run focused verification**

Run:

```bash
npm test -- tests/ui/home-page.search.test.tsx tests/ui/home-main-path.regression.test.tsx tests/ui/ritual-scroll-page.test.tsx --runInBand
npm run type-check:app
npm run lint
```

Expected: all tests pass; the search result status has a unique accessible name; ritual-scroll has one accessible copy.

- [ ] **Step 8: Commit semantic fixes**

```bash
git add src/components/search/SearchResults.tsx src/components/home/HomeEntryExperience.tsx src/app/ritual-scroll/page.tsx tests/ui/home-page.search.test.tsx tests/ui/home-main-path.regression.test.tsx tests/ui/ritual-scroll-page.test.tsx
git commit -m "fix: expose stable reader semantics"
```

---

### Task 6: Make wiki-back state restoration pure

**Files:**

- Modify: `src/components/home/HomeEntryExperience.tsx:1150-1220`
- Modify: `tests/ui/home-main-path.regression.test.tsx`

**Interfaces:**

- Consumes: `wikiStack`, `searchResults`, `selectedResultPassage`, `popWikiStack()`, `currentWikiNode()`, `buildWikiNodeReadingTarget()`.
- Produces: a synchronous `WikiBackTransition` value applied through independent setters; no setter is called from another setter's updater.

- [ ] **Step 1: Add a StrictMode regression test**

Wrap the main-path render in `StrictMode`, navigate to a second wiki level, click `返回上一层`, and assert the root annotation, target label, active tab, and result selection are restored exactly once:

```tsx
import { StrictMode } from "react";

render(
  <StrictMode>
    <SimonRogersPreviewPage />
  </StrictMode>,
);
```

Retain the existing visible-state assertions and add `expect(screen.getAllByText("根层注释")).toHaveLength(1)`.

- [ ] **Step 2: Run the test before refactoring**

Run:

```bash
npm test -- tests/ui/home-main-path.regression.test.tsx --runInBand
```

Expected: the current test may pass; this test is a regression guard for the purity refactor rather than proof of the internal anti-pattern.

- [ ] **Step 3: Compute the transition before calling setters**

Replace the nested updater with a plain transition:

```ts
const handleWikiBack = () => {
  cancelAnnotationRequest();
  const nextStack = popWikiStack(wikiStack);
  const nextNode = currentWikiNode(nextStack);
  const nextReadingTarget = nextNode ? buildWikiNodeReadingTarget(nextNode, searchResults) : null;

  setWikiStack(nextStack);
  setAnnotation(nextNode?.annotation ?? null);
  setAnnotationError(null);
  setSelectedPassage(nextNode?.annotation.passageId ?? null);
  setSelectedResultPassage(nextNode ? selectedResultPassage : null);
  setActiveReadingTarget(nextReadingTarget);
  setAnnotationTargetLabel(nextReadingTarget?.label ?? null);
  setActiveAnnotationTab("sixToMe");
};
```

Do not introduce a second wiki store or reducer solely for this transition.

- [ ] **Step 4: Run main-path and static verification**

Run:

```bash
npm test -- tests/ui/home-main-path.regression.test.tsx tests/ui/home-page.search.test.tsx --runInBand
npm run type-check:app
npm run lint
```

Expected: all state-restoration assertions pass under StrictMode.

- [ ] **Step 5: Commit the pure transition**

```bash
git add src/components/home/HomeEntryExperience.tsx tests/ui/home-main-path.regression.test.tsx
git commit -m "refactor: make wiki back transition pure"
```

---

### Task 7: Delete disconnected pre-reboot API state layers and restore static coverage

**Files:**

- Delete: `src/hooks/api/useSearch.ts`
- Delete: `src/hooks/api/useAnnotation.ts`
- Delete: `src/hooks/api/useHealthCheck.ts`
- Delete: `src/lib/stores/searchStore.ts`
- Delete: `src/lib/stores/annotationStore.ts`
- Modify: `.eslintrc.json:3-29`
- Modify: `tsconfig.json:56-85`
- Create: `tests/unit/tooling/active-frontend-boundary.test.ts`

**Interfaces:**

- Consumes: active direct request orchestration in `HomeEntryExperience`; `src/lib/stores/uiStore.ts` remains because `WikiExplorer.tsx` imports its `WikiNode` type.
- Produces: no disconnected search/annotation state layer and restored ESLint/TypeScript coverage for `src/hooks/api` and `src/lib/stores`.

- [ ] **Step 1: Add a failing active-boundary contract test**

Create `tests/unit/tooling/active-frontend-boundary.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("active frontend state boundary", () => {
  it("does not retain excluded pre-reboot API state layers", () => {
    const root = process.cwd();
    for (const relativePath of [
      "src/hooks/api/useSearch.ts",
      "src/hooks/api/useAnnotation.ts",
      "src/hooks/api/useHealthCheck.ts",
      "src/lib/stores/searchStore.ts",
      "src/lib/stores/annotationStore.ts",
    ]) {
      expect(existsSync(path.join(root, relativePath))).toBe(false);
    }

    const eslint = readFileSync(path.join(root, ".eslintrc.json"), "utf8");
    const tsconfig = readFileSync(path.join(root, "tsconfig.json"), "utf8");
    expect(eslint).not.toContain("src/hooks/api/**");
    expect(eslint).not.toContain("src/lib/stores/**");
    expect(tsconfig).not.toContain("src/hooks/api/**");
    expect(tsconfig).not.toContain("src/lib/stores/**");
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
npm test -- tests/unit/tooling/active-frontend-boundary.test.ts --runInBand
```

Expected: FAIL because all five files and both exclusions exist.

- [ ] **Step 3: Reconfirm there are no consumers before deletion**

Run:

```bash
rg -n "useSearchStore|useAnnotationStore|useSearch\(|useAnnotation\(|useHealthCheck\(" src tests
```

Expected: matches exist only in the five files being deleted. `uiStore.ts` and `WikiExplorer.tsx` are intentionally retained.

- [ ] **Step 4: Delete only the disconnected files**

Use `apply_patch` file deletions for the five named files. Do not delete `src/lib/stores/uiStore.ts` and do not remove `zustand`, because `WikiExplorer` still consumes the UI store type.

- [ ] **Step 5: Restore static coverage**

Remove only these patterns from both `.eslintrc.json` and `tsconfig.json`:

```text
src/hooks/api/**
src/lib/stores/**
```

Leave unrelated legacy exclusions unchanged in this task.

- [ ] **Step 6: Fix any newly exposed `uiStore.ts` errors without changing its API**

Run `npm run type-check:app` and `npm run lint`. If exact optional properties reject explicit `undefined`, construct objects with conditional spreads; if lint rejects `substr`, replace it with:

```ts
Math.random().toString(36).slice(2, 11);
```

Do not add `uiStore.ts` back to an ignore list.

- [ ] **Step 7: Run focused and full static verification**

Run:

```bash
npm test -- tests/unit/tooling/active-frontend-boundary.test.ts --runInBand
npm run type-check
npm run lint
```

Expected: the boundary test passes and static checks cover the retained `uiStore.ts`.

- [ ] **Step 8: Commit the boundary cleanup**

```bash
git add .eslintrc.json tsconfig.json src/hooks/api src/lib/stores tests/unit/tooling/active-frontend-boundary.test.ts
git commit -m "refactor: remove disconnected frontend state layers"
```

---

### Task 8: Use the platform Response implementation in route tests

**Files:**

- Modify: `tests/setup/jest.setup.ts`
- Modify: `tests/integration/api/search.route.test.ts`
- Modify: `tests/integration/api/annotate.route.test.ts`
- Modify: `tests/integration/api/embed.route.test.ts`
- Modify: `tests/integration/api/health.route.test.ts`
- Modify: `tests/integration/api/annotation-telemetry.route.test.ts`
- Modify: `tests/unit/utils/errors.test.ts`

**Interfaces:**

- Consumes: Node.js 20 global `Request`, `Response`, and `Headers` in Jest's node environment.
- Produces: standards-compatible route responses with `ok`, `status`, `statusText`, `headers`, `json()`, and `text()`.

- [ ] **Step 1: Add a failing standards assertion to `errors.test.ts`**

Add:

```ts
it("returns a standards-compatible Response", async () => {
  const response = buildErrorResponse(new RouteError(400, "INVALID", "Invalid request"));
  expect(response).toBeInstanceOf(Response);
  expect(response.ok).toBe(false);
  expect(response.headers.get("content-type")).toContain("application/json");
  await expect(response.clone().text()).resolves.toContain("INVALID");
});
```

- [ ] **Step 2: Run the test and verify the global mock is incomplete**

Run:

```bash
npm test -- tests/unit/utils/errors.test.ts --runInBand
```

Expected: FAIL because `MockResponse` has no `ok`, `headers`, `clone`, or `text`.

- [ ] **Step 3: Move server-oriented tests to the Node environment**

Add this as the first line of all six route/error test files listed above:

```ts
/** @jest-environment node */
```

Node 20 is already enforced by `package.json`; no Fetch polyfill dependency is added.

- [ ] **Step 4: Remove the global `MockResponse`**

Reduce `tests/setup/jest.setup.ts` to:

```ts
import "@testing-library/jest-dom";
```

UI tests continue to use their explicit fetch response fixtures and do not require a global Response constructor.

- [ ] **Step 5: Run all response-producing suites**

Run:

```bash
npm test -- tests/unit/utils/errors.test.ts tests/integration/api/search.route.test.ts tests/integration/api/annotate.route.test.ts tests/integration/api/embed.route.test.ts tests/integration/api/health.route.test.ts tests/integration/api/annotation-telemetry.route.test.ts --runInBand
npm run type-check:app
npm run lint
```

Expected: all suites pass using Node's real Fetch API classes.

- [ ] **Step 6: Commit the test-environment correction**

```bash
git add tests/setup/jest.setup.ts tests/integration/api tests/unit/utils/errors.test.ts
git commit -m "test: use native responses for route contracts"
```

---

### Task 9: Ship the declared classic and seal fonts locally

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/app/layout.tsx`
- Modify: `tailwind.config.ts:88-92`
- Modify: `tests/ui/layout-polish.test.tsx`

**Interfaces:**

- Consumes: `font-classic`, `font-seal`, Node.js 20/npm, Fontsource packages.
- Produces: local WOFF2-backed `Noto Serif SC Variable` and `Ma Shan Zheng` families with `font-display: swap`; no runtime Google Fonts request.

- [ ] **Step 1: Add failing font contract assertions**

In `tests/ui/layout-polish.test.tsx`, add:

```ts
const appLayoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
expect(packageSource).toContain('"@fontsource-variable/noto-serif-sc"');
expect(packageSource).toContain('"@fontsource/ma-shan-zheng"');
expect(appLayoutSource).toContain("@fontsource-variable/noto-serif-sc/wght.css");
expect(appLayoutSource).toContain("@fontsource/ma-shan-zheng/chinese-simplified-400.css");
expect(tailwindSource).toContain('"Noto Serif SC Variable"');
```

- [ ] **Step 2: Run the test and verify no font assets are wired**

Run:

```bash
npm test -- tests/ui/layout-polish.test.tsx --runInBand
```

Expected: FAIL because the packages and imports are absent.

- [ ] **Step 3: Install pinned self-hosted font packages**

Run:

```bash
npm install @fontsource-variable/noto-serif-sc@5.3.0 @fontsource/ma-shan-zheng@5.3.1
```

These packages ship local WOFF2 files; they do not contact Google at runtime.

- [ ] **Step 4: Import only the required font CSS at the app root**

Add to `src/app/layout.tsx` immediately after `./globals.css`:

```ts
import "@fontsource-variable/noto-serif-sc/wght.css";
import "@fontsource/ma-shan-zheng/chinese-simplified-400.css";
```

- [ ] **Step 5: Point Tailwind at the shipped family name**

Change the classic stack to:

```ts
classic: ['"Noto Serif SC Variable"', '"Source Han Serif SC"', '"Songti SC"', "serif"],
seal: ['"Ma Shan Zheng"', '"STKaiti"', "cursive"],
```

- [ ] **Step 6: Verify tests, production build, and emitted font assets**

Run:

```bash
npm test -- tests/ui/layout-polish.test.tsx --runInBand
npm run build
find .next/static -type f -name '*.woff2' -print
```

Expected: test and build pass; `.next/static` contains Noto Serif SC and Ma Shan Zheng WOFF2 assets. Build output must not report a remote font download.

- [ ] **Step 7: Commit font delivery**

```bash
git add package.json package-lock.json src/app/layout.tsx tailwind.config.ts tests/ui/layout-polish.test.tsx
git commit -m "fix: self-host the reader brand fonts"
```

---

### Task 10: Run the complete release-quality verification matrix

**Files:**

- Modify only if a test exposes a defect in a file already owned by Tasks 1-9.
- Do not modify: `.github/workflows/reboot-mvp-ci.yml`.

**Interfaces:**

- Consumes: all deliverables from Tasks 1-9.
- Produces: release evidence for static checks, Jest, local browser E2E, production build, contrast, focus, sticky behavior, and clean test artifacts.

- [ ] **Step 1: Run static gates**

```bash
npm run type-check
npm run lint
```

Expected: both pass with zero warnings, including retained `src/lib/stores/uiStore.ts`.

- [ ] **Step 2: Run the complete Jest suite**

```bash
npm test -- --runInBand --no-cache
```

Expected: all suites pass and no test depends on the removed global `MockResponse`.

- [ ] **Step 3: Run stability and search-quality gates**

```bash
npm run test:stability
npm run test:search-quality
```

Expected: both pass without changing committed search artifacts.

- [ ] **Step 4: Run local desktop and mobile browser E2E**

```bash
npm run test:e2e
```

Expected: desktop and mobile Chromium projects pass, including focus and sticky checks, with no pageerror or console error.

- [ ] **Step 5: Build and verify the standalone production path manually**

```bash
npm run build
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then cp -R public .next/standalone/public; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
```

In a second terminal:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
E2E_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

Expected: release smoke and both E2E projects pass against the standalone server.

- [ ] **Step 6: Confirm no test artifacts or unrelated files are staged**

```bash
git status --short
git diff --check
```

Expected: no `test-results/`, `playwright-report/`, `.next/`, or unrelated user files are staged. Existing user changes that predate this plan remain untouched.

- [ ] **Step 7: Record the final verification commit only when fixes were required**

If Step 1-6 required code corrections, stage only those correction files and commit:

```bash
git commit -m "test: close ui quality verification gaps"
```

If no corrections were required, do not create an empty commit.

## Self-Review Record

- **Spec coverage:** Findings #1-#7 and #10-#11 each map to an implementation task. Finding #8 remains excluded by the confirmed Playwright design. Finding #9 is split between Task 5 behavior tests and Task 8 native Response tests.
- **Architecture consistency:** There is one active search/annotation orchestration path. Radix Dialog supplies modal semantics without adding a dependency. Sticky elements have no `overflow-hidden` ancestor in the active page path. Semantic colors and fonts remain design-system responsibilities.
- **Type consistency:** `onCancel`, `returnFocusId`, `desktopAnnotationReaderRef`, `text-subdued`, and `seal-foreground` are introduced before their downstream test or UI use.
- **Placeholder scan:** The plan contains no deferred implementation markers. Every task specifies its files, concrete behavior, commands, expected results, and commit boundary.
