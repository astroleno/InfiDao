import { z } from "zod";

export const SEARCH_GRAPH_SCHEMA_VERSION = 1;

export const SEARCH_GRAPH_NODE_TYPES = ["passage", "work", "chapter", "concept"] as const;
export const SEARCH_GRAPH_RELATIONS = [
  "contains",
  "mentions",
  "resonates_with",
  "contrasts_with",
  "adjacent_to",
] as const;
export const SEARCH_GRAPH_CONFIDENCES = ["EXTRACTED", "INFERRED", "AMBIGUOUS"] as const;

export type SearchGraphNodeType = (typeof SEARCH_GRAPH_NODE_TYPES)[number];
export type SearchGraphRelation = (typeof SEARCH_GRAPH_RELATIONS)[number];
export type SearchGraphConfidence = (typeof SEARCH_GRAPH_CONFIDENCES)[number];

export interface SearchGraphProvenance {
  source: string;
  sourceFile: string;
}

const provenanceSchema = z
  .object({
    source: z.string().min(1),
    sourceFile: z.string().min(1),
  })
  .strict();

const baseNodeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    provenance: provenanceSchema,
  })
  .strict();

const passageNodeSchema = baseNodeSchema
  .extend({
    type: z.literal("passage"),
    passageId: z.string().min(1),
    workId: z.string().min(1),
    chapter: z.string().min(1),
    textHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

const workNodeSchema = baseNodeSchema
  .extend({
    type: z.literal("work"),
    workId: z.string().min(1),
  })
  .strict();

const chapterNodeSchema = baseNodeSchema
  .extend({
    type: z.literal("chapter"),
    workId: z.string().min(1),
    chapter: z.string().min(1),
  })
  .strict();

const conceptNodeSchema = baseNodeSchema
  .extend({
    type: z.literal("concept"),
    conceptGroup: z.string().min(1),
  })
  .strict();

export const searchGraphNodeSchema = z.discriminatedUnion("type", [
  passageNodeSchema,
  workNodeSchema,
  chapterNodeSchema,
  conceptNodeSchema,
]);

export const searchGraphEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    relation: z.enum(SEARCH_GRAPH_RELATIONS),
    confidence: z.enum(SEARCH_GRAPH_CONFIDENCES),
    weight: z.number().finite().min(0).max(1),
    sourcePassageId: z.string().min(1).optional(),
    rationale: z.string().min(1),
    provenance: provenanceSchema,
  })
  .strict();

export const searchGraphArtifactSchema = z
  .object({
    schemaVersion: z.literal(SEARCH_GRAPH_SCHEMA_VERSION),
    corpusVersion: z.string().min(1),
    conceptSeedVersion: z.string().min(1),
    artifactSignature: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    generatedAt: z.string().datetime(),
    sourceManifestPath: z.string().min(1),
    nodes: z.array(searchGraphNodeSchema),
    edges: z.array(searchGraphEdgeSchema),
  })
  .strict();

export type SearchGraphNode = z.infer<typeof searchGraphNodeSchema>;
export type SearchGraphPassageNode = Extract<SearchGraphNode, { type: "passage" }>;
export type SearchGraphWorkNode = Extract<SearchGraphNode, { type: "work" }>;
export type SearchGraphChapterNode = Extract<SearchGraphNode, { type: "chapter" }>;
export type SearchGraphConceptNode = Extract<SearchGraphNode, { type: "concept" }>;
export type SearchGraphEdge = z.infer<typeof searchGraphEdgeSchema>;
export type SearchGraphArtifact = z.infer<typeof searchGraphArtifactSchema>;
