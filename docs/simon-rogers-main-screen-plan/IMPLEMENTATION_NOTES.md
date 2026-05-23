# Simon Rogers Main Screen Implementation Notes

## Baseline

- Work is happening in a fresh clone at `/Users/aitoshuu/Documents/GitHub/InfiDao-simon-rogers-main-screen`.
- Source branch: `codex/p5-search-diagnostics-plan`.
- Implementation branch: `codex/simon-rogers-main-screen`.
- Preserved pre-switch home branch: `preserve/pre-simon-home-2026-05-21`.
- The original checkout at `/Users/aitoshuu/Documents/GitHub/InfiDao` was not used for product edits because `git fsck --no-dangling` reported missing objects and `git status --short` showed broad deletions.

## Rollback

`/home` is not used as the old-home route because `next.config.js` redirects `/home` to `/`.

Rollback command for the final `/` switch:

```bash
git switch codex/simon-rogers-main-screen
git restore --source preserve/pre-simon-home-2026-05-21 -- src/app/page.tsx
npm run type-check
npm run lint
```

## Preview Review

- Preview route: `/simon-rogers-preview`
- Focused preview tests passed before switching `/`.
- The kinetic layer is decorative, `aria-hidden`, pointer-safe, and recedes during results/annotation/explore states.
- Desirable friction is skippable and session-scoped for both short queries and result entry.

## Browser Review

- Used Playwright with system Chrome as fallback because the Browser plugin did not expose a navigate/screenshot tool in this session.
- Captured temporary screenshots for desktop `1440x900`, desktop `1280x720`, mobile `390x844`, mobile `375x667`, and reduced-motion `390x844`; removed the temporary `.codex-screens/` artifacts after review.
- Reviewed idle, focused input, short-query friction, submitting, results, reading gate, annotation, and reduced-motion states.
- DOM checks confirmed no horizontal overflow, decorative layer `aria-hidden="true"`, `pointer-events: none`, pause target height `44px`, and three kinetic depth bands.
