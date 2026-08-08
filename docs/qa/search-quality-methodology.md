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

| Field                              | Value                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen search commit               | `81c6365766a7cf8c578cef6b060c5e43345f0d35`                                                                                                                                                         |
| Freeze check                       | `git diff --exit-code -- src/lib/search data/embeddings.json data/search-graph.json data/corpus-manifest.json data/sixclassics-sample.jsonl data/rysxguji/guji-core-v1.jsonl` passed on 2026-07-27 |
| Graph artifact signature           | `sha256:475107bebaad8544cde442d6908ec6ea847e63f22571dab2f844ba703d8452b3`                                                                                                                          |
| Graph file SHA-256                 | `f9f213d19019b75e36fcc653176ab297ebedbb3336eb198a2aab7f5ed22531b3`                                                                                                                                 |
| Embeddings file SHA-256            | `e6518fa9a221473a72ba4fda17dc838ed98443190788778ef396c0b4199ad3ee`                                                                                                                                 |
| Corpus manifest SHA-256            | `e0fb16868d57f3d338375676b54829140daff06388fca77c9b5d91ce665ce56a`                                                                                                                                 |
| Six Classics corpus SHA-256        | `46eba6e46169a1ad701ad8c9ed3b4108b0fa184b77d1893e77bcac4572d9ab37`                                                                                                                                 |
| Guji core corpus SHA-256           | `596df3e835e2ba53971ffa303bfe480ebe808f6692533073be8d460ebd2ed431`                                                                                                                                 |
| Protocol content commit            | `71fa97e7da563abc1d3365292132d36a75e6682b`                                                                                                                                                         |
| Frozen protocol rules SHA-256      | `bf0ec2ae2353cadba91488eb6359a77c78acf3d0ca1122154871c930ee2098d0`                                                                                                                                 |
| Reviewed Unit 1–4 integration base | `0e7a81768cbdfcf0b6cc8633edceee6e1e7c7990`                                                                                                                                                         |
| Fixture validator commit           | `e2e7121a1b4084d60e8c22f6dd48bd21ddf8f203`                                                                                                                                                         |
| Previous evaluation harness seal   | `ba3353e267a4990fc74978bdd8ead1b67475b4e5` and `609a792179b7118c7c111744b9bc6a1702092326` — superseded before any fixture                                                                          |
| Evaluation harness seal            | `3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b`                                                                                                                                                         |
| Final holdout authoring base        | `057e05b88c3fa60461e74279eec6311fc840fc4e`                                                                                                                                                         |
| Fixture commit                      | `dc2944974ccf4a837a7894e12b073427d1d58cf0`                                                                                                                                                         |
| Fixture blob                        | `5fd8875da5842770710ceabd40b372440a65669b`                                                                                                                                                         |
| Fixture SHA-256                     | `da6827eb453bd65fb07bba04cfff5fd34d64a8184cdac7dbcf5cd2507c4b37df`                                                                                                                                |
| Evaluated commit                    | `dc2944974ccf4a837a7894e12b073427d1d58cf0`                                                                                                                                                         |
| Evidence generated at               | `2026-08-08T09:20:49.944Z`                                                                                                                                                                         |
| Holdout v1 status                   | **Blocked** — in-domain `0/24` (required `19`), OOD `6/6` (required `6`); evidence is immutable and v1 must not be rerun                                                                         |

## Frozen holdout v1 evidence

The one-shot v1 evaluation is recorded in
`docs/qa/search-holdout-v1-results.json` and
`docs/qa/search-holdout-v1-report.md`.

- Decision: **blocked**.
- In-domain: `0/24` (required `19`).
- OOD: `6/6` (required `6`).
- All 24 in-domain expectations used the permitted `sourceTop3` contract, so
  this result is source-level evidence rather than a claim about a specific
  passage-level semantic label.
- The fixture, evaluator identities, artifact hashes, and independence
  attestation are recorded in both evidence files. The v1 fixture and evidence
  are immutable; any later search-tuning cycle requires a new v2 fixture.

## Sealed evaluation harness

Before the evaluator loads the search index, it rejects alternate embedding or
graph environment paths, validates the canonical fixture, verifies the frozen
search and corpus inputs, binds the harness to the fixture commit, and reserves
the canonical JSON and Markdown evidence paths with exclusive creation. It
accepts the fixture only as a 40-character lowercase commit SHA, resolves and
records that exact SHA, and proves the ordered harness → fixture → evaluated-HEAD
ancestry chain. The sealed harness surface includes `package.json`, so a changed
`evaluate:search-holdout` npm entrypoint also rejects evaluation. The validator
checks only the fixture, corpus identities, and visible-query inventory; it does
not load or query the frozen search system.

## Independent reviewer handoff

The reviewer receives the exact resealed handoff commit supplied by the release
owner, the reviewed Unit 1–4 integration base
`0e7a81768cbdfcf0b6cc8633edceee6e1e7c7990`, the frozen identities above, and
only corpus/source materials needed for semantic labels. The earlier
`ba3353e267a4990fc74978bdd8ead1b67475b4e5` and
`609a792179b7118c7c111744b9bc6a1702092326` harnesses were superseded before any
fixture existed.

The reviewer must create a fixture-only commit that changes
`tests/fixtures/search-holdout-v1.json`, must not inspect system search output
while authoring queries or labels, and must use this exact commit trailer:

```text
Holdout-Independence: no-alias-tuning;no-current-review;no-evaluator-implementation;no-system-top3-inspection
```

They may run only the validation command while authoring:

```bash
npm run validate:search-holdout -- --cases tests/fixtures/search-holdout-v1.json
```

After the fixture-only commit passes non-consuming intake, one designated
release evaluator runs this command exactly once with both
`SEARCH_EMBEDDING_ARTIFACT_PATH` and `SEARCH_GRAPH_PATH` unset:

```bash
npm run evaluate:search-holdout -- \
  --fixture-commit <exact fixture commit SHA supplied by the independent reviewer>
```

The evaluator writes a complete pass or blocked record before it exits. Any
existing result or report path permanently rejects a second v1 invocation. A
blocked v1 remains immutable and begins a future v2 cycle.
