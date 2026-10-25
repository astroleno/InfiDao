import { z } from "zod";

export const FLOW_VERSION = "flow-v1";
export const FLOW_PROMPT_VERSION = "connected-text-v14-reading-depth";
export const flowRelationTypeSchema = z.enum(['related', 'similar', 'contrast', 'elaboration', 'application', 'cause']);
export type FlowRelationType = z.infer<typeof flowRelationTypeSchema>;
export const flowKnowledgeSchema = z.object({
  sense: z.string().trim().min(2).max(100).optional(),
  topics: z.array(z.string().trim().min(1).max(20)).max(4),
  relation: z.object({ type: flowRelationTypeSchema, description: z.string().trim().min(2).max(160) }),
});
export type FlowKnowledge = z.infer<typeof flowKnowledgeSchema>;
export const flowSelectionSchema = z.object({
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  textHash: z.string().min(1).max(128), corpusVersion: z.string().min(1).max(100),
  surface: z.enum(['meaning', 'reflection']).optional(),
  surfaceText: z.string().min(1).max(360).optional(),
}).strict().refine(selection => Boolean(selection.surface) === (selection.surfaceText !== undefined), 'Missing explanation identity');
export type FlowSelection = z.infer<typeof flowSelectionSchema>;
export const flowRestartSchema = z.object({
  sourceId: z.string().min(1).max(100), corpusVersion: z.string().min(1).max(100), textHash: z.string().min(1).max(128),
  quoteStart: z.number().int().nonnegative(), quoteEnd: z.number().int().positive(),
}).strict();
export const flowRequestSchema = z.object({
  op: z.enum(["open", "branch", "next"]),
  requestId: z.string().min(1).max(80),
  seed: z.string().max(120).optional(),
  chainId: z.string().max(80).optional(),
  fromFrameId: z.string().max(80).optional(),
  anchorId: z.string().max(80).optional(),
  selection: flowSelectionSchema.optional(),
  cursor: z.string().max(80).nullable().optional(),
  restartFrom: flowRestartSchema.optional(),
  prefetch: z.literal(true).optional(),
  graph: z.literal(true).optional(),
}).strict().superRefine((request, context) => {
  const invalid = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (request.prefetch && request.op !== 'next') invalid('Only continuations can be prepared');
  if (request.restartFrom) {
    if (request.op !== 'open' || request.chainId !== undefined || request.fromFrameId !== undefined || request.anchorId !== undefined || request.cursor !== undefined) invalid('restartFrom requires an independent open request');
    if (request.restartFrom.quoteEnd <= request.restartFrom.quoteStart) invalid('Empty quote range');
    if (request.selection && (request.selection.textHash !== request.restartFrom.textHash || request.selection.corpusVersion !== request.restartFrom.corpusVersion)) invalid('Selection identity differs from restart source');
    if (request.selection?.surface) invalid('Restart selections must refer to canonical source text');
  } else if (request.op === 'open' && request.selection) invalid('Open selection requires restartFrom');
  if (request.selection && request.selection.end <= request.selection.start) invalid('Empty selection range');
  if (request.op === 'branch' && (!request.chainId || !request.fromFrameId || (!request.anchorId && !request.selection))) invalid('Missing branch identity');
  if (request.op === 'next' && (!request.chainId || !request.cursor)) invalid('Missing continuation cursor');
});
export type FlowRequest = z.infer<typeof flowRequestSchema>;

export interface FlowReadingContext {
  word: string;
  surface: 'quote' | 'meaning' | 'reflection';
  source: string;
  quote: string;
  before: string;
  after: string;
}

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
  topics?: string[];
  relationType?: FlowRelationType;
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
  lexicalBreaks?: number[];
  textBreaks?: { meaning: number[]; reflection: number[] };
  meaning: string;
  reflection: string;
  reflectionSpans: Array<{ text: string; anchorId?: string }>;
  anchors: FlowAnchor[];
  provenance: "model" | "curated";
  ready: boolean;
  settled?: { meaning: boolean; reflection: boolean };
  knowledge?: FlowKnowledge;
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
  graph?: true;
}
export type FlowEvent =
  | { type: "head" | "progress" | "frame"; requestId: string; chain: FlowChain }
  | { type: "done"; requestId: string; chain: FlowChain }
  | { type: "error"; requestId: string; code: string; message: string };

export class FlowError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

const targetSchema = z.object({ sourceId: z.string().max(100), quote: z.string().min(2).max(80), meaning: z.string().min(2).max(100) });
export const generatedBatchSchema = z.object({
  frames: z.array(z.object({
    sourceId: z.string().max(100), quote: z.string().min(2).max(80),
    meaning: z.union([z.literal(''), z.string().min(2).max(100)]), reflection: z.string().min(2).max(360),
    relevance: z.number().min(0).max(1),
    knowledge: flowKnowledgeSchema.optional(),
    anchors: z.array(z.object({
      label: z.string().min(1).max(12), sense: z.string().min(2).max(100),
      surface: z.enum(["quote", "meaning", "reflection"]).optional(),
      direction: z.string().min(2).max(80), terms: z.array(z.string().min(1).max(20)).min(1).max(6),
      topics: z.array(z.string().trim().min(1).max(20)).max(4).optional(),
      relationType: flowRelationTypeSchema.optional(),
      target: targetSchema,
    })).max(3),
  })).max(3),
});
export type GeneratedBatch = z.infer<typeof generatedBatchSchema>;
