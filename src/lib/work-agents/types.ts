import type { AgentMessageAct } from "@/lib/a2a/types";
import type { InferredSignal } from "@/lib/user-state/types";

export type WorkAgentKind = "classic_passage" | "painting" | "artifact";

export interface InterpretiveFrame {
  id: string;
  label: string;
  description: string;
}

export interface GrowthPolicy {
  persist: "ephemeral_only" | "disabled";
  canGrow: boolean;
  allowedActs: AgentMessageAct[];
  maxSummaryLength: number;
}

export interface WorkAgentManifest {
  id: string;
  kind: WorkAgentKind;
  title: string;
  source: string;
  canonicalRef: string;
  contentRef: {
    passageId?: string;
    artworkId?: string;
    chapter?: string;
    section?: number;
    textHash?: string;
  };
  affectField: InferredSignal[];
  interpretiveFrames: InterpretiveFrame[];
  growthPolicy: GrowthPolicy;
}
