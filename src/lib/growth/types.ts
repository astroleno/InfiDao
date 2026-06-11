import type { AgentMessageAct } from "@/lib/a2a/types";

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

export interface DisabledGrowthResult {
  enabled: false;
  reason: string;
}

export interface EnabledGrowthResult {
  enabled: true;
  event: GrowthEvent;
}

export type GrowthResult = DisabledGrowthResult | EnabledGrowthResult;
