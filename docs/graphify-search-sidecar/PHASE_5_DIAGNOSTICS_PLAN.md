# Phase 5 Diagnostics Plan

Status: planning spike
Date: 2026-05-15
Scope: internal search diagnostics, explanation research, and diversity evidence

## Goal

Phase 5 should prove whether graph signals improve search quality before any public API,
default ranking, or UI explanation changes ship.

This phase answers two questions:

- Why does a search result look relevant?
- Are top results too repetitive, and is there enough graph evidence to justify diversity?

## Non-Goals

- Do not change `/api/search` request or response shape.
- Do not change default ranking, thresholds, or fusion weights.
- Do not expose graph path explanations in the UI.
- Do not enable graph boost or diversity by default.
- Do not treat `INFERRED` edges as user-visible facts without explicit confidence metadata.

## Slice 1: Diagnostics Only

Add an internal diagnostics entry point that reuses the current search pipeline:

```text
query -> vector candidates -> lexical candidates -> fusion -> diagnostic metadata
```

Diagnostics may attach:

- vector score and lexical score components
- graph sidecar enabled/disabled state
- direct graph neighbor counts
- extracted vs inferred edge counts
- direct concept groups from graph neighbors
- adjacent passage ids
- repeated concept groups across the current topK

Diagnostics must not:

- mutate fused scores
- reorder candidates
- add public `SearchResult` fields
- require the graph sidecar to be present

## Slice 2: Path Lookup Spike

After diagnostics show useful signal, add a bounded internal helper such as
`findPassagePaths()`.

Required bounds:

- maximum depth: 2 for the first spike
- maximum returned paths per pair: 3
- maximum neighbors inspected per node: 20
- confidence filters must be explicit
- output must be sanitized before any UI/API use

Path lookup remains internal until a separate API/UI proposal defines confidence,
provenance, and copy constraints.

## Slice 3: Diversity And Boost Experiments

Only after diagnostics and path lookup produce useful evidence:

- add graph diversity behind an internal flag
- add graph boost behind an internal flag
- keep both off by default
- prove golden search queries do not regress
- compare repeated concept groups before/after the experiment

Boost should be the last experiment because it can destabilize the already working
vector/lexical ranking.

## Success Criteria

- `searchPassages()` output remains unchanged.
- `/api/search` tests remain unchanged.
- Diagnostics report graph metadata for fused candidates.
- Diagnostics fail open when `data/search-graph.json` is missing or stale.
- Golden search tests can be extended to inspect graph signal without changing
  ranking expectations.
- Any future diversity/boost flag has an off-by-default test.

## Open Decisions

- Which concept-group repetition threshold should count as "too repetitive"?
- Should adjacent passages count as diversity duplicates or as useful reading sequence?
- Which graph relations are eligible for path explanations: `mentions` only, or also
  `adjacent_to` and `contains`?
- Should graph path rationale prefer corpus/concept provenance over generated edge
  rationale?
