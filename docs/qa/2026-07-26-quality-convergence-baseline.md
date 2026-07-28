# 2026-07-26 Quality Convergence Baseline

## Scope and Git boundary

Recorded on 2026-07-26 before release-convergence implementation begins.

- Branch: `codex/p5-search-diagnostics-plan`
- Remote relation: ahead of `origin/codex/p5-search-diagnostics-plan` by one commit
- HEAD: `324624b feat: add agentic growth trace`
- Tracked modified paths: 32
- Untracked paths: 29
- `git diff --check`: passed (no whitespace errors)
- No `stash`, `reset`, `clean`, or bulk staging was used while recording this baseline.

The preceding five commits were:

1. `324624b feat: add agentic growth trace`
2. `860e21c Ignore local agent artifacts`
3. `519df97 Add search graph diagnostics spike`
4. `5a06fe7 Add search bridge UX polish`
5. `7fcdc11 Land search graph sidecar MVP`

## Artifact head

Read-only inspection of the committed-and-working artifact set reported:

| Field               | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| Corpus version      | `guji-core-v1`                                                            |
| Corpus files        | 2                                                                         |
| Works               | 14                                                                        |
| Embedding model     | `infidao-local-concept-v2`                                                |
| Embedding dimension | 151                                                                       |
| Embeddings          | 11,829                                                                    |
| Graph nodes         | 12,825                                                                    |
| Graph edges         | 24,084                                                                    |
| Graph signature     | `sha256:475107bebaad8544cde442d6908ec6ea847e63f22571dab2f844ba703d8452b3` |

## Quality evidence

### Stable pass

The following commands were run against the pre-convergence working tree on 2026-07-26 and exited successfully:

| Command                              | Result                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run type-check`                 | passed                                                                                                                                                                          |
| `npm run lint`                       | passed with zero lint warnings/errors; the current `next lint --dir src` command emitted the expected Next.js deprecation notice and does not yet cover tests or active scripts |
| `npm test -- --runInBand --no-cache` | passed: 44 suites, 204 tests, 23.3s                                                                                                                                             |
| `npm run test:search-quality`        | passed: 11/11 golden cases, OOD full/fusion both 0, embedding reproducibility passed                                                                                            |
| `npm run build`                      | passed using Next.js 15.5.18                                                                                                                                                    |

### Pass after rerun / historical evidence

The implementation plan's 2026-07-26 pre-execution evidence records that the first full Jest run had 14 five-second timeouts, while a subsequent full run passed 44/44 suites and 204/204 tests. That history is retained as evidence of environment sensitivity; it is not treated as the required two clean no-cache stability runs.

### Incomplete gates

- Type checking currently excludes active TypeScript release scripts.
- Lint currently covers only `src` and still uses the deprecated `next lint` entry point.
- No `test:stability` command exists yet.
- CI does not yet require release-artifact regeneration, artifact diffs, search-quality, stability, build, and production smoke in the required order.
- The current 30/30 report labeled “blind generalization” has not yet been reclassified as tuned regression, and a frozen holdout does not yet exist.

### Current blockers

- The current production smoke reached `/api/health` but failed while checking a stale standalone JavaScript asset: `/_next/static/chunks/webpack-4e6bf084ac60582b.js` returned 404. The baseline run did not reach the existing fixed `lunyu-1-8` ranking assertion in `scripts/release-smoke.mjs`.
- The fixed ranking assertion remains a known release-contract defect after corpus expansion; Task 1 must move ranking semantics to the golden quality gate and make smoke validate the end-to-end response contract.
- Release sign-off remains blocked until clean-worktree reproducibility, two no-cache Jest runs, two stability runs, frozen holdout evidence, and manual desktop/mobile acceptance are complete.

## Interim convergence update

The baseline above remains a pre-execution record. The following later work is
now committed without changing its historical measurements:

- Task 1 through Task 4 corrected the smoke/ranking split, stabilized the
  designated suites, expanded static checks, and added CI artifact/order gates.
- `71fa97e7da563abc1d3365292132d36a75e6682b` reclassified the old visible
  30/30 evidence as tuned paraphrase regression and froze the independent
  holdout protocol.
- No holdout v1 cases or results exist yet. Final signoff remains blocked until
  an untainted reviewer authors and evaluates that holdout, and Task 7 is run
  from a clean worktree on the integrated release commit.

## Integration preflight

`f261607bf83560e746507e38d7dd93dffc5b8edb` is the dedicated integration
checkpoint with parents `906cde4` and `de369e3`. The search freeze comparison
against `81c6365` is empty. Type-check, lint, 12 UI suites / 48 tests,
documentation contracts, and the Next.js 15.5.18 production build passed.

This is not Task 7 and does not sign a Release Candidate. The independent
fixture and its one-shot evidence remain absent. The two files under
`docs/simon-rogers-main-screen-plan/` are tracked upstream content inherited
through `906cde4`; the ignore rule applies only to additional untracked local
material in that path.

## Resealed holdout handoff

`0e7a81768cbdfcf0b6cc8633edceee6e1e7c7990` is the reviewed Unit 1–4
integration base. Before any fixture existed, the earlier evaluator seal
`ba3353e267a4990fc74978bdd8ead1b67475b4e5` and
`609a792179b7118c7c111744b9bc6a1702092326` were superseded before any fixture
by the hermetic one-shot harness seal
`3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b`. It rejects alternate artifact
paths, accepts only a 40-character lowercase fixture SHA, seals the
`package.json` evaluation entrypoint, freezes corpus inputs, binds the ledger
seal to the independent fixture commit and evaluated HEAD, and exclusively
reserves both evidence files before loading search.

This resealing remains pre-release work: no v1 fixture or evidence exists, and
Task 7 and Release Candidate signoff remain blocked.

## Protected files outside the release commit

The following current paths must remain untracked or otherwise excluded from release commits unless separately approved:

- `.codex-screens/`
- additional untracked material under `docs/simon-rogers-main-screen-plan/`
  (the two tracked upstream content files remain in the integrated candidate)
- `ref/rysxguji/`
- `docs/qa/a2a-agentic-framework-100-review-package.zip`
- `docs/qa/a2a-agentic-framework-100-review-package/`
