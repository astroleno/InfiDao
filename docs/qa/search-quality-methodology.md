# Search Quality Methodology

## Evidence hierarchy

1. **Unit behavior** proves local mechanisms such as tokenization, aliases,
   fusion, and the evidence guard.
2. **Golden regression** is visible and may be continuously maintained as the
   product contract changes.
3. **Tuned paraphrase regression** proves that a solved, visible problem does
   not regress. It does not prove generalization because its modern-language
   queries are covered by the alias patterns used for tuning.
4. **Frozen holdout** is created by an independent reviewer after the search
   implementation is frozen. It is evaluated once and may not be used to tune
   that same holdout version.

## Frozen holdout protocol

The independent reviewer creates 30 cases after the ledger below is frozen:

- 24 in-domain modern Chinese intents and 6 OOD queries;
- no complete sentence reused from golden, search-50, or tuned paraphrase
  fixtures;
- each in-domain case specifies only acceptable Top 3 passage IDs or a source
  contract;
- acceptable passage IDs are established by human semantic annotation or an
  independent source mapping, without inspecting the frozen system's Top 3
  results;
- no changes to `src/lib/search/**`, `data/embeddings.json`, or
  `data/search-graph.json` are allowed before the one-shot v1 evaluation.

Acceptance for v1 is at least 19/24 in-domain cases passing and all 6 OOD
queries returning empty results. A failing v1 remains recorded. Any later
search-tuning cycle creates a new v2 holdout instead of changing v1.

## Holdout ledger

| Field | Value |
| --- | --- |
| Frozen search commit | `81c6365766a7cf8c578cef6b060c5e43345f0d35` |
| Freeze check | `git diff --exit-code -- src/lib/search data/embeddings.json data/search-graph.json` passed on 2026-07-26 |
| Graph artifact signature | `sha256:475107bebaad8544cde442d6908ec6ea847e63f22571dab2f844ba703d8452b3` |
| Graph file SHA-256 | `f9f213d19019b75e36fcc653176ab297ebedbb3336eb198a2aab7f5ed22531b3` |
| Embeddings file SHA-256 | `e6518fa9a221473a72ba4fda17dc838ed98443190788778ef396c0b4199ad3ee` |
| Protocol content commit | `71fa97e7da563abc1d3365292132d36a75e6682b` |
| Frozen protocol rules SHA-256 | `bf0ec2ae2353cadba91488eb6359a77c78acf3d0ca1122154871c930ee2098d0` |
| Fixture validator commit | `e2e7121a1b4084d60e8c22f6dd48bd21ddf8f203` |
| Evaluation harness seal | `ba3353e267a4990fc74978bdd8ead1b67475b4e5` |
| Holdout v1 status | Awaiting an independent reviewer; no v1 cases or results have been created |

## Sealed evaluation harness

Before the evaluator loads the search index, the fixture must pass
`npm run validate:search-holdout -- --cases <fixture>`. The validator checks
only the fixture, corpus identities, and visible-query inventory; it does not
load or query the frozen search system.

## Independent reviewer handoff

The reviewer receives only the frozen identities above, the integrated
preflight commit `f261607bf83560e746507e38d7dd93dffc5b8edb`, and corpus/source
materials needed for semantic labels. They must create a fixture-only commit
that changes `tests/fixtures/search-holdout-v1.json` and must not inspect
system search output while authoring queries or labels. After that commit, run:

```bash
npm run validate:search-holdout -- --cases tests/fixtures/search-holdout-v1.json
npm run evaluate:search-holdout -- \
  --cases tests/fixtures/search-holdout-v1.json \
  --json docs/qa/search-holdout-v1-results.json \
  --markdown docs/qa/search-holdout-v1-report.md \
  --fixture-commit <fixture-commit-sha> \
  --harness-commit ba3353e267a4990fc74978bdd8ead1b67475b4e5
```

The evaluator writes a complete pass or blocked record before it exits. A
blocked v1 remains immutable and begins a future v2 cycle.
