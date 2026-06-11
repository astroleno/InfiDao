# A2A Agentic Growth

Date: 2026-06-11
Status: internal local orchestration

## Vocabulary

- User-state agent: a session-scoped snapshot derived from the current utterance. It may contain soft emotion, intent, memory-anchor, and persona-hint signals.
- Work agent: a deterministic wrapper around a work, passage, painting, or artifact. The first implementation wraps classic passages from the local corpus.
- A2A message: a typed plain object exchanged inside the server process. It is not a remote call and is not a public API contract.
- Relation branch: the local relationship created when a user-state snapshot encounters a work agent.
- Growth event: the compact result of that encounter. It contains a relation theme, branch label, short summary, confidence, and stable ids.

## Runtime Boundary

The first implementation keeps A2A inside `POST /api/annotate`:

```text
annotate request
  -> deterministic user-state snapshot
  -> classic passage work-agent manifest
  -> local A2A encounter route
  -> optional growth event
  -> annotation result with optional agentTrace
```

`POST /api/search`, `GET /api/health`, search ranking, corpus text, search graph edges, and source attribution are not changed by this layer.

## Privacy Rules

- User-state is ephemeral by default.
- No raw utterance, prompt text, model reasoning, or long private memory text is stored in growth events.
- Memory anchors are short labels such as `family`, `friendship`, or `past_experience`.
- Every inferred signal carries a confidence and source.
- Cache keys may include a stable growth context hash, but not raw user-state JSON.
- Persistent memory, accounts, remote agents, and cross-device personalization remain future product decisions.

## Fail-Open Rule

Annotation must continue when any agentic step fails. User-state extraction, work-agent resolution, A2A routing, and growth storage all return disabled/null results instead of blocking annotation.

## Public Surface

The only public response addition is optional:

```ts
agentTrace?: {
  workAgentId: string;
  relationTheme: string;
  branchLabel: string;
  growthSummary: string;
}
```

Old clients can ignore this field.
