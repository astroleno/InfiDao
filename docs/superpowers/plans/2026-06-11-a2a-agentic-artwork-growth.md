# A2A User-State And Artwork-Agent Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or the local Superpowers/GSD execution workflow before implementing this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-06-11
Status: implemented
Scope: post-reboot expansion for InfiDao `六经注我`

## Goal

把当前 `query -> search -> annotation -> explore` 的 reboot MVP，升级为一套可生长的 A2A 关系系统：

```text
user input -> user-state agent -> A2A router -> artwork/work agents -> growth delta -> response/UI
```

这里的 `artwork agent` 是“作品 Agent”的标准封装，不限于视觉画作。当前第一批作品 Agent 由本地经典段落和未来画作/作品数据适配而来。目标不是把用户输入当成一个裸 prompt，而是把它解释成一个有当下情绪、人格倾向、记忆锚点和意图的 `UserStateAgent` 快照，再让作品 Agent 通过 A2A 消息生成解释、共鸣、反驳、延伸或沉默。

产品语义上，`六经注我` 从静态标签系统升级为生长形式：

```text
标签：作品 A = 禅意 / 水墨 / 孤独 / 东方
生长：作品 A 在用户 X 的当下情绪、记忆锚点和解释框架下，长出一次新的关系枝条
```

## Source Of Truth

This plan extends the current reboot MVP source of truth:

- `docs/SUPERPOWERS_REBOOT_PLAN.md`
- `docs/plans/reboot-mvp-implementation-plan.md`
- `docs/plans/reboot-mvp-continuation-plan.md`

It must not replace the stable MVP path or break these existing public contracts:

- `POST /api/search`
- `POST /api/annotate`
- `GET /api/health`

## Architecture Decision

Add a new agentic layer around the existing search and annotation services. Keep the existing route contracts stable, and introduce A2A as an internal orchestration protocol first.

Primary runtime path after this plan:

```text
POST /api/annotate
  -> validate reboot annotation request
  -> derive UserStateSnapshot from query/context
  -> resolve WorkAgentManifest for selected passage/artwork
  -> route A2A encounter message
  -> produce AnnotationResult plus optional GrowthEvent
  -> persist only allowed growth state
```

The first implementation should be deterministic and testable:

- user-state extraction uses rules and small local classifiers first
- LLM participation remains inside the existing annotation generation boundary
- A2A messages are typed plain objects, not remote agent calls
- growth storage is opt-in and privacy bounded
- UI renders growth traces as relationship state, not as decorative tags

## Plan Review Addendum

Review date: 2026-06-11

Findings before implementation:

- The architecture boundary is sound: A2A stays internal, `/api/search` remains untouched, and `/api/annotate` only gains an optional response field.
- The original plan over-scopes the first landing pass by listing remote-agent-adjacent language and seven full phases without a local execution ledger. This implementation will land the smallest complete local loop first: typed A2A message, deterministic user-state snapshot, classic passage work agent, growth event, annotation integration, compact UI trace, and ephemeral in-memory session growth.
- The privacy boundary needs to be enforced in code, not only in prose. Cache keys and growth stores must use stable summaries/hashes instead of raw user-state JSON or long raw utterances.
- Existing reboot behavior must remain fail-open. If user-state extraction, work-agent resolution, A2A routing, or growth storage fails, annotation copy and exploration links should still return as before.
- `.planning/` exists but has no active GSD `STATE.md`/phase inventory for this standalone docs plan. Superpowers/GSD progress for this run will therefore be tracked in this plan file's checkboxes and verification notes.

Execution decision:

- Implement all local phases in one sequential inline Superpowers/GSD pass.
- Do not introduce remote agents, account memory, disk persistence, database migrations, public A2A endpoints, or changes to search ranking/artifacts.
- Do not wire legacy streaming annotation hooks/stores; they reference older annotation contracts and are outside the reboot path.
- Keep `agentTrace` optional, display-only, and safe for old clients to ignore.

Additional acceptance constraints:

- `agentTrace` must never include raw `utterance`, memory anchor source text, persona internals, prompt text, or model reasoning.
- `buildAnnotationCacheKey` may include a short stable growth context hash, but not the raw snapshot or full growth summary.
- Growth storage must clone returned events and enforce TTL/max-size eviction.
- Work agent manifests must be stable for the same passage id/text hash and must fail open when a passage is unknown or stale.

## Non-Goals

- Do not create a public remote agent network in the first version.
- Do not persist sensitive user memory by default.
- Do not let作品 Agent mutate canonical corpus text, artwork metadata, search graph edges, or source attribution.
- Do not replace `/api/search` with A2A retrieval.
- Do not expose raw emotion/personality inference as authoritative diagnosis.
- Do not add account, login, or cross-device memory in the first implementation.
- Do not build a full multi-agent marketplace or autonomous background worker system.

## Privacy And Safety Boundary

User state is sensitive because it may infer emotion, memory, personality, and intent.

First implementation rules:

- `UserStateSnapshot` is session-scoped by default.
- Persistent memory requires an explicit future product decision and user consent.
- Store `memoryAnchor` labels and relation summaries, not raw private text, unless the user explicitly saves a note.
- Avoid clinical labels. Use soft states such as `nostalgia`, `pressure`, `seeking_guidance`, `uncertainty`.
- Every inferred field must carry `confidence` and `source`.
- UI copy must present inferences as “系统读到的倾向”, not facts about the user.
- API responses must not leak internal prompt text, model reasoning, or private memory state.

## Proposed Data Contracts

Create internal types, then expose only a small optional subset through API/UI.

```ts
export type AgentMessageAct =
  | "encounter"
  | "interpret"
  | "grow"
  | "reflect"
  | "link"
  | "memory_delta";

export interface AgentMessage<TPayload = unknown> {
  id: string;
  traceId: string;
  from: string;
  to: string;
  act: AgentMessageAct;
  createdAt: string;
  payload: TPayload;
}

export interface UserStateSnapshot {
  id: string;
  sessionId: string;
  utterance: string;
  emotion: InferredSignal[];
  intent: InferredSignal[];
  memoryAnchors: MemoryAnchor[];
  personaHints: InferredSignal[];
  privacyMode: "ephemeral" | "saved";
  createdAt: string;
}

export interface WorkAgentManifest {
  id: string;
  kind: "classic_passage" | "painting" | "artifact";
  title: string;
  source: string;
  canonicalRef: string;
  contentRef: {
    passageId?: string;
    artworkId?: string;
  };
  affectField: InferredSignal[];
  interpretiveFrames: InterpretiveFrame[];
  growthPolicy: GrowthPolicy;
}

export interface GrowthEvent {
  id: string;
  traceId: string;
  userStateId: string;
  workAgentId: string;
  act: AgentMessageAct;
  relationTheme: string;
  branchLabel: string;
  summary: string;
  confidence: number;
  createdAt: string;
}
```

`AnnotationResult` may later gain:

```ts
agentTrace?: {
  workAgentId: string;
  relationTheme: string;
  branchLabel: string;
  growthSummary: string;
};
```

This field must be optional so current UI and tests remain compatible.

## File Structure

Files to create:

- `docs/architecture/a2a-agentic-growth.md`
- `src/lib/a2a/types.ts`
- `src/lib/a2a/message.ts`
- `src/lib/a2a/router.ts`
- `src/lib/user-state/types.ts`
- `src/lib/user-state/extractor.ts`
- `src/lib/user-state/session-store.ts`
- `src/lib/work-agents/types.ts`
- `src/lib/work-agents/classic-passage-adapter.ts`
- `src/lib/work-agents/registry.ts`
- `src/lib/growth/types.ts`
- `src/lib/growth/service.ts`
- `src/lib/growth/session-store.ts`
- `src/components/growth/GrowthTrace.tsx`
- `tests/unit/a2a/message.test.ts`
- `tests/unit/a2a/router.test.ts`
- `tests/unit/user-state/extractor.test.ts`
- `tests/unit/user-state/session-store.test.ts`
- `tests/unit/work-agents/classic-passage-adapter.test.ts`
- `tests/unit/work-agents/registry.test.ts`
- `tests/unit/growth/service.test.ts`
- `tests/ui/growth-trace.test.tsx`

Files to modify:

- `src/types/index.ts`
- `src/lib/annotation/service.ts`
- `src/lib/annotation/cache.ts`
- `src/app/api/annotate/route.ts`
- `src/components/annotation/AnnotationPanel.tsx`
- `src/app/page.tsx`

Avoid modifying in first implementation:

- `src/lib/search/service.ts`
- `src/lib/search/index-store.ts`
- `data/corpus-manifest.json`
- `data/embeddings.json`
- `data/search-graph.json`
- existing `/api/search` response shape

## Phase 1: Architecture And Contracts

Goal: make the conceptual shift explicit before code touches annotation behavior.

- [x] Create `docs/architecture/a2a-agentic-growth.md`
- [x] Define vocabulary: user-state agent, work/artwork agent, A2A message, relation branch, growth event
- [x] Record privacy boundary and persistence rules
- [x] Add `src/lib/a2a/types.ts` with typed `AgentMessage`
- [x] Add `src/lib/user-state/types.ts`
- [x] Add `src/lib/work-agents/types.ts`
- [x] Add `src/lib/growth/types.ts`
- [x] Add unit tests that assert type guards reject unknown message acts and malformed payloads

Done criteria:

- Architecture doc states that A2A is internal orchestration, not a public remote-agent network
- Type tests pass
- No public API contract changes

Verification:

```bash
npm test -- tests/unit/a2a/message.test.ts --runInBand
npm run type-check
```

## Phase 2: User-State Agent Snapshot

Goal: derive a bounded, non-diagnostic user-state snapshot from the current utterance and reading context.

- [x] Implement `src/lib/user-state/extractor.ts`
- [x] Detect soft emotion signals from query text with confidence scores
- [x] Detect intent signals such as `interpret`, `seek_guidance`, `remember`, `compare`, `continue_exploration`
- [x] Extract memory anchors as short labels, not raw long text
- [x] Add `privacyMode: "ephemeral"` as the default
- [x] Implement `src/lib/user-state/session-store.ts` as in-memory, per-process, TTL-bounded storage
- [x] Add tests for empty input, emotionally loaded input, memory-like input, and Chinese/English mixed input

Done criteria:

- Extraction is deterministic
- No user-state data is persisted to disk
- Inferences always include `confidence` and `source`
- Route behavior remains unchanged unless the new service is explicitly called by annotation integration

Verification:

```bash
npm test -- tests/unit/user-state/extractor.test.ts tests/unit/user-state/session-store.test.ts --runInBand
npm run type-check
```

## Phase 3: Work/Artwork Agent Registry

Goal: wrap current classics passages as standardized work agents, with a path for future visual artwork agents.

- [x] Implement `src/lib/work-agents/classic-passage-adapter.ts`
- [x] Convert `PassageRecord` into `WorkAgentManifest`
- [x] Map current fields into stable references: `passageId`, `source`, `chapter`, `section`, `textHash`
- [x] Define default interpretive frames for `六经注我`, `我注六经`, `contrast`, `echo`, and `silence`
- [x] Implement `src/lib/work-agents/registry.ts` that resolves a work agent by passage id
- [x] Add tests for registry hit, missing passage, stale text hash, and stable manifest id

Done criteria:

- Every searchable passage can become a `classic_passage` work agent
- The registry depends on `loadSearchIndex()` but does not change search ranking
- Missing or invalid work agents fail open to current annotation behavior

Verification:

```bash
npm test -- tests/unit/work-agents/classic-passage-adapter.test.ts tests/unit/work-agents/registry.test.ts --runInBand
npm run type-check
```

## Phase 4: Internal A2A Router

Goal: route a typed encounter between `UserStateAgent` and `WorkAgentManifest`, then return a growth delta.

- [x] Implement `src/lib/a2a/message.ts` for id generation, trace id creation, and message validation
- [x] Implement `src/lib/a2a/router.ts`
- [x] Add `encounter` route: user-state snapshot meets selected work agent
- [x] Add `grow` result: relation theme, branch label, short growth summary, confidence
- [x] Keep routing synchronous and local
- [x] Add tests for deterministic output, invalid agent id, malformed message, and fail-open behavior

Done criteria:

- Router never calls the network
- Router can produce a `GrowthEvent` without an LLM
- Failures return a disabled/no-growth state rather than breaking annotation

Verification:

```bash
npm test -- tests/unit/a2a/message.test.ts tests/unit/a2a/router.test.ts --runInBand
npm run type-check
```

## Phase 5: Annotation Integration

Goal: let `/api/annotate` use the A2A layer internally while keeping the existing response compatible.

- [x] Modify `src/lib/annotation/service.ts` to derive `UserStateSnapshot`
- [x] Resolve a `WorkAgentManifest` for the selected passage
- [x] Call the A2A router before fallback/LLM copy is assembled
- [x] Feed the growth delta into fallback copy as additional context
- [x] Pass growth context to the LLM prompt only as product context, not as hidden truth
- [x] Extend `AnnotationResult` with optional `agentTrace`
- [x] Update annotation cache key to include stable growth context hash, not raw user-state JSON
- [x] Update route tests to verify old clients still receive valid annotation results

Done criteria:

- Existing `tests/integration/api/annotate.route.test.ts` still pass
- Old UI still works when `agentTrace` is absent
- New `agentTrace` appears only when A2A routing succeeds
- Cache does not store raw memory anchors or full inferred persona state

Verification:

```bash
npm test -- tests/unit/annotation/service.test.ts tests/integration/api/annotate.route.test.ts --runInBand
npm run type-check
npm run lint
```

## Phase 6: Growth Trace UI

Goal: show relation growth as a first-class experience instead of static tags.

- [x] Create `src/components/growth/GrowthTrace.tsx`
- [x] Render relation theme, branch label, and growth summary inside `AnnotationPanel`
- [x] Keep the component quiet and compact; it should feel like reading state, not a badge wall
- [x] Add an empty state for no growth trace
- [x] Add reduced-motion-safe reveal behavior if animation is used
- [x] Update `src/app/page.tsx` only where necessary to pass `agentTrace`
- [x] Add UI tests for trace present, trace absent, mobile rendering, and accessible labels

Done criteria:

- `agentTrace` is visible but does not obscure `六经注我` / `我注六经`
- No visible raw JSON, confidence internals, or personality labels
- Mobile layout remains readable at 390px

Verification:

```bash
npm test -- tests/ui/growth-trace.test.tsx tests/ui/annotation-panel.a11y.test.tsx --runInBand
npm run lint
```

## Phase 7: Session Growth Store

Goal: allow the session to remember short relation branches during one reading session.

- [x] Implement `src/lib/growth/session-store.ts`
- [x] Store only `GrowthEvent` summaries and stable ids
- [x] Add TTL and max event count per session
- [x] Add `src/lib/growth/service.ts` for append/list/read behavior
- [x] Connect store to annotation only after Phase 5 is stable
- [x] Add tests for TTL expiry, max-size eviction, defensive copies, and no raw utterance persistence

Done criteria:

- Growth store is in-memory and ephemeral
- It can reconstruct a session reading path without saving sensitive raw user text
- Store failure does not block annotation

Verification:

```bash
npm test -- tests/unit/growth/service.test.ts tests/unit/growth/session-store.test.ts --runInBand
npm run type-check
```

## Implementation Notes

- `src/app/page.tsx` did not require a direct edit: it already passes the full `AnnotationResult` object into `AnnotationPanel`, so optional `agentTrace` flows through the existing state path.
- `GrowthTrace` uses no custom animation. The reduced-motion acceptance item is satisfied by avoiding reveal animation altogether.
- The annotation cache stores only annotation copy fields. `agentTrace` is regenerated per request from deterministic local A2A routing, and the cache key only receives a short stable `growthContextHash`.
- Unknown, external, or stale selected passages fail open without `agentTrace`, preserving the current annotation path.
- The session growth store is process-local and ephemeral. It stores compact `GrowthEvent` summaries and stable ids, not raw utterances.

## Verification Notes

Completed on 2026-06-11:

```bash
npm run type-check
npm run lint
npm test -- tests/unit/a2a/message.test.ts tests/unit/a2a/router.test.ts tests/unit/user-state/extractor.test.ts tests/unit/user-state/session-store.test.ts tests/unit/work-agents/classic-passage-adapter.test.ts tests/unit/work-agents/registry.test.ts tests/unit/growth/service.test.ts tests/unit/growth/session-store.test.ts tests/unit/annotation/cache.test.ts tests/unit/annotation/llm.test.ts tests/unit/annotation/service.test.ts tests/integration/api/annotate.route.test.ts tests/ui/growth-trace.test.tsx tests/ui/annotation-panel.a11y.test.tsx --runInBand
npm test -- --runInBand
npm run build
```

Result:

- Type-check passed.
- Lint passed with no warnings or errors.
- Full Jest suite passed: 44 suites, 204 tests.
- Production build passed. Build reported only dependency data freshness warnings for `baseline-browser-mapping` and Browserslist/caniuse-lite.
- `git diff --check` could not complete because the local git object database is missing baseline blobs for `data/corpus-manifest.json` and `src/components/annotation/AnnotationPanel.tsx`; working-tree validation above passed.

## Release Gate

Before merging this plan's implementation:

```bash
npm run type-check
npm run lint
npm test -- --runInBand
npm run build
```

Manual browser checks:

- Search and annotate still work without A2A state
- Annotating a passage with a memory-like query shows a compact growth trace
- Refreshing the page clears ephemeral growth state
- Selecting a different result starts a new root branch
- Mobile annotation panel remains usable at 390px width

## Risks

- **Over-personalization:** users may feel the system is diagnosing them. Mitigation: soft labels, confidence, and restrained UI language.
- **Memory creep:** future implementations may be tempted to persist raw input. Mitigation: ephemeral default, explicit consent gate before persistence.
- **Contract drift:** optional `agentTrace` could grow into a second annotation contract. Mitigation: keep old fields mandatory and test old clients.
- **LLM overreach:** model may treat inferred state as fact. Mitigation: prompt frames growth context as tentative interpretation.
- **Concept dilution:** if every passage becomes “agentic” without clear behavior, the system becomes decorative. Mitigation: every work agent must define frames, policy, and growth output.

## Implementation Order Summary

1. Architecture and internal contracts
2. Deterministic user-state snapshot
3. Work/artwork agent registry
4. Local A2A router
5. Annotation integration with optional `agentTrace`
6. Growth trace UI
7. Ephemeral session growth store

The important boundary: do A2A first as an internal typed relation protocol. Only after the local experience is stable should remote agents, persistent memory, or cross-session personalization be considered.
