import crypto from "node:crypto";
import {
  type AgentMessage,
  type AgentMessageAct,
  isAgentMessageAct,
} from "@/lib/a2a/types";

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function createTraceId(parts: unknown[] = [], createdAt = new Date().toISOString()): string {
  return `trace:${stableHash({ parts, createdAt }).slice(0, 18)}`;
}

export function createAgentMessage<TPayload>(input: {
  traceId?: string;
  from: string;
  to: string;
  act: AgentMessageAct;
  payload: TPayload;
  createdAt?: string;
}): AgentMessage<TPayload> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const traceId =
    input.traceId ??
    createTraceId([input.from, input.to, input.act, input.payload], createdAt);
  const id = `msg:${stableHash({
    traceId,
    from: input.from,
    to: input.to,
    act: input.act,
    payload: input.payload,
    createdAt,
  }).slice(0, 18)}`;

  return {
    id,
    traceId,
    from: input.from,
    to: input.to,
    act: input.act,
    createdAt,
    payload: input.payload,
  };
}

export function isAgentMessage(value: unknown): value is AgentMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.traceId) &&
    isNonEmptyString(candidate.from) &&
    isNonEmptyString(candidate.to) &&
    isAgentMessageAct(candidate.act) &&
    isNonEmptyString(candidate.createdAt) &&
    "payload" in candidate
  );
}

export function assertAgentMessage(value: unknown): asserts value is AgentMessage {
  if (!isAgentMessage(value)) {
    throw new Error("Malformed A2A agent message.");
  }
}
