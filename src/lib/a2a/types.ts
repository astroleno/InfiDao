export const AGENT_MESSAGE_ACTS = [
  "encounter",
  "interpret",
  "grow",
  "reflect",
  "link",
  "memory_delta",
] as const;

export type AgentMessageAct = (typeof AGENT_MESSAGE_ACTS)[number];

export interface AgentMessage<TPayload = unknown> {
  id: string;
  traceId: string;
  from: string;
  to: string;
  act: AgentMessageAct;
  createdAt: string;
  payload: TPayload;
}

export interface EncounterPayload {
  userStateId: string;
  workAgentId: string;
  privacyMode: "ephemeral" | "saved";
  signalLabels: string[];
}

export interface GrowPayload {
  eventId: string;
  relationTheme: string;
  branchLabel: string;
  summary: string;
  confidence: number;
}

export function isAgentMessageAct(value: unknown): value is AgentMessageAct {
  return (
    typeof value === "string" &&
    AGENT_MESSAGE_ACTS.includes(value as AgentMessageAct)
  );
}
