# A2A Agentic Framework 100 Examples QA Run

Date: 2026-06-16T15:38:12.924Z
Source: `docs/qa/a2a-agentic-framework-100-examples.md`
Numbered QA JSON: `docs/qa/a2a-agentic-framework-100-examples-results.json`
Focused Jest JSON: `docs/qa/a2a-agentic-framework-100-examples-jest-results.json`

## Summary

- Total: 100
- Passed: 100
- Failed: 0
- Partial: 0
- Skipped: 0

## Notes

- Browser-level E2E was not run because project instructions say not to use Playwright unless specified.
- `partial` means a narrower automated assertion ran, but the full scenario needs Jest module mocking, browser state, or future adapter code.
- The graphify code graph was regenerated before this run because `graphify-out/graph.json` was missing.

## Failed Or Partial


## Full Matrix

| ID | Status | Evidence |
| --- | --- | --- |
| A01 | passed | Minimal envelope accepted by isAgentMessage. |
| A02 | passed | Blank string envelope fields rejected. |
| A03 | passed | Invalid acts rejected. |
| A04 | passed | All legal acts covered: encounter, interpret, grow, reflect, link, memory_delta. |
| A05 | passed | Stable traceId trace:bde064a0d0baec93ce. |
| A06 | passed | Explicit traceId preserved and participates in message id. |
| A07 | passed | Message id changes when payload changes. |
| A08 | passed | Payload presence boundary matches envelope guard behavior. |
| A09 | passed | createdAt is generated or passed through and affects ids. |
| A10 | passed | Legacy client projection ignores optional agentTrace. |
| B01 | passed | Intent label wins over emotion. |
| B02 | passed | Emotion fallback selected. |
| B03 | passed | Persona fallback selected. |
| B04 | passed | Default interpret selected; memory anchors do not choose primary label. |
| B05 | passed | Unknown primary label fail-soft mapping verified. |
| B06 | passed | Signal label order is stable. |
| B07 | passed | Signal labels truncate to first 8. |
| B08 | passed | Confidence average and rounding verified. |
| B09 | passed | Summary length 40. |
| B10 | passed | Invalid work-agent variants fail open. |
| C01 | passed | Chinese pressure/guidance extraction matched. |
| C02 | passed | English pressure/guidance extraction matched. |
| C03 | passed | Mixed Chinese/English exploration extraction matched. |
| C04 | passed | Guidance confidence ranks above interpret. |
| C05 | passed | Family memory anchor is label-only. |
| C06 | passed | Friendship and school anchors extracted. |
| C07 | passed | Hometown nostalgia extracted. |
| C08 | passed | Generic past_experience anchor extracted. |
| C09 | passed | Persona hint combination extracted. |
| C10 | passed | Saved privacy mode keeps stable id and label-only anchors. |
| D01 | passed | Classic passage manifest maps fields and stable id. |
| D02 | passed | Expected hash mismatch rejected. |
| D03 | passed | Internal passage hash mismatch rejected. |
| D04 | passed | Trimmed passageText resolves. |
| D05 | passed | One-character passageText drift rejected. |
| D06 | passed | Multiple affect signals extracted from passage text. |
| D07 | passed | Default classic_resonance fallback emitted. |
| D08 | passed | Interpretive frames are complete and defensively cloned. |
| D09 | passed | Growth policy exact constraints verified. |
| D10 | passed | Missing passage and index-load failure both resolve to null. |
| E01 | passed | Append then read succeeds. |
| E02 | passed | List sorted by insertedAt. |
| E03 | passed | Session list isolation verified. |
| E04 | passed | Global event id read works. |
| E05 | passed | TTL not expired before boundary. |
| E06 | passed | TTL boundary prunes at expiresAt. |
| E07 | passed | Per-session max evicts oldest event. |
| E08 | passed | Max sessions evicts oldest session. |
| E09 | passed | GrowthService swallows store exceptions. |
| E10 | passed | Store and service return defensive copies. |
| F01 | passed | Known selected passage returns public-safe agentTrace. |
| F02 | passed | Unknown external passage annotates without agentTrace. |
| F03 | passed | Known id with stale text fail-opens without binding trace. |
| F04 | passed | Route response keeps legacy annotation fields plus optional trace. |
| F05 | passed | Selected passage wins over query relevance for agentTrace binding. |
| F06 | passed | Cache hit reuses copy, rebuilds links, and returns fresh agentTrace. |
| F07 | passed | Provider-error fallback is not cached. |
| F08 | passed | LLM prompt receives growth context without raw user-state JSON. |
| F09 | passed | Deterministic fallback carries relation-branch hint. |
| F10 | passed | Visited ids normalized; links exclude visited/current and trace still builds. |
| G01 | passed | GrowthTrace SSR exposes readable copy only. |
| G02 | passed | No-trace empty state rendered. |
| G03 | passed | AnnotationPanel handles missing agentTrace. |
| G04 | passed | Long relationTheme uses truncating class. |
| G05 | passed | Branch and summary remain fully rendered. |
| G06 | passed | GrowthTrace has stable non-interactive a11y entry. |
| G07 | passed | Mobile panel renders compact trace and no desktop tablist. |
| G08 | passed | SSR output has exactly one trace region; focused RTL Jest covers desktop tab switching. |
| G09 | passed | Trace is rendered after copy and before next links. |
| G10 | passed | Legacy/extra fields do not enter UI. |
| H01 | passed | A2A route serialization excludes raw utterance. |
| H02 | passed | Public agentTrace exposes only four safe fields. |
| H03 | passed | Memory anchors remain short labels. |
| H04 | passed | Cache key excludes raw query/passageText. |
| H05 | passed | Telemetry stores/logs queryHash only. |
| H06 | passed | LLM runtime status reports key presence without secret values. |
| H07 | passed | User-state session-store failure does not block annotation. |
| H08 | passed | Missing work-agent fail-opens annotation. |
| H09 | passed | Growth storage failure is swallowed by annotation agent context. |
| H10 | passed | Provider error fail-opens without leaking key in response/telemetry/logs. |
| I01 | passed | API-level search -> annotate -> link -> back snapshot flow completed; focused RTL Jest covers browser stack controls. |
| I02 | passed | Search response does not expose A2A fields. |
| I03 | passed | Root annotation trace binds to selected search result. |
| I04 | passed | Link exploration annotation binds to link passage at API level. |
| I05 | passed | Covered by focused RTL Jest: home-page.search.test.tsx verifies returning to previous layer without extra fetch. |
| I06 | passed | Covered by focused RTL Jest: home-page.search.test.tsx verifies selecting a new result clears the exploration stack. |
| I07 | passed | Leaf UI state coexists with trace. |
| I08 | passed | A2A fail-open keeps annotation and empty trace UI usable. |
| I09 | passed | AgentTrace privacy boundary holds at API/UI trace layer. |
| I10 | passed | Covered by focused RTL Jest: home-page.search.test.tsx verifies pending concurrent root annotation clicks are prevented; request-id/abort guards are present in src/app/page.tsx. |
| J01 | passed | Public API route dirs: annotate, embed, health, internal, search. |
| J02 | passed | Search strict schema rejects injected A2A fields. |
| J03 | passed | Painting manifest can route and route output excludes manifest internals. |
| J04 | passed | Artifact manifest boundary simulated at router level; private version/signature/provenance/prompt/path fields do not leak, and unauthorized growth fail-opens. |
| J05 | passed | Missing grow in allowedActs disables route. |
| J06 | passed | memory_delta is recognized as protocol act but router only grows. |
| J07 | passed | Saved privacyMode does not persist raw utterance into growth event. |
| J08 | passed | Router is deterministic and does not call network. |
| J09 | passed | Sample golden search rankings unchanged after annotation/A2A. |
| J10 | passed | Corpus manifest and search graph artifacts unchanged. |
