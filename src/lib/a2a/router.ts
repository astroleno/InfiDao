import crypto from "node:crypto";
import { createAgentMessage, createTraceId, isAgentMessage } from "@/lib/a2a/message";
import type { AgentMessage, EncounterPayload, GrowPayload } from "@/lib/a2a/types";
import type { GrowthEvent } from "@/lib/growth/types";
import type { UserStateSnapshot } from "@/lib/user-state/types";
import type { WorkAgentManifest } from "@/lib/work-agents/types";

export interface A2AEncounterInput {
  userState: UserStateSnapshot;
  workAgent: WorkAgentManifest;
  createdAt?: string;
}

export interface A2AEncounterEnabledResult {
  enabled: true;
  traceId: string;
  encounterMessage: AgentMessage<EncounterPayload>;
  growthMessage: AgentMessage<GrowPayload>;
  growthEvent: GrowthEvent;
}

export interface A2AEncounterDisabledResult {
  enabled: false;
  reason: string;
}

export type A2AEncounterResult = A2AEncounterEnabledResult | A2AEncounterDisabledResult;

const THEME_LABELS: Record<string, string> = {
  seek_guidance: "寻求指引",
  interpret: "理解其义",
  remember: "记忆回响",
  compare: "对照辨析",
  continue_exploration: "继续探看",
  pressure: "压力中求定",
  uncertainty: "不确定中求明",
  nostalgia: "旧忆回身",
  settling: "安顿此刻",
};

const BRANCH_LABELS: Record<string, string> = {
  seek_guidance: "求取分寸",
  interpret: "照见其义",
  remember: "从记忆生枝",
  compare: "相照成义",
  continue_exploration: "沿义再行",
  pressure: "先稳其心",
  uncertainty: "由疑入明",
  nostalgia: "旧事新读",
  settling: "安顿一念",
};

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function isUsableWorkAgent(workAgent: WorkAgentManifest): boolean {
  return (
    typeof workAgent.id === "string" &&
    workAgent.id.trim().length > 0 &&
    workAgent.growthPolicy.canGrow &&
    workAgent.growthPolicy.allowedActs.includes("grow")
  );
}

function selectPrimaryLabel(userState: UserStateSnapshot): string {
  return (
    userState.intent[0]?.label ??
    userState.emotion[0]?.label ??
    userState.personaHints[0]?.label ??
    "interpret"
  );
}

function buildSignalLabels(userState: UserStateSnapshot): string[] {
  return [
    ...userState.intent.map(signal => signal.label),
    ...userState.emotion.map(signal => signal.label),
    ...userState.memoryAnchors.map(anchor => anchor.label),
    ...userState.personaHints.map(signal => signal.label),
  ].slice(0, 8);
}

function resolveConfidence(userState: UserStateSnapshot, workAgent: WorkAgentManifest): number {
  const userSignals = [
    ...userState.intent,
    ...userState.emotion,
    ...userState.memoryAnchors,
    ...userState.personaHints,
  ];
  const strongestUserSignal = userSignals[0]?.confidence ?? 0.58;
  const strongestWorkSignal = workAgent.affectField[0]?.confidence ?? 0.58;
  return clampConfidence((strongestUserSignal + strongestWorkSignal) / 2);
}

function compactSummary(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return ".".repeat(Math.max(0, maxLength));
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function routeA2AEncounter(input: A2AEncounterInput): A2AEncounterResult {
  const { userState, workAgent } = input;
  const createdAt = input.createdAt ?? new Date().toISOString();

  if (!isUsableWorkAgent(workAgent)) {
    return {
      enabled: false,
      reason: "work_agent_disabled",
    };
  }

  const primaryLabel = selectPrimaryLabel(userState);
  const relationTheme = THEME_LABELS[primaryLabel] ?? "此刻互注";
  const branchLabel = BRANCH_LABELS[primaryLabel] ?? "由问生枝";
  const traceId = createTraceId([userState.id, workAgent.id], createdAt);
  const signalLabels = buildSignalLabels(userState);
  const encounterMessage = createAgentMessage<EncounterPayload>({
    traceId,
    from: userState.id,
    to: workAgent.id,
    act: "encounter",
    createdAt,
    payload: {
      userStateId: userState.id,
      workAgentId: workAgent.id,
      privacyMode: userState.privacyMode,
      signalLabels,
    },
  });

  if (!isAgentMessage(encounterMessage)) {
    return {
      enabled: false,
      reason: "malformed_encounter_message",
    };
  }

  const frame = workAgent.interpretiveFrames[0]?.label ?? "六经注我";
  const summary = compactSummary(
    `系统读到的倾向进入《${workAgent.title}》，在“${frame}”里形成“${branchLabel}”：这段作品不替你下定论，只把当下处境校准成一次可继续阅读的关系。`,
    workAgent.growthPolicy.maxSummaryLength,
  );
  const confidence = resolveConfidence(userState, workAgent);
  const eventId = `growth:${stableHash({
    traceId,
    userStateId: userState.id,
    workAgentId: workAgent.id,
    relationTheme,
    branchLabel,
    createdAt,
  }).slice(0, 18)}`;
  const growthEvent: GrowthEvent = {
    id: eventId,
    traceId,
    userStateId: userState.id,
    workAgentId: workAgent.id,
    act: "grow",
    relationTheme,
    branchLabel,
    summary,
    confidence,
    createdAt,
  };
  const growthMessage = createAgentMessage<GrowPayload>({
    traceId,
    from: workAgent.id,
    to: userState.id,
    act: "grow",
    createdAt,
    payload: {
      eventId,
      relationTheme,
      branchLabel,
      summary,
      confidence,
    },
  });

  if (!isAgentMessage(growthMessage)) {
    return {
      enabled: false,
      reason: "malformed_growth_message",
    };
  }

  return {
    enabled: true,
    traceId,
    encounterMessage,
    growthMessage,
    growthEvent,
  };
}
