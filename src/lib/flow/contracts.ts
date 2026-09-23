import { z } from "zod";

export const FLOW_VERSION = "flow-v1";
export const FLOW_PROMPT_VERSION = "contextual-links-v2";
export const flowRequestSchema = z.object({
  op: z.enum(["open", "branch", "next"]),
  requestId: z.string().min(1).max(80),
  seed: z.string().max(120).optional(),
  chainId: z.string().max(80).optional(),
  fromFrameId: z.string().max(80).optional(),
  anchorId: z.string().max(80).optional(),
  cursor: z.string().max(80).nullable().optional(),
}).strict();
export type FlowRequest = z.infer<typeof flowRequestSchema>;

export interface FlowTarget {
  sourceId: string;
  quote: string;
  meaning: string;
}
export interface FlowAnchor {
  id: string;
  label: string;
  surface?: "quote" | "meaning" | "reflection";
  start?: number;
  end?: number;
  sense: string;
  direction: string;
  terms: string[];
  target: FlowTarget;
}
export interface FlowFrame {
  id: string;
  ordinal: number;
  sourceId: string;
  corpusVersion: string;
  textHash: string;
  quote: string;
  quoteStart: number;
  quoteEnd: number;
  source: string;
  chapterLabel: string;
  fullText: string;
  meaning: string;
  reflection: string;
  reflectionSpans: Array<{ text: string; anchorId?: string }>;
  anchors: FlowAnchor[];
  provenance: "model" | "curated";
  ready: boolean;
}
export interface FlowChain {
  chainId: string;
  version: string;
  seed: string;
  seedOrigin: "user" | "example";
  focus: string;
  parentChainId: string | null;
  entry: { fromFrameId: string; anchorId: string; label: string } | null;
  frames: FlowFrame[];
  cursor: string | null;
  exhausted: boolean;
  kind: "remote";
}
export type FlowEvent =
  | { type: "head" | "frame"; requestId: string; chain: FlowChain }
  | { type: "done"; requestId: string; chain: FlowChain }
  | { type: "error"; requestId: string; code: string; message: string };

export class FlowError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

const targetSchema = z.object({ sourceId: z.string().max(100), quote: z.string().min(2).max(80), meaning: z.string().min(2).max(100) });
export const generatedBatchSchema = z.object({
  frames: z.array(z.object({
    sourceId: z.string().max(100), quote: z.string().min(2).max(80),
    meaning: z.string().min(2).max(100), reflection: z.string().min(2).max(100),
    relevance: z.number().min(0).max(1),
    anchors: z.array(z.object({
      label: z.string().min(1).max(12), sense: z.string().min(2).max(100),
      surface: z.enum(["quote", "meaning", "reflection"]).optional(),
      direction: z.string().min(2).max(80), terms: z.array(z.string().min(1).max(20)).min(1).max(6),
      target: targetSchema,
    })).max(3),
  })).max(3),
});
export type GeneratedBatch = z.infer<typeof generatedBatchSchema>;
