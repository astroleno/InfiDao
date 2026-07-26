export type UserStatePrivacyMode = "ephemeral" | "saved";

export type InferredSignalSource = "query" | "context" | "passage" | "rule";

export interface InferredSignal {
  label: string;
  confidence: number;
  source: InferredSignalSource;
}

export interface MemoryAnchor {
  label: string;
  confidence: number;
  source: InferredSignalSource;
}

export interface UserStateSnapshot {
  id: string;
  sessionId: string;
  utterance: string;
  emotion: InferredSignal[];
  intent: InferredSignal[];
  memoryAnchors: MemoryAnchor[];
  personaHints: InferredSignal[];
  privacyMode: UserStatePrivacyMode;
  createdAt: string;
}
