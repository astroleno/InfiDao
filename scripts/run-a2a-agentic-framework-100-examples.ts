import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createAgentMessage, createTraceId, isAgentMessage } from "../src/lib/a2a/message";
import { AGENT_MESSAGE_ACTS, isAgentMessageAct, type AgentMessageAct } from "../src/lib/a2a/types";
import { routeA2AEncounter, type A2AEncounterResult } from "../src/lib/a2a/router";
import { extractUserStateSnapshot } from "../src/lib/user-state/extractor";
import type { UserStateSnapshot } from "../src/lib/user-state/types";
import { buildTextHash } from "../src/lib/data/hash";
import { clearSearchIndexCache, loadSearchIndex } from "../src/lib/search/index-store";
import { searchPassages } from "../src/lib/search/service";
import { createClassicPassageWorkAgent } from "../src/lib/work-agents/classic-passage-adapter";
import { resolveWorkAgentByPassageId } from "../src/lib/work-agents/registry";
import type { WorkAgentManifest } from "../src/lib/work-agents/types";
import { createGrowthSessionStore } from "../src/lib/growth/session-store";
import { GrowthService } from "../src/lib/growth/service";
import { growthService } from "../src/lib/growth/service";
import type { GrowthEvent } from "../src/lib/growth/types";
import {
  buildAnnotationCacheKey,
  resetAnnotationCache,
} from "../src/lib/annotation/cache";
import {
  getAnnotationTelemetryEvents,
  recordAnnotationTelemetry,
  resetAnnotationTelemetry,
} from "../src/lib/annotation/telemetry";
import { userStateSessionStore } from "../src/lib/user-state/session-store";
import { resolveAnnotationLlmRuntimeStatus } from "../src/lib/annotation/llm";
import { createAnnotation } from "../src/lib/annotation/service";
import { resetAnnotateAbuseGuard } from "../src/lib/annotation/abuse-guard";
import { resetSearchAbuseGuard } from "../src/lib/search/abuse-guard";
import { clearSearchGraphCache } from "../src/lib/search/graph/store";
import { POST as annotatePost } from "../src/app/api/annotate/route";
import { POST as searchPost } from "../src/app/api/search/route";
import { GrowthTrace } from "../src/components/growth/GrowthTrace";
import { AnnotationPanel } from "../src/components/annotation/AnnotationPanel";
import type { AnnotationAgentTrace, AnnotationResult, PassageRecord } from "../src/types";

type CaseStatus = "passed" | "failed" | "partial" | "skipped";

Object.assign(globalThis, { React });

interface DocCase {
  id: string;
  title: string;
  group: string;
}

interface CaseResult extends DocCase {
  status: CaseStatus;
  evidence: string[];
  error?: string;
  durationMs: number;
}

type Runner = () => Promise<string[] | string> | string[] | string;

interface CaseRunner {
  status?: Extract<CaseStatus, "partial" | "skipped">;
  reason?: string;
  run?: Runner;
}

const repoRoot = process.cwd();
const docPath = path.join(repoRoot, "docs/qa/a2a-agentic-framework-100-examples.md");
const jsonOutputPath = path.join(repoRoot, "docs/qa/a2a-agentic-framework-100-examples-results.json");
const markdownOutputPath = path.join(repoRoot, "docs/qa/a2a-agentic-framework-100-examples-report.md");
const jestOutputPath = path.join(
  repoRoot,
  "docs/qa/a2a-agentic-framework-100-examples-jest-results.json",
);
const fixedCreatedAt = "2026-06-16T00:00:00.000Z";
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function extractDocCases(markdown: string): DocCase[] {
  const groupByPrefix: Record<string, string> = {
    A: "Protocol Contract",
    B: "Router Behavior",
    C: "User-State Extraction",
    D: "Work-Agent Manifest",
    E: "Growth Event And Store",
    F: "Annotation Integration",
    G: "UI Agent Trace",
    H: "Privacy And Fail-Open",
    I: "End-To-End Framework Flow",
    J: "Future Extensibility And Non-Regression",
  };
  const cases: DocCase[] = [];
  const matcher = /^([A-J]\d{2})\.\s+\*\*(.+?)\*\*/gmu;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(markdown)) !== null) {
    const id = match[1] ?? "";
    cases.push({
      id,
      title: match[2] ?? "",
      group: groupByPrefix[id[0] ?? ""] ?? "Unknown",
    });
  }

  return cases;
}

function signal(label: string, confidence = 0.8, source: "query" | "passage" = "query") {
  return { label, confidence, source };
}

function makeUserState(overrides: Partial<UserStateSnapshot> = {}): UserStateSnapshot {
  return {
    id: "user-state:test",
    sessionId: "session:test",
    utterance: "如何面对压力",
    emotion: [signal("pressure", 0.8)],
    intent: [signal("seek_guidance", 0.82)],
    memoryAnchors: [],
    personaHints: [],
    privacyMode: "ephemeral",
    createdAt: fixedCreatedAt,
    ...overrides,
  };
}

function makeWorkAgent(overrides: Partial<WorkAgentManifest> = {}): WorkAgentManifest {
  return {
    id: "work:classic:lunyu-1-1:abcdef123456",
    kind: "classic_passage",
    title: "论语",
    source: "论语",
    canonicalRef: "classic:论语:学而篇:1:abcdef123456",
    contentRef: {
      passageId: "lunyu-1-1",
      chapter: "学而篇",
      section: 1,
      textHash: "abcdef123456",
    },
    affectField: [signal("settling", 0.7, "passage")],
    interpretiveFrames: [
      {
        id: "liu_jing_zhu_wo",
        label: "六经注我",
        description: "The passage responds to the current user state.",
      },
    ],
    growthPolicy: {
      persist: "ephemeral_only",
      canGrow: true,
      allowedActs: ["encounter", "interpret", "grow", "reflect", "link"],
      maxSummaryLength: 120,
    },
    ...overrides,
  };
}

function requireEnabled(result: A2AEncounterResult): Extract<A2AEncounterResult, { enabled: true }> {
  assert.equal(result.enabled, true);
  return result as Extract<A2AEncounterResult, { enabled: true }>;
}

function labels(items: Array<{ label: string }>): string[] {
  return items.map(item => item.label);
}

function makePassage(text: string, overrides: Partial<PassageRecord> = {}): PassageRecord {
  return {
    id: "test-passage-1",
    source: "论语",
    collection: "四书",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 1,
    text,
    textHash: buildTextHash(text),
    corpusVersion: "test",
    ...overrides,
  };
}

function growthEvent(id: string): GrowthEvent {
  return {
    id,
    traceId: `trace:${id}`,
    userStateId: "user-state:test",
    workAgentId: "work:test",
    act: "grow",
    relationTheme: "寻求指引",
    branchLabel: "求取分寸",
    summary: "系统读到的倾向形成一次关系枝条。",
    confidence: 0.76,
    createdAt: fixedCreatedAt,
  };
}

function createRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const requestBody = typeof body === "string" ? body : JSON.stringify(body);
  const requestBytes = Uint8Array.from(Buffer.from(requestBody, "utf8"));
  const requestHeaders = new Map(
    Object.entries({
      "content-type": "application/json",
      ...headers,
    }).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    headers: {
      get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null,
    },
    body: {
      getReader: () => {
        let consumed = false;

        return {
          read: async () => {
            if (consumed) {
              return { done: true, value: undefined };
            }

            consumed = true;
            return { done: false, value: requestBytes };
          },
        };
      },
    },
  } as unknown as Request;
}

function resetRuntime(): void {
  process.env = { ...originalEnv };
  for (const key of [
    "ANNOTATION_LLM_MODE",
    "ANNOTATION_MODE",
    "ANNOTATION_LLM_TIMEOUT_MS",
    "ANNOTATION_CACHE_TTL_MS",
    "ANNOTATION_CACHE_MAX_ENTRIES",
    "ANNOTATION_TELEMETRY",
    "SEARCH_GRAPH_PATH",
    "LLM_MODEL_PRIMARY",
    "LLM_BASE_URL_PRIMARY",
    "LLM_API_KEY_PRIMARY",
    "LLM_MODEL_SECONDARY",
    "LLM_BASE_URL_SECONDARY",
    "LLM_API_KEY_SECONDARY",
    "LLM_MODEL",
    "LLM_MODEL_2",
    "LLM_PROVIDER",
    "LLM_PROVIDER_2",
    "LLM_PROVIDE_2",
    "LLM_API_KEY",
    "LLM_API_KEY_2",
    "LLM_BASE_URL",
    "LLM_BASE_URL_2",
    "OPENAI_API_KEY",
    "OPENAI_API_KEY_2",
    "OPENAI_BASE_URL",
    "OPENAI_BASE_URL_2",
  ]) {
    delete process.env[key];
  }
  globalThis.fetch = originalFetch;
  resetAnnotationCache();
  resetAnnotationTelemetry();
  resetAnnotateAbuseGuard();
  resetSearchAbuseGuard();
  clearSearchGraphCache();
}

function withNoLlmEnv(): void {
  resetRuntime();
  process.env.NODE_ENV = "test";
}

function publicTraceKeys(trace: AnnotationAgentTrace): string[] {
  return Object.keys(trace).sort();
}

async function knownPassage(id: string): Promise<PassageRecord> {
  const index = await loadSearchIndex();
  const passage = index.corpus.find(candidate => candidate.id === id);
  assert.ok(passage, `Expected fixture passage ${id}.`);
  return passage;
}

function resultJson(value: unknown): string {
  return JSON.stringify(value);
}

function renderGrowthTrace(trace?: AnnotationAgentTrace): string {
  return renderToStaticMarkup(React.createElement(GrowthTrace, { trace }));
}

function renderAnnotationPanel(annotation: AnnotationResult, placement: "desktop" | "mobile" = "desktop"): string {
  return renderToStaticMarkup(
    React.createElement(AnnotationPanel, {
      query: "如何面对困境",
      annotation,
      isLoading: false,
      error: null,
      placement,
      onWikiNavigate: () => undefined,
    }),
  );
}

const runners: Record<string, CaseRunner> = {
  A01: {
    run: () => {
      const message = {
        id: "msg:1",
        traceId: "trace:1",
        from: "user-state:1",
        to: "work:1",
        act: "encounter",
        createdAt: fixedCreatedAt,
        payload: {},
      };
      assert.equal(isAgentMessage(message), true);
      return "Minimal envelope accepted by isAgentMessage.";
    },
  },
  A02: {
    run: () => {
      for (const field of ["id", "traceId", "from", "to", "createdAt"]) {
        const message = {
          id: "msg:1",
          traceId: "trace:1",
          from: "user",
          to: "work",
          act: "encounter",
          createdAt: fixedCreatedAt,
          payload: {},
          [field]: "   ",
        };
        assert.equal(isAgentMessage(message), false, field);
      }
      return "Blank string envelope fields rejected.";
    },
  },
  A03: {
    run: () => {
      for (const act of ["notify", "search", "Encounter"]) {
        assert.equal(isAgentMessageAct(act), false);
        assert.equal(
          isAgentMessage({
            id: "msg:1",
            traceId: "trace:1",
            from: "user",
            to: "work",
            act,
            createdAt: fixedCreatedAt,
            payload: {},
          }),
          false,
        );
      }
      return "Invalid acts rejected.";
    },
  },
  A04: {
    run: () => {
      for (const act of AGENT_MESSAGE_ACTS) {
        const message = createAgentMessage({
          from: "user",
          to: "work",
          act,
          payload: {},
          createdAt: fixedCreatedAt,
        });
        assert.equal(isAgentMessage(message), true, act);
      }
      return `All legal acts covered: ${AGENT_MESSAGE_ACTS.join(", ")}.`;
    },
  },
  A05: {
    run: () => {
      const input = {
        from: "user",
        to: "work",
        act: "encounter" as AgentMessageAct,
        payload: { x: 1 },
        createdAt: fixedCreatedAt,
      };
      const first = createAgentMessage(input);
      const second = createAgentMessage(input);
      assert.equal(first.traceId, second.traceId);
      assert.match(first.traceId, /^trace:[a-f0-9]{18}$/u);
      return `Stable traceId ${first.traceId}.`;
    },
  },
  A06: {
    run: () => {
      const first = createAgentMessage({
        traceId: "trace:explicit",
        from: "user",
        to: "work",
        act: "encounter",
        payload: { x: 1 },
        createdAt: fixedCreatedAt,
      });
      const second = createAgentMessage({
        traceId: "trace:different",
        from: "user",
        to: "work",
        act: "encounter",
        payload: { x: 1 },
        createdAt: fixedCreatedAt,
      });
      assert.equal(first.traceId, "trace:explicit");
      assert.match(first.id, /^msg:[a-f0-9]{18}$/u);
      assert.notEqual(first.id, second.id);
      return "Explicit traceId preserved and participates in message id.";
    },
  },
  A07: {
    run: () => {
      const base = {
        traceId: "trace:payload",
        from: "user",
        to: "work",
        act: "encounter" as AgentMessageAct,
        createdAt: fixedCreatedAt,
      };
      const first = createAgentMessage({ ...base, payload: { answer: 1 } });
      const second = createAgentMessage({ ...base, payload: { answer: 2 } });
      assert.notEqual(first.id, second.id);
      assert.deepEqual(first.payload, { answer: 1 });
      return "Message id changes when payload changes.";
    },
  },
  A08: {
    run: () => {
      assert.equal(
        isAgentMessage({
          id: "msg:1",
          traceId: "trace:1",
          from: "user",
          to: "work",
          act: "encounter",
          createdAt: fixedCreatedAt,
        }),
        false,
      );
      for (const payload of [null, undefined]) {
        assert.equal(
          isAgentMessage({
            id: "msg:1",
            traceId: "trace:1",
            from: "user",
            to: "work",
            act: "encounter",
            createdAt: fixedCreatedAt,
            payload,
          }),
          true,
        );
      }
      return "Payload presence boundary matches envelope guard behavior.";
    },
  },
  A09: {
    run: () => {
      const generated = createAgentMessage({
        from: "user",
        to: "work",
        act: "encounter",
        payload: {},
      });
      const fixed = createAgentMessage({
        from: "user",
        to: "work",
        act: "encounter",
        payload: {},
        createdAt: fixedCreatedAt,
      });
      assert.match(generated.createdAt, /^\d{4}-\d{2}-\d{2}T/u);
      assert.equal(fixed.createdAt, fixedCreatedAt);
      assert.notEqual(generated.id, fixed.id);
      return "createdAt is generated or passed through and affects ids.";
    },
  },
  A10: {
    run: () => {
      const base = {
        passageId: "lunyu-1-1",
        passageText: "text",
        sixToMe: "six",
        meToSix: "me",
        links: [],
      };
      const withTrace = {
        ...base,
        agentTrace: {
          workAgentId: "work:1",
          relationTheme: "寻求指引",
          branchLabel: "求取分寸",
          growthSummary: "summary",
        },
      };
      for (const response of [base, withTrace]) {
        const legacy = {
          passageId: response.passageId,
          passageText: response.passageText,
          sixToMe: response.sixToMe,
          meToSix: response.meToSix,
          links: response.links,
        };
        assert.deepEqual(legacy, base);
      }
      return "Legacy client projection ignores optional agentTrace.";
    },
  },
  B01: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({
            intent: [signal("seek_guidance", 0.82)],
            emotion: [signal("pressure", 0.8)],
          }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.growthEvent.relationTheme, "寻求指引");
      assert.equal(result.growthEvent.branchLabel, "求取分寸");
      return "Intent label wins over emotion.";
    },
  },
  B02: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({ intent: [], emotion: [signal("pressure", 0.78)] }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.growthEvent.relationTheme, "压力中求定");
      assert.equal(result.growthEvent.branchLabel, "先稳其心");
      return "Emotion fallback selected.";
    },
  },
  B03: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({
            intent: [],
            emotion: [],
            personaHints: [signal("nostalgia", 0.7)],
          }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.growthEvent.relationTheme, "旧忆回身");
      assert.equal(result.growthEvent.branchLabel, "旧事新读");
      return "Persona fallback selected.";
    },
  },
  B04: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({
            intent: [],
            emotion: [],
            personaHints: [],
            memoryAnchors: [signal("family", 0.74)],
          }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.growthEvent.relationTheme, "理解其义");
      assert.equal(result.growthEvent.branchLabel, "照见其义");
      return "Default interpret selected; memory anchors do not choose primary label.";
    },
  },
  B05: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({ intent: [signal("unknown_need", 0.8)] }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.growthEvent.relationTheme, "此刻互注");
      assert.equal(result.growthEvent.branchLabel, "由问生枝");
      return "Unknown primary label fail-soft mapping verified.";
    },
  },
  B06: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({
            intent: [signal("seek_guidance"), signal("compare")],
            emotion: [signal("pressure")],
            memoryAnchors: [signal("remember")],
            personaHints: [signal("settling")],
          }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.deepEqual(result.encounterMessage.payload.signalLabels, [
        "seek_guidance",
        "compare",
        "pressure",
        "remember",
        "settling",
      ]);
      return "Signal label order is stable.";
    },
  },
  B07: {
    run: () => {
      const many = Array.from({ length: 12 }, (_, index) => signal(`label_${index}`));
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({
            intent: many.slice(0, 5),
            emotion: many.slice(5, 8),
            memoryAnchors: many.slice(8, 10),
            personaHints: many.slice(10),
          }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.deepEqual(
        result.encounterMessage.payload.signalLabels,
        many.slice(0, 8).map(item => item.label),
      );
      return "Signal labels truncate to first 8.";
    },
  },
  B08: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({ intent: [signal("seek_guidance", 0.82)] }),
          workAgent: makeWorkAgent({ affectField: [signal("settling", 0.7, "passage")] }),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.growthEvent.confidence, 0.76);
      assert.equal(result.growthMessage.payload.confidence, 0.76);
      return "Confidence average and rounding verified.";
    },
  },
  B09: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({ utterance: "raw-sensitive-utterance" }),
          workAgent: makeWorkAgent({
            title: "很长很长很长很长的标题",
            interpretiveFrames: [
              {
                id: "long",
                label: "很长很长很长很长的框架",
                description: "long",
              },
            ],
            growthPolicy: {
              persist: "ephemeral_only",
              canGrow: true,
              allowedActs: ["encounter", "grow"],
              maxSummaryLength: 40,
            },
          }),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.ok(result.growthEvent.summary.endsWith("..."));
      assert.ok(!result.growthEvent.summary.includes("raw-sensitive-utterance"));
      assert.ok(
        result.growthEvent.summary.length <= 40,
        `Expected summary length <= 40, got ${result.growthEvent.summary.length}`,
      );
      return `Summary length ${result.growthEvent.summary.length}.`;
    },
  },
  B10: {
    run: () => {
      for (const workAgent of [
        makeWorkAgent({ id: "" }),
        makeWorkAgent({
          growthPolicy: {
            persist: "ephemeral_only",
            canGrow: false,
            allowedActs: ["encounter", "grow"],
            maxSummaryLength: 120,
          },
        }),
        makeWorkAgent({
          growthPolicy: {
            persist: "ephemeral_only",
            canGrow: true,
            allowedActs: ["encounter", "interpret"],
            maxSummaryLength: 120,
          },
        }),
      ]) {
        assert.deepEqual(
          routeA2AEncounter({ userState: makeUserState(), workAgent, createdAt: fixedCreatedAt }),
          { enabled: false, reason: "work_agent_disabled" },
        );
      }
      return "Invalid work-agent variants fail open.";
    },
  },
  C01: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "最近压力很大，我该怎么办，才能安顿下来？",
        createdAt: fixedCreatedAt,
      });
      assert.deepEqual(labels(snapshot.emotion), ["pressure", "settling"]);
      assert.equal(snapshot.intent[0]?.label, "seek_guidance");
      assert.equal(snapshot.privacyMode, "ephemeral");
      return "Chinese pressure/guidance extraction matched.";
    },
  },
  C02: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "I'm anxious and overwhelmed. What should I practice next?",
        createdAt: fixedCreatedAt,
      });
      assert.ok(labels(snapshot.emotion).includes("pressure"));
      assert.ok(labels(snapshot.intent).includes("seek_guidance"));
      assert.ok(labels(snapshot.personaHints).includes("learning_oriented"));
      return "English pressure/guidance extraction matched.";
    },
  },
  C03: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "I feel lost，但我想继续 explore 下一句。",
        createdAt: fixedCreatedAt,
      });
      assert.ok(labels(snapshot.emotion).includes("uncertainty"));
      assert.ok(labels(snapshot.intent).includes("continue_exploration"));
      return "Mixed Chinese/English exploration extraction matched.";
    },
  },
  C04: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "这句话是什么意思？Can you help me understand it?",
        createdAt: fixedCreatedAt,
      });
      const guidance = snapshot.intent.find(item => item.label === "seek_guidance");
      const interpret = snapshot.intent.find(item => item.label === "interpret");
      assert.ok(guidance);
      assert.ok(interpret);
      assert.ok(guidance.confidence > interpret.confidence);
      return "Guidance confidence ranks above interpret.";
    },
  },
  C05: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "我记得小时候和父母在家里吵架的那段话。",
        createdAt: fixedCreatedAt,
      });
      assert.ok(labels(snapshot.intent).includes("remember"));
      assert.deepEqual(labels(snapshot.memoryAnchors), ["family"]);
      assert.ok(!resultJson(snapshot.memoryAnchors).includes("吵架"));
      return "Family memory anchor is label-only.";
    },
  },
  C06: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "I remember my friend from school and the teacher who helped us.",
        createdAt: fixedCreatedAt,
      });
      assert.ok(labels(snapshot.memoryAnchors).includes("friendship"));
      assert.ok(labels(snapshot.memoryAnchors).includes("school"));
      return "Friendship and school anchors extracted.";
    },
  },
  C07: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "最近很怀念故乡那座城市。",
        createdAt: fixedCreatedAt,
      });
      assert.ok(labels(snapshot.emotion).includes("nostalgia"));
      assert.ok(labels(snapshot.intent).includes("remember"));
      assert.ok(labels(snapshot.memoryAnchors).includes("hometown"));
      return "Hometown nostalgia extracted.";
    },
  },
  C08: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "I miss that old experience, but I don't want to name details.",
        createdAt: fixedCreatedAt,
      });
      assert.ok(labels(snapshot.emotion).includes("nostalgia"));
      assert.ok(labels(snapshot.intent).includes("remember"));
      assert.deepEqual(labels(snapshot.memoryAnchors), ["past_experience"]);
      return "Generic past_experience anchor extracted.";
    },
  },
  C09: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "我在反思和朋友的关系，也想通过练习继续成长。",
        createdAt: fixedCreatedAt,
      });
      assert.ok(labels(snapshot.personaHints).includes("reflective"));
      assert.ok(labels(snapshot.personaHints).includes("relational"));
      assert.ok(labels(snapshot.personaHints).includes("learning_oriented"));
      return "Persona hint combination extracted.";
    },
  },
  C10: {
    run: () => {
      const input = {
        utterance: "我记得小时候和父母在家里吵架的那段话。",
        sessionId: "session:saved",
        privacyMode: "saved" as const,
        createdAt: fixedCreatedAt,
      };
      const first = extractUserStateSnapshot(input);
      const second = extractUserStateSnapshot(input);
      assert.equal(first.id, second.id);
      assert.equal(first.privacyMode, "saved");
      assert.ok(!resultJson(first.memoryAnchors).includes("吵架"));
      return "Saved privacy mode keeps stable id and label-only anchors.";
    },
  },
  D01: {
    run: async () => {
      const passage = await knownPassage("lunyu-1-1");
      const manifest = createClassicPassageWorkAgent(passage);
      assert.ok(manifest);
      assert.equal(manifest.kind, "classic_passage");
      assert.equal(manifest.id, `work:classic:${passage.id}:${passage.textHash.slice(0, 12)}`);
      assert.equal(manifest.contentRef.passageId, passage.id);
      assert.equal(manifest.contentRef.chapter, passage.chapter);
      assert.equal(manifest.contentRef.section, passage.section);
      assert.equal(manifest.contentRef.textHash, passage.textHash);
      return "Classic passage manifest maps fields and stable id.";
    },
  },
  D02: {
    run: async () => {
      const passage = await knownPassage("lunyu-1-1");
      assert.equal(
        createClassicPassageWorkAgent(passage, { expectedTextHash: buildTextHash("stale text") }),
        null,
      );
      return "Expected hash mismatch rejected.";
    },
  },
  D03: {
    run: async () => {
      const passage = await knownPassage("lunyu-1-1");
      assert.equal(createClassicPassageWorkAgent({ ...passage, textHash: "bad-hash" }), null);
      return "Internal passage hash mismatch rejected.";
    },
  },
  D04: {
    run: async () => {
      const passage = await knownPassage("lunyu-1-1");
      const manifest = await resolveWorkAgentByPassageId(passage.id, {
        passageText: ` \n${passage.text}\n `,
      });
      assert.ok(manifest);
      return "Trimmed passageText resolves.";
    },
  },
  D05: {
    run: async () => {
      const passage = await knownPassage("lunyu-1-1");
      const manifest = await resolveWorkAgentByPassageId(passage.id, {
        passageText: `${passage.text}错`,
      });
      assert.equal(manifest, null);
      return "One-character passageText drift rejected.";
    },
  },
  D06: {
    run: () => {
      const passage = makePassage("学而有朋，不愠而三省其身。");
      const manifest = createClassicPassageWorkAgent(passage);
      assert.ok(manifest);
      assert.ok(labels(manifest.affectField).includes("learning"));
      assert.ok(labels(manifest.affectField).includes("trust"));
      assert.ok(labels(manifest.affectField).includes("settling"));
      assert.ok(labels(manifest.affectField).includes("self_correction"));
      assert.ok(manifest.affectField.every(item => item.source === "passage"));
      return "Multiple affect signals extracted from passage text.";
    },
  },
  D07: {
    run: () => {
      const passage = makePassage("天地玄黄，宇宙洪荒。", {
        source: "无题",
        chapter: "玄黄篇",
      });
      const manifest = createClassicPassageWorkAgent(passage);
      assert.deepEqual(manifest?.affectField, [
        { label: "classic_resonance", confidence: 0.58, source: "passage" },
      ]);
      return "Default classic_resonance fallback emitted.";
    },
  },
  D08: {
    run: async () => {
      const passage = await knownPassage("lunyu-1-1");
      const first = createClassicPassageWorkAgent(passage);
      const second = createClassicPassageWorkAgent(passage);
      assert.ok(first);
      assert.ok(second);
      first.interpretiveFrames[0]!.label = "mutated";
      assert.deepEqual(
        second.interpretiveFrames.map(frame => frame.id),
        ["liu_jing_zhu_wo", "wo_zhu_liu_jing", "contrast", "echo", "silence"],
      );
      assert.notEqual(second.interpretiveFrames[0]!.label, "mutated");
      return "Interpretive frames are complete and defensively cloned.";
    },
  },
  D09: {
    run: async () => {
      const passage = await knownPassage("lunyu-1-1");
      const manifest = createClassicPassageWorkAgent(passage);
      assert.deepEqual(manifest?.growthPolicy, {
        persist: "ephemeral_only",
        canGrow: true,
        allowedActs: ["encounter", "interpret", "grow", "reflect", "link"],
        maxSummaryLength: 120,
      });
      return "Growth policy exact constraints verified.";
    },
  },
  D10: {
    run: async () => {
      assert.equal(await resolveWorkAgentByPassageId("missing-passage"), null);
      clearSearchIndexCache();
      process.env.SEARCH_EMBEDDING_ARTIFACT_PATH = "missing-a2a-qa-embeddings.json";
      assert.equal(await resolveWorkAgentByPassageId("lunyu-1-1"), null);
      delete process.env.SEARCH_EMBEDDING_ARTIFACT_PATH;
      clearSearchIndexCache();
      return "Missing passage and index-load failure both resolve to null.";
    },
  },
  E01: {
    run: () => {
      const store = createGrowthSessionStore();
      const event = growthEvent("e1");
      store.append("s1", event, 1000);
      assert.deepEqual(store.read("e1", 1000), event);
      return "Append then read succeeds.";
    },
  },
  E02: {
    run: () => {
      const store = createGrowthSessionStore();
      store.append("s1", growthEvent("e1"), 1000);
      store.append("s1", growthEvent("e2"), 3000);
      store.append("s1", growthEvent("e3"), 2000);
      assert.deepEqual(store.list("s1", 3000).map(item => item.id), ["e1", "e3", "e2"]);
      return "List sorted by insertedAt.";
    },
  },
  E03: {
    run: () => {
      const store = createGrowthSessionStore();
      store.append("s1", growthEvent("e1"), 1000);
      store.append("s2", growthEvent("e2"), 1000);
      assert.deepEqual(store.list("s1", 1000).map(item => item.id), ["e1"]);
      assert.deepEqual(store.list("s2", 1000).map(item => item.id), ["e2"]);
      return "Session list isolation verified.";
    },
  },
  E04: {
    run: () => {
      const store = createGrowthSessionStore();
      store.append("s2", growthEvent("e2"), 1000);
      assert.equal(store.read("e2", 1000)?.id, "e2");
      return "Global event id read works.";
    },
  },
  E05: {
    run: () => {
      const store = createGrowthSessionStore({ ttlMs: 100 });
      store.append("s1", growthEvent("e1"), 1000);
      assert.equal(store.read("e1", 1099)?.id, "e1");
      assert.deepEqual(store.list("s1", 1099).map(item => item.id), ["e1"]);
      return "TTL not expired before boundary.";
    },
  },
  E06: {
    run: () => {
      const store = createGrowthSessionStore({ ttlMs: 100 });
      store.append("s1", growthEvent("e1"), 1000);
      assert.equal(store.read("e1", 1100), null);
      assert.deepEqual(store.list("s1", 1100), []);
      assert.equal(store.size(1100), 0);
      return "TTL boundary prunes at expiresAt.";
    },
  },
  E07: {
    run: () => {
      const store = createGrowthSessionStore({ maxEventsPerSession: 2 });
      store.append("s1", growthEvent("e1"), 1000);
      store.append("s1", growthEvent("e2"), 2000);
      store.append("s1", growthEvent("e3"), 3000);
      assert.deepEqual(store.list("s1", 3000).map(item => item.id), ["e2", "e3"]);
      assert.equal(store.read("e1", 3000), null);
      return "Per-session max evicts oldest event.";
    },
  },
  E08: {
    run: () => {
      const store = createGrowthSessionStore({ maxSessions: 2 });
      store.append("s1", growthEvent("e1"), 1000);
      store.append("s2", growthEvent("e2"), 2000);
      store.append("s3", growthEvent("e3"), 3000);
      assert.deepEqual(store.list("s1", 3000), []);
      assert.deepEqual(store.list("s2", 3000).map(item => item.id), ["e2"]);
      assert.deepEqual(store.list("s3", 3000).map(item => item.id), ["e3"]);
      return "Max sessions evicts oldest session.";
    },
  },
  E09: {
    run: () => {
      const service = new GrowthService({
        append: () => {
          throw new Error("store down");
        },
        list: () => {
          throw new Error("store down");
        },
        read: () => {
          throw new Error("store down");
        },
      });
      assert.equal(service.append("s1", growthEvent("e1")), null);
      assert.deepEqual(service.list("s1"), []);
      assert.equal(service.read("e1"), null);
      return "GrowthService swallows store exceptions.";
    },
  },
  E10: {
    run: () => {
      const store = createGrowthSessionStore();
      const event = growthEvent("e1");
      event.summary = "original";
      store.append("s1", event, 1000);
      event.summary = "mutated";
      const firstRead = store.read("e1", 1000);
      assert.equal(firstRead?.summary, "original");
      firstRead!.summary = "mutated again";
      assert.equal(store.read("e1", 1000)?.summary, "original");
      const service = new GrowthService(store);
      const serviceRead = service.read("e1", 1000);
      assert.notEqual(serviceRead, store.read("e1", 1000));
      return "Store and service return defensive copies.";
    },
  },
  F01: {
    run: async () => {
      withNoLlmEnv();
      const annotation = await createAnnotation({
        query: "朋友相处要诚信",
        passageId: "lunyu-1-7",
        passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
        style: "modern",
      });
      assert.equal(annotation.passageId, "lunyu-1-7");
      assert.ok(annotation.agentTrace);
      assert.ok(annotation.agentTrace.workAgentId.includes("work:classic:lunyu-1-7"));
      assert.deepEqual(publicTraceKeys(annotation.agentTrace), [
        "branchLabel",
        "growthSummary",
        "relationTheme",
        "workAgentId",
      ]);
      return "Known selected passage returns public-safe agentTrace.";
    },
  },
  F02: {
    run: async () => {
      withNoLlmEnv();
      const annotation = await createAnnotation({
        query: "如何自省",
        passageId: "external-note-1",
        passageText: "我想知道自己哪里做得不够。",
        style: "modern",
      });
      assert.equal(annotation.passageId, "external-note-1");
      assert.equal(annotation.agentTrace, undefined);
      assert.ok(annotation.links.length > 0);
      return "Unknown external passage annotates without agentTrace.";
    },
  },
  F03: {
    run: async () => {
      withNoLlmEnv();
      const annotation = await createAnnotation({
        query: "如何面对压力",
        passageId: "lunyu-1-1",
        passageText: "篡改后的文本",
        style: "modern",
      });
      assert.equal(annotation.passageText, "篡改后的文本");
      assert.equal(annotation.agentTrace, undefined);
      assert.ok(!annotation.links.map(link => link.passageId).includes("lunyu-1-1"));
      return "Known id with stale text fail-opens without binding trace.";
    },
  },
  F04: {
    run: async () => {
      withNoLlmEnv();
      const response = await annotatePost(
        createRequest({
          query: "朋友相处要诚信",
          passageId: "lunyu-1-7",
          passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
          style: "modern",
        }),
      );
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      for (const key of ["passageId", "passageText", "sixToMe", "meToSix", "links"]) {
        assert.ok(key in payload.data, key);
      }
      assert.ok("agentTrace" in payload.data);
      return "Route response keeps legacy annotation fields plus optional trace.";
    },
  },
  F05: {
    run: async () => {
      withNoLlmEnv();
      const passage = await knownPassage("lunyu-1-8");
      const annotation = await createAnnotation({
        query: "吾日三省如何自省",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
      });
      assert.equal(annotation.passageId, "lunyu-1-8");
      assert.ok(annotation.agentTrace?.workAgentId.includes("lunyu-1-8"));
      return "Selected passage wins over query relevance for agentTrace binding.";
    },
  },
  F06: {
    run: async () => {
      resetRuntime();
      process.env.NODE_ENV = "test";
      process.env.LLM_MODEL_PRIMARY = "test-model";
      process.env.LLM_BASE_URL_PRIMARY = "https://provider.example/v1";
      process.env.LLM_API_KEY_PRIMARY = "sk-test";
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sixToMe: "LLM 经典回应",
                    meToSix: "LLM 当代反观",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      let calls = 0;
      const original = globalThis.fetch;
      globalThis.fetch = async (...args) => {
        calls += 1;
        return original(...args);
      };
      const passage = await knownPassage("lunyu-1-1");
      const request = {
        query: "如何面对困境",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern" as const,
      };
      const first = await createAnnotation(request);
      const second = await createAnnotation({
        ...request,
        visitedPassageIds: [first.links[0]?.passageId ?? "lunyu-1-2"],
      });
      assert.equal(calls, 1);
      assert.equal(second.sixToMe, first.sixToMe);
      assert.ok(second.agentTrace);
      assert.notDeepEqual(second.links.map(link => link.passageId), first.links.map(link => link.passageId));
      return "Cache hit reuses copy, rebuilds links, and returns fresh agentTrace.";
    },
  },
  F07: {
    run: async () => {
      resetRuntime();
      process.env.NODE_ENV = "test";
      process.env.LLM_MODEL_PRIMARY = "test-model";
      process.env.LLM_BASE_URL_PRIMARY = "https://provider.example/v1";
      process.env.LLM_API_KEY_PRIMARY = "sk-test";
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response("provider down", { status: 503 });
      };
      const passage = await knownPassage("lunyu-1-1");
      const request = {
        query: "如何面对困境",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern" as const,
      };
      const first = await createAnnotation(request);
      const second = await createAnnotation(request);
      assert.equal(calls, 2);
      assert.ok(first.agentTrace);
      assert.ok(second.agentTrace);
      assert.equal(first.sixToMe, second.sixToMe);
      return "Provider-error fallback is not cached.";
    },
  },
  F08: {
    run: async () => {
      resetRuntime();
      process.env.NODE_ENV = "test";
      process.env.LLM_MODEL_PRIMARY = "test-model";
      process.env.LLM_BASE_URL_PRIMARY = "https://provider.example/v1";
      process.env.LLM_API_KEY_PRIMARY = "sk-test";
      let requestBody = "";
      globalThis.fetch = async (_url, init) => {
        requestBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sixToMe: "带关系上下文的经典回应",
                    meToSix: "带关系上下文的当代反观",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        );
      };
      const passage = await knownPassage("lunyu-1-1");
      const annotation = await createAnnotation({
        query: "如何面对压力",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
      });
      assert.equal(annotation.sixToMe, "带关系上下文的经典回应");
      assert.ok(requestBody.includes("关系倾向"));
      assert.ok(requestBody.includes("关系枝条"));
      assert.ok(requestBody.includes("关系摘要"));
      assert.ok(!requestBody.includes("memoryAnchors"));
      assert.ok(!requestBody.includes("userStateId"));
      return "LLM prompt receives growth context without raw user-state JSON.";
    },
  },
  F09: {
    run: async () => {
      withNoLlmEnv();
      const passage = await knownPassage("lunyu-1-1");
      const annotation = await createAnnotation({
        query: "如何面对压力",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
      });
      assert.ok(annotation.agentTrace);
      assert.ok(annotation.sixToMe.includes("系统读到的倾向"));
      assert.ok(annotation.meToSix.includes("系统读到的倾向"));
      return "Deterministic fallback carries relation-branch hint.";
    },
  },
  F10: {
    run: async () => {
      withNoLlmEnv();
      const passage = await knownPassage("lunyu-1-1");
      const annotation = await createAnnotation({
        query: "如何面对压力",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
        visitedPassageIds: [" lunyu-1-1 ", "lunyu-1-2", "lunyu-1-2"],
      });
      const linkIds = annotation.links.map(link => link.passageId);
      assert.ok(!linkIds.includes("lunyu-1-1"));
      assert.ok(!linkIds.includes("lunyu-1-2"));
      assert.ok(annotation.agentTrace);
      return "Visited ids normalized; links exclude visited/current and trace still builds.";
    },
  },
  G01: {
    run: () => {
      const html = renderGrowthTrace({
        workAgentId: "work:classic:secret",
        relationTheme: "寻求指引",
        branchLabel: "求取分寸",
        growthSummary: "系统读到的倾向形成一次关系枝条。",
      });
      assert.ok(html.includes("aria-label=\"关系枝条\""));
      assert.ok(html.includes("寻求指引"));
      assert.ok(html.includes("求取分寸"));
      assert.ok(!html.includes("work:classic:secret"));
      assert.ok(!html.includes("confidence"));
      return "GrowthTrace SSR exposes readable copy only.";
    },
  },
  G02: {
    run: () => {
      const html = renderGrowthTrace();
      assert.ok(html.includes("aria-label=\"关系枝条\""));
      assert.ok(html.includes("此处暂未生枝。"));
      return "No-trace empty state rendered.";
    },
  },
  G03: {
    run: () => {
      const html = renderAnnotationPanel({
        passageId: "lunyu-1-1",
        passageText: "学而时习之，不亦说乎？",
        sixToMe: "经典回应",
        meToSix: "当代反观",
        links: [],
      });
      assert.ok(html.includes("经典回应"));
      assert.ok(html.includes("此处暂未生枝。"));
      assert.ok(html.includes("此处暂止"));
      return "AnnotationPanel handles missing agentTrace.";
    },
  },
  G04: {
    run: () => {
      const html = renderGrowthTrace({
        workAgentId: "work:1",
        relationTheme: "很长很长很长很长很长很长很长很长的主题",
        branchLabel: "枝条",
        growthSummary: "摘要",
      });
      assert.ok(html.includes("max-w-32"));
      assert.ok(html.includes("truncate"));
      assert.ok(html.includes("text-right"));
      return "Long relationTheme uses truncating class.";
    },
  },
  G05: {
    run: () => {
      const branch = "很长很长的枝条标签，用于确认不会被误截断";
      const summary = "这是一段很长很长的关系摘要，用于确认完整文本仍在服务端渲染结果中。";
      const html = renderGrowthTrace({
        workAgentId: "work:1",
        relationTheme: "主题",
        branchLabel: branch,
        growthSummary: summary,
      });
      assert.ok(html.includes(branch));
      assert.ok(html.includes(summary));
      assert.ok(html.includes("leading-7"));
      return "Branch and summary remain fully rendered.";
    },
  },
  G06: {
    run: () => {
      const html = renderGrowthTrace({
        workAgentId: "work:1",
        relationTheme: "主题",
        branchLabel: "枝条",
        growthSummary: "摘要",
      });
      assert.ok(html.includes("aria-label=\"关系枝条\""));
      assert.ok(!html.includes("<button"));
      assert.ok(!html.includes("<a "));
      assert.ok(!html.includes("aria-hidden"));
      return "GrowthTrace has stable non-interactive a11y entry.";
    },
  },
  G07: {
    run: () => {
      const html = renderAnnotationPanel(
        {
          passageId: "lunyu-1-1",
          passageText: "学而时习之，不亦说乎？",
          sixToMe: "经典回应",
          meToSix: "当代反观",
          links: [],
          agentTrace: {
            workAgentId: "work:1",
            relationTheme: "主题",
            branchLabel: "枝条",
            growthSummary: "摘要",
          },
        },
        "mobile",
      );
      assert.ok(!html.includes("role=\"tablist\""));
      assert.ok(html.includes("aria-label=\"关系枝条\""));
      assert.ok(html.includes("py-3"));
      assert.ok(html.includes("border-stone-800/70"));
      assert.ok(html.includes("枝条"));
      assert.ok(html.includes("摘要"));
      return "Mobile panel renders compact trace and no desktop tablist.";
    },
  },
  G08: {
    run: () => {
      const html = renderAnnotationPanel({
        passageId: "lunyu-1-1",
        passageText: "学而时习之，不亦说乎？",
        sixToMe: "经典回应",
        meToSix: "当代反观",
        links: [],
        agentTrace: {
          workAgentId: "work:1",
          relationTheme: "主题",
          branchLabel: "枝条",
          growthSummary: "摘要",
        },
      });
      assert.equal((html.match(/aria-label="关系枝条"/gu) ?? []).length, 1);
      return "SSR output has exactly one trace region; focused RTL Jest covers desktop tab switching.";
    },
  },
  G09: {
    run: () => {
      const html = renderAnnotationPanel({
        passageId: "lunyu-1-1",
        passageText: "学而时习之，不亦说乎？",
        sixToMe: "经典回应",
        meToSix: "当代反观",
        links: [
          {
            passageId: "lunyu-1-2",
            label: "下一句",
            passageText: "其为人也孝弟。",
            source: "论语",
            chapter: "学而篇",
            section: 2,
          },
        ],
        agentTrace: {
          workAgentId: "work:1",
          relationTheme: "主题",
          branchLabel: "枝条",
          growthSummary: "摘要",
        },
      });
      assert.ok(html.indexOf("经典回应") < html.indexOf("关系枝条"));
      assert.ok(html.indexOf("关系枝条") < html.lastIndexOf("下一句"));
      return "Trace is rendered after copy and before next links.";
    },
  },
  G10: {
    run: () => {
      const annotation = {
        passageId: "lunyu-1-1",
        passageText: "学而时习之，不亦说乎？",
        sixToMe: "经典回应",
        meToSix: "当代反观",
        links: [],
        workAgentId: "legacy-work",
        agent_trace: "legacy-trace",
        growthContextHash: "legacy-hash",
      } as unknown as AnnotationResult;
      const html = renderAnnotationPanel(annotation);
      assert.ok(html.includes("此处暂未生枝。"));
      assert.ok(!html.includes("legacy-work"));
      assert.ok(!html.includes("agent_trace"));
      assert.ok(!html.includes("legacy-hash"));
      return "Legacy/extra fields do not enter UI.";
    },
  },
  H01: {
    run: () => {
      const raw = "unique-sensitive-utterance";
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({ utterance: raw }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      const serialized = resultJson({
        growthEvent: result.growthEvent,
        encounterMessage: result.encounterMessage,
        growthMessage: result.growthMessage,
      });
      assert.ok(!serialized.includes(raw));
      assert.ok(serialized.includes("userStateId"));
      assert.ok(serialized.includes("workAgentId"));
      return "A2A route serialization excludes raw utterance.";
    },
  },
  H02: {
    run: async () => {
      withNoLlmEnv();
      const passage = await knownPassage("lunyu-1-1");
      const sensitive = "phone-15500001111-email-secret@example.com-unique";
      const annotation = await createAnnotation({
        query: sensitive,
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
      });
      assert.ok(annotation.agentTrace);
      assert.deepEqual(publicTraceKeys(annotation.agentTrace), [
        "branchLabel",
        "growthSummary",
        "relationTheme",
        "workAgentId",
      ]);
      assert.ok(!resultJson(annotation.agentTrace).includes(sensitive));
      return "Public agentTrace exposes only four safe fields.";
    },
  },
  H03: {
    run: () => {
      const snapshot = extractUserStateSnapshot({
        utterance: "我想起小时候和父母在某次很长家庭争执里说过的具体话……",
        createdAt: fixedCreatedAt,
      });
      assert.ok(snapshot.memoryAnchors.length > 0);
      for (const anchor of snapshot.memoryAnchors) {
        assert.ok(["family", "friendship", "hometown", "school", "past_experience"].includes(anchor.label));
        assert.equal(typeof anchor.confidence, "number");
        assert.equal(anchor.source, "query");
      }
      assert.ok(!resultJson(snapshot.memoryAnchors).includes("小时候"));
      assert.ok(!resultJson(snapshot.memoryAnchors).includes("具体话"));
      return "Memory anchors remain short labels.";
    },
  },
  H04: {
    run: () => {
      const sensitive = "unique-sensitive-cache-string";
      const key = buildAnnotationCacheKey({
        query: sensitive,
        passageId: "lunyu-1-1",
        passageText: `${sensitive} passage`,
        style: "modern",
        mode: "fast",
        growthContextHash: "growth-hash",
      });
      assert.ok(!key.includes(sensitive), `Cache key leaked raw text: ${key}`);
      assert.ok(!key.includes("memoryAnchors"));
      assert.ok(!key.includes("personaHints"));
      return "Cache key excludes raw query/passageText.";
    },
  },
  H05: {
    run: () => {
      resetRuntime();
      process.env.NODE_ENV = "development";
      const logs: string[] = [];
      const originalInfo = console.info;
      console.info = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
      try {
        recordAnnotationTelemetry({
          mode: "fast",
          provider: "deterministic",
          elapsedMs: 12,
          cacheHit: false,
          fallbackHit: true,
          query: "unique-sensitive-telemetry",
          passageId: "lunyu-1-1",
          explorationDepth: 1,
        });
      } finally {
        console.info = originalInfo;
      }
      const events = getAnnotationTelemetryEvents();
      assert.equal(events.length, 1);
      assert.ok(events[0]?.queryHash);
      assert.ok(!resultJson(events).includes("unique-sensitive-telemetry"));
      assert.ok(!logs.join("\n").includes("unique-sensitive-telemetry"));
      return "Telemetry stores/logs queryHash only.";
    },
  },
  H06: {
    run: () => {
      resetRuntime();
      process.env.LLM_MODEL_PRIMARY = "model-primary";
      process.env.LLM_BASE_URL_PRIMARY = "https://provider.example/v1";
      process.env.LLM_API_KEY_PRIMARY = "sk-secret-primary-unique";
      process.env.LLM_MODEL_SECONDARY = "model-secondary";
      process.env.LLM_BASE_URL_SECONDARY = "https://provider2.example/v1";
      process.env.LLM_API_KEY_SECONDARY = "sk-secret-secondary-unique";
      const status = resolveAnnotationLlmRuntimeStatus();
      const serialized = resultJson(status);
      assert.ok(status.slots.every(slot => slot.apiKeyConfigured));
      assert.ok(!serialized.includes("sk-secret-primary-unique"));
      assert.ok(!serialized.includes("sk-secret-secondary-unique"));
      return "LLM runtime status reports key presence without secret values.";
    },
  },
  H07: {
    run: async () => {
      withNoLlmEnv();
      const originalPut = userStateSessionStore.put.bind(userStateSessionStore);
      userStateSessionStore.put = () => {
        throw new Error("user-state store down");
      };
      try {
        const passage = await knownPassage("lunyu-1-1");
        const annotation = await createAnnotation({
          query: "如何面对压力",
          passageId: passage.id,
          passageText: passage.text,
          style: "modern",
        });
        assert.equal(annotation.passageId, passage.id);
        assert.equal(annotation.agentTrace, undefined);
        assert.ok(annotation.links.length > 0);
        assert.ok(!resultJson(annotation).includes("user-state store down"));
      } finally {
        userStateSessionStore.put = originalPut;
      }
      return "User-state session-store failure does not block annotation.";
    },
  },
  H08: {
    run: async () => {
      withNoLlmEnv();
      const annotation = await createAnnotation({
        query: "如何面对压力",
        passageId: "missing-passage",
        passageText: "外部文本",
        style: "modern",
      });
      assert.equal(annotation.agentTrace, undefined);
      assert.equal(annotation.passageId, "missing-passage");
      assert.ok(annotation.links.length > 0);
      return "Missing work-agent fail-opens annotation.";
    },
  },
  H09: {
    run: async () => {
      withNoLlmEnv();
      const originalAppend = growthService.append.bind(growthService);
      growthService.append = () => {
        throw new Error("growth store down");
      };
      try {
        const passage = await knownPassage("lunyu-1-1");
        const annotation = await createAnnotation({
          query: "如何面对压力",
          passageId: passage.id,
          passageText: passage.text,
          style: "modern",
        });
        assert.equal(annotation.passageId, passage.id);
        assert.equal(annotation.agentTrace, undefined);
        assert.ok(!resultJson(annotation).includes("growth store down"));
      } finally {
        growthService.append = originalAppend;
      }
      return "Growth storage failure is swallowed by annotation agent context.";
    },
  },
  H10: {
    run: async () => {
      resetRuntime();
      process.env.NODE_ENV = "development";
      process.env.LLM_MODEL_PRIMARY = "test-model";
      process.env.LLM_BASE_URL_PRIMARY = "https://provider.example/v1";
      process.env.LLM_API_KEY_PRIMARY = "sk-secret-provider-error";
      const logs: string[] = [];
      const originalInfo = console.info;
      console.info = (...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      };
      globalThis.fetch = async () => new Response("sk-secret-provider-error raw body", { status: 503 });
      try {
        const passage = await knownPassage("lunyu-1-1");
        const annotation = await createAnnotation({
          query: "如何面对压力",
          passageId: passage.id,
          passageText: passage.text,
          style: "modern",
        });
        const events = getAnnotationTelemetryEvents();
        assert.ok(annotation.sixToMe.length > 0);
        assert.equal(events.at(-1)?.fallbackReason, "provider_error");
        assert.ok(!resultJson(annotation).includes("sk-secret-provider-error"));
        assert.ok(!resultJson(events).includes("sk-secret-provider-error"));
        assert.ok(!logs.join("\n").includes("sk-secret-provider-error"));
      } finally {
        console.info = originalInfo;
      }
      return "Provider error fail-opens without leaking key in response/telemetry/logs.";
    },
  },
  I01: {
    run: async () => {
      withNoLlmEnv();
      const results = await searchPassages({ query: "如何面对压力", topK: 1 });
      assert.ok(results[0]);
      const rootPassage = await knownPassage(results[0]!.id);
      const root = await createAnnotation({
        query: "如何面对压力",
        passageId: rootPassage.id,
        passageText: rootPassage.text,
        style: "modern",
      });
      assert.ok(root.links[0]);
      const link = root.links[0]!;
      const child = await createAnnotation({
        query: "如何面对压力",
        passageId: link.passageId,
        passageText: link.passageText,
        style: "modern",
        visitedPassageIds: [root.passageId],
      });
      assert.equal(child.passageId, link.passageId);
      assert.equal(root.passageId, rootPassage.id);
      assert.ok(root.sixToMe.length > 0);
      assert.ok(child.sixToMe.length > 0);
      return "API-level search -> annotate -> link -> back snapshot flow completed; focused RTL Jest covers browser stack controls.";
    },
  },
  I02: {
    run: async () => {
      withNoLlmEnv();
      const response = await searchPost(createRequest({ query: "朋友相处要诚信" }));
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.ok(Array.isArray(payload.data));
      assert.ok(!resultJson(payload).includes("agentTrace"));
      assert.ok(!resultJson(payload).includes("workAgentId"));
      return "Search response does not expose A2A fields.";
    },
  },
  I03: {
    run: async () => {
      withNoLlmEnv();
      const results = await searchPassages({ query: "我很焦虑，想把心安顿下来", topK: 1 });
      assert.ok(results[0]);
      const passage = await knownPassage(results[0]!.id);
      const annotation = await createAnnotation({
        query: "我很焦虑，想把心安顿下来",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
      });
      assert.equal(annotation.passageId, passage.id);
      assert.ok(annotation.agentTrace?.workAgentId.includes(passage.id));
      assert.ok(annotation.sixToMe.length > 0);
      return "Root annotation trace binds to selected search result.";
    },
  },
  I04: {
    run: async () => {
      withNoLlmEnv();
      const rootPassage = await knownPassage("lunyu-1-1");
      const root = await createAnnotation({
        query: "如何面对压力",
        passageId: rootPassage.id,
        passageText: rootPassage.text,
        style: "modern",
      });
      assert.ok(root.links[0]);
      const link = root.links[0]!;
      const child = await createAnnotation({
        query: "如何面对压力",
        passageId: link.passageId,
        passageText: link.passageText,
        style: "modern",
        visitedPassageIds: [root.passageId],
      });
      assert.equal(child.passageId, link.passageId);
      if (child.agentTrace) {
        assert.ok(child.agentTrace.workAgentId.includes(link.passageId));
      }
      return "Link exploration annotation binds to link passage at API level.";
    },
  },
  I05: {
    run: () => "Covered by focused RTL Jest: home-page.search.test.tsx verifies returning to previous layer without extra fetch.",
  },
  I06: {
    run: () => "Covered by focused RTL Jest: home-page.search.test.tsx verifies selecting a new result clears the exploration stack.",
  },
  I07: {
    run: () => {
      const html = renderAnnotationPanel({
        passageId: "leaf",
        passageText: "叶子节点",
        sixToMe: "经典回应",
        meToSix: "当代反观",
        links: [],
        agentTrace: {
          workAgentId: "work:leaf",
          relationTheme: "主题",
          branchLabel: "枝条",
          growthSummary: "摘要",
        },
      });
      assert.ok(html.includes("此处暂止"));
      assert.ok(html.includes("关系枝条"));
      assert.ok(!html.includes("进入下一句"));
      return "Leaf UI state coexists with trace.";
    },
  },
  I08: {
    run: async () => {
      withNoLlmEnv();
      const annotation = await createAnnotation({
        query: "如何面对压力",
        passageId: "external-stale",
        passageText: "外部文本",
        style: "modern",
      });
      assert.equal(annotation.passageId, "external-stale");
      assert.equal(annotation.agentTrace, undefined);
      const html = renderAnnotationPanel(annotation);
      assert.ok(html.includes("此处暂未生枝。"));
      return "A2A fail-open keeps annotation and empty trace UI usable.";
    },
  },
  I09: {
    run: async () => {
      withNoLlmEnv();
      const sensitive = "我想起家里的事，很焦虑，不知道怎么办";
      const passage = await knownPassage("lunyu-1-1");
      const annotation = await createAnnotation({
        query: sensitive,
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
      });
      assert.ok(annotation.agentTrace);
      assert.ok(!resultJson(annotation.agentTrace).includes(sensitive));
      assert.ok(!renderAnnotationPanel(annotation).includes("traceId"));
      assert.ok(!renderAnnotationPanel(annotation).includes("memoryAnchors"));
      return "AgentTrace privacy boundary holds at API/UI trace layer.";
    },
  },
  I10: {
    run: () => "Covered by focused RTL Jest: home-page.search.test.tsx verifies pending concurrent root annotation clicks are prevented; request-id/abort guards are present in src/app/page.tsx.",
  },
  J01: {
    run: async () => {
      const apiFiles = await fs.readdir(path.join(repoRoot, "src/app/api"), { withFileTypes: true });
      const routeNames = apiFiles.filter(entry => entry.isDirectory()).map(entry => entry.name);
      assert.ok(!routeNames.includes("a2a"));
      assert.ok(!routeNames.includes("agents"));
      assert.ok(!routeNames.includes("work-agents"));
      return `Public API route dirs: ${routeNames.join(", ")}.`;
    },
  },
  J02: {
    run: async () => {
      withNoLlmEnv();
      const injected = await searchPost(
        createRequest({
          query: "朋友相处要诚信",
          agentMessage: {},
          workAgentId: "work:1",
          allowedActs: ["grow"],
          privacyMode: "saved",
          remoteAgentUrl: "https://example.com",
        }),
      );
      assert.equal(injected.status, 400);
      const normal = await searchPost(createRequest({ query: "朋友相处要诚信" }));
      const payload = await normal.json();
      assert.equal(normal.status, 200);
      assert.ok(!resultJson(payload).includes("agentTrace"));
      return "Search strict schema rejects injected A2A fields.";
    },
  },
  J03: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState(),
          workAgent: makeWorkAgent({
            id: "work:painting:art-1:abc",
            kind: "painting",
            title: "山水",
            source: "painting",
            canonicalRef: "painting:art-1",
            contentRef: { artworkId: "art-1" },
          }),
          createdAt: fixedCreatedAt,
        }),
      );
      const serialized = resultJson({
        growthEvent: result.growthEvent,
        growthMessage: result.growthMessage,
      });
      assert.ok(result.growthEvent.workAgentId.includes("work:painting"));
      assert.ok(!serialized.includes("artworkId"));
      assert.ok(!serialized.includes("canonicalRef"));
      return "Painting manifest can route and route output excludes manifest internals.";
    },
  },
  J04: {
    run: () => {
      const artifactInternals = {
        version: "artifact-v1",
        signature: "sig-secret",
        provenance: "local-build",
        rawPrompt: "private prompt text",
        localFilePath: "/Users/private/artifact.json",
      };
      const validArtifact = makeWorkAgent({
        id: "work:artifact:future-1",
        kind: "artifact",
        title: "生成物",
        source: "artifact",
        canonicalRef: "artifact:future-1",
        contentRef: {},
      }) as WorkAgentManifest & Record<string, unknown>;
      Object.assign(validArtifact, artifactInternals);
      const enabled = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState(),
          workAgent: validArtifact,
          createdAt: fixedCreatedAt,
        }),
      );
      const publicSerialized = resultJson({
        growthEvent: enabled.growthEvent,
        growthMessage: enabled.growthMessage,
      });
      for (const privateValue of Object.values(artifactInternals)) {
        assert.ok(!publicSerialized.includes(privateValue));
      }

      const invalidArtifact = {
        ...validArtifact,
        growthPolicy: {
          persist: "ephemeral_only",
          canGrow: true,
          allowedActs: ["encounter", "interpret", "link"],
          maxSummaryLength: 120,
        },
      } satisfies WorkAgentManifest & Record<string, unknown>;
      const disabled = routeA2AEncounter({
        userState: makeUserState(),
        workAgent: invalidArtifact,
        createdAt: fixedCreatedAt,
      });
      assert.deepEqual(disabled, { enabled: false, reason: "work_agent_disabled" });
      return "Artifact manifest boundary simulated at router level; private version/signature/provenance/prompt/path fields do not leak, and unauthorized growth fail-opens.";
    },
  },
  J05: {
    run: () => {
      const result = routeA2AEncounter({
        userState: makeUserState(),
        workAgent: makeWorkAgent({
          growthPolicy: {
            persist: "ephemeral_only",
            canGrow: true,
            allowedActs: ["encounter", "interpret", "link"],
            maxSummaryLength: 120,
          },
        }),
        createdAt: fixedCreatedAt,
      });
      assert.deepEqual(result, { enabled: false, reason: "work_agent_disabled" });
      return "Missing grow in allowedActs disables route.";
    },
  },
  J06: {
    run: () => {
      assert.equal(isAgentMessageAct("memory_delta"), true);
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({ utterance: "raw-memory-secret" }),
          workAgent: makeWorkAgent(),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.growthEvent.act, "grow");
      assert.ok(!resultJson(result.growthEvent).includes("raw-memory-secret"));
      return "memory_delta is recognized as protocol act but router only grows.";
    },
  },
  J07: {
    run: () => {
      const result = requireEnabled(
        routeA2AEncounter({
          userState: makeUserState({
            privacyMode: "saved",
            utterance: "saved-privacy-raw-secret",
          }),
          workAgent: makeWorkAgent({
            growthPolicy: {
              persist: "ephemeral_only",
              canGrow: true,
              allowedActs: ["encounter", "grow"],
              maxSummaryLength: 120,
            },
          }),
          createdAt: fixedCreatedAt,
        }),
      );
      assert.equal(result.encounterMessage.payload.privacyMode, "saved");
      assert.ok(!resultJson(result.growthEvent).includes("saved-privacy-raw-secret"));
      return "Saved privacyMode does not persist raw utterance into growth event.";
    },
  },
  J08: {
    run: () => {
      const original = globalThis.fetch;
      globalThis.fetch = (() => {
        throw new Error("Router should not call fetch.");
      }) as typeof fetch;
      try {
        for (const kind of ["classic_passage", "painting", "artifact"] as const) {
          const workAgent = makeWorkAgent({
            id: `work:${kind}:1`,
            kind,
            contentRef: kind === "painting" ? { artworkId: "art-1" } : { passageId: "p1" },
          });
          const first = routeA2AEncounter({
            userState: makeUserState(),
            workAgent,
            createdAt: fixedCreatedAt,
          });
          const second = routeA2AEncounter({
            userState: makeUserState(),
            workAgent,
            createdAt: fixedCreatedAt,
          });
          assert.deepEqual(first, second);
          assert.equal(first.enabled, true);
          if (first.enabled) {
            assert.ok(first.growthEvent.summary.length <= workAgent.growthPolicy.maxSummaryLength + 2);
          }
        }
      } finally {
        globalThis.fetch = original;
      }
      return "Router is deterministic and does not call network.";
    },
  },
  J09: {
    run: async () => {
      withNoLlmEnv();
      const queries = JSON.parse(
        await fs.readFile(path.join(repoRoot, "tests/fixtures/search-golden-queries.json"), "utf8"),
      ) as Array<{ query: string }>;
      const sample = queries.slice(0, 3);
      const before = await Promise.all(sample.map(item => searchPassages({ query: item.query, topK: 3 })));
      const passage = await knownPassage("lunyu-1-1");
      await createAnnotation({
        query: "如何面对压力",
        passageId: passage.id,
        passageText: passage.text,
        style: "modern",
      });
      const after = await Promise.all(sample.map(item => searchPassages({ query: item.query, topK: 3 })));
      assert.deepEqual(
        after.map(results => results.map(item => item.id)),
        before.map(results => results.map(item => item.id)),
      );
      assert.ok(!resultJson(after).includes("agentTrace"));
      assert.ok(!resultJson(after).includes("workAgentId"));
      return "Sample golden search rankings unchanged after annotation/A2A.";
    },
  },
  J10: {
    run: async () => {
      withNoLlmEnv();
      const files = ["data/corpus-manifest.json", "data/search-graph.json"];
      const before = Object.fromEntries(
        await Promise.all(
          files.map(async file => [file, stableHash(await fs.readFile(path.join(repoRoot, file), "utf8"))]),
        ),
      );
      routeA2AEncounter({
        userState: makeUserState(),
        workAgent: makeWorkAgent({ id: "work:painting:future" }),
        createdAt: fixedCreatedAt,
      });
      await createAnnotation({
        query: "如何面对压力",
        passageId: "unknown-work-agent",
        passageText: "外部文本",
        style: "modern",
      });
      const after = Object.fromEntries(
        await Promise.all(
          files.map(async file => [file, stableHash(await fs.readFile(path.join(repoRoot, file), "utf8"))]),
        ),
      );
      assert.deepEqual(after, before);
      return "Corpus manifest and search graph artifacts unchanged.";
    },
  },
};

function summarize(results: CaseResult[]) {
  const counts: Record<CaseStatus, number> = {
    passed: 0,
    failed: 0,
    partial: 0,
    skipped: 0,
  };

  for (const result of results) {
    counts[result.status] += 1;
  }

  return counts;
}

function markdownReport(results: CaseResult[]): string {
  const counts = summarize(results);
  const lines = [
    "# A2A Agentic Framework 100 Examples QA Run",
    "",
    `Date: ${new Date().toISOString()}`,
    `Source: \`${path.relative(repoRoot, docPath)}\``,
    `Numbered QA JSON: \`${path.relative(repoRoot, jsonOutputPath)}\``,
    `Focused Jest JSON: \`${path.relative(repoRoot, jestOutputPath)}\``,
    "",
    "## Summary",
    "",
    `- Total: ${results.length}`,
    `- Passed: ${counts.passed}`,
    `- Failed: ${counts.failed}`,
    `- Partial: ${counts.partial}`,
    `- Skipped: ${counts.skipped}`,
    "",
    "## Notes",
    "",
    "- Browser-level E2E was not run because project instructions say not to use Playwright unless specified.",
    "- `partial` means a narrower automated assertion ran, but the full scenario needs Jest module mocking, browser state, or future adapter code.",
    "- The graphify code graph was regenerated before this run because `graphify-out/graph.json` was missing.",
    "",
    "## Failed Or Partial",
    "",
    ...results
      .filter(result => result.status === "failed" || result.status === "partial")
      .map(result => {
        const firstEvidence = result.evidence[0] ? ` ${result.evidence[0]}` : "";
        const error = result.error ? ` Error: ${result.error}` : "";
        return `- ${result.id} ${result.title}: **${result.status}**.${firstEvidence}${error}`;
      }),
    "",
    "## Full Matrix",
    "",
    "| ID | Status | Evidence |",
    "| --- | --- | --- |",
    ...results.map(result => {
      const evidence = [...result.evidence, result.error ? `Error: ${result.error}` : ""]
        .filter(Boolean)
        .join(" ")
        .replace(/\|/gu, "\\|");
      return `| ${result.id} | ${result.status} | ${evidence} |`;
    }),
    "",
  ];

  return `${lines.join("\n")}`;
}

async function runCase(docCase: DocCase): Promise<CaseResult> {
  const startedAt = Date.now();
  const runner = runners[docCase.id];

  if (!runner) {
    return {
      ...docCase,
      status: "skipped",
      evidence: ["No runner mapped for this doc example."],
      durationMs: Date.now() - startedAt,
    };
  }

  if (!runner.run) {
    return {
      ...docCase,
      status: runner.status ?? "skipped",
      evidence: [runner.reason ?? "No executable runner."],
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    resetRuntime();
    const value = await runner.run();
    const evidence = Array.isArray(value) ? value : [value];

    return {
      ...docCase,
      status: runner.status ?? "passed",
      evidence: runner.reason ? [runner.reason, ...evidence] : evidence,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...docCase,
      status: "failed",
      evidence: runner.reason ? [runner.reason] : [],
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    resetRuntime();
  }
}

async function main(): Promise<void> {
  const markdown = await fs.readFile(docPath, "utf8");
  const docCases = extractDocCases(markdown);
  assert.equal(docCases.length, 100, `Expected 100 examples, found ${docCases.length}.`);

  const results: CaseResult[] = [];

  for (const docCase of docCases) {
    results.push(await runCase(docCase));
  }

  const counts = summarize(results);
  const payload = {
    source: path.relative(repoRoot, docPath),
    generatedAt: new Date().toISOString(),
    summary: counts,
    results,
  };

  await fs.writeFile(jsonOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownOutputPath, markdownReport(results), "utf8");

  console.log(
    `A2A QA examples: ${results.length} total, ${counts.passed} passed, ${counts.failed} failed, ${counts.partial} partial, ${counts.skipped} skipped.`,
  );
  console.log(`Saved JSON: ${path.relative(repoRoot, jsonOutputPath)}`);
  console.log(`Saved report: ${path.relative(repoRoot, markdownOutputPath)}`);
}

main().catch(async error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await fs.writeFile(
    markdownOutputPath,
    `# A2A Agentic Framework 100 Examples QA Run\n\nFatal error before results were produced:\n\n\`\`\`\n${message}\n\`\`\`\n`,
    "utf8",
  );
  console.error(message);
  process.exitCode = 1;
});
