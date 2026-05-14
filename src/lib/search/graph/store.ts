import fs from "node:fs/promises";
import path from "node:path";
import type { PassageRecord } from "@/types";
import type { SearchIndex } from "@/lib/search/index-store";
import {
  type SearchGraphArtifact,
  type SearchGraphEdge,
  type SearchGraphNode,
  type SearchGraphPassageNode,
  searchGraphArtifactSchema,
} from "@/lib/search/graph/types";
import { buildSearchGraphArtifactSignature } from "@/lib/search/graph/signature";

export type SearchGraphErrorCode =
  | "GRAPH_MISSING"
  | "GRAPH_INVALID_JSON"
  | "GRAPH_SCHEMA_INVALID"
  | "GRAPH_SIGNATURE_MISMATCH"
  | "GRAPH_CORPUS_MISMATCH"
  | "GRAPH_DUPLICATE_NODE_ID"
  | "GRAPH_DUPLICATE_EDGE_ID"
  | "GRAPH_DANGLING_EDGE"
  | "GRAPH_ORPHAN_PASSAGE_NODE"
  | "GRAPH_STALE_TEXT_HASH"
  | "GRAPH_ORPHAN_SOURCE_PASSAGE"
  | "GRAPH_POLLUTED";

export type SearchGraphDisabledReason =
  | "missing"
  | "invalid-json"
  | "invalid-schema"
  | "invalid-signature"
  | "corpus-mismatch"
  | "duplicate-node"
  | "duplicate-edge"
  | "dangling-edge"
  | "orphan-passage"
  | "stale-text-hash"
  | "orphan-source-passage"
  | "polluted";

export interface SearchGraphLoadOptions {
  required?: boolean;
  graphPath?: string;
}

export type SearchGraphLoadState =
  | {
      enabled: true;
      artifact: SearchGraphArtifact;
      graphPath: string;
    }
  | {
      enabled: false;
      reason: SearchGraphDisabledReason;
      error: SearchGraphError;
      graphPath: string;
    };

const DEFAULT_GRAPH_PATH = path.join(process.cwd(), "data", "search-graph.json");
const POLLUTED_GRAPH_MARKERS = ["ref/", "_nuxt", "node_modules", "graphify-out"] as const;

const graphCache = new Map<string, Promise<SearchGraphLoadState>>();
const warnedDisabledGraphs = new Set<string>();

export class SearchGraphError extends Error {
  constructor(
    public readonly code: SearchGraphErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "SearchGraphError";
  }
}

function graphErrorToDisabledReason(code: SearchGraphErrorCode): SearchGraphDisabledReason {
  switch (code) {
    case "GRAPH_MISSING":
      return "missing";
    case "GRAPH_INVALID_JSON":
      return "invalid-json";
    case "GRAPH_SCHEMA_INVALID":
      return "invalid-schema";
    case "GRAPH_SIGNATURE_MISMATCH":
      return "invalid-signature";
    case "GRAPH_CORPUS_MISMATCH":
      return "corpus-mismatch";
    case "GRAPH_DUPLICATE_NODE_ID":
      return "duplicate-node";
    case "GRAPH_DUPLICATE_EDGE_ID":
      return "duplicate-edge";
    case "GRAPH_DANGLING_EDGE":
      return "dangling-edge";
    case "GRAPH_ORPHAN_PASSAGE_NODE":
      return "orphan-passage";
    case "GRAPH_STALE_TEXT_HASH":
      return "stale-text-hash";
    case "GRAPH_ORPHAN_SOURCE_PASSAGE":
      return "orphan-source-passage";
    case "GRAPH_POLLUTED":
      return "polluted";
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function resolveGraphPath(graphPath?: string): string {
  return path.resolve(
    process.cwd(),
    graphPath ?? process.env.SEARCH_GRAPH_PATH ?? DEFAULT_GRAPH_PATH,
  );
}

function assertUniqueIds<T extends { id: string }>(
  records: T[],
  code: "GRAPH_DUPLICATE_NODE_ID" | "GRAPH_DUPLICATE_EDGE_ID",
): void {
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      throw new SearchGraphError(code, `Duplicate search graph id: ${record.id}`, {
        id: record.id,
      });
    }

    seen.add(record.id);
  }
}

function includesPollutedMarker(value: string): boolean {
  const normalized = value.replace(/\\/gu, "/");
  return POLLUTED_GRAPH_MARKERS.some(marker => normalized.includes(marker));
}

function assertUnpollutedGraphText(artifact: SearchGraphArtifact): void {
  const values: string[] = [artifact.sourceManifestPath];

  for (const node of artifact.nodes) {
    values.push(node.id, node.label, node.provenance.source, node.provenance.sourceFile);
  }

  for (const edge of artifact.edges) {
    values.push(
      edge.id,
      edge.source,
      edge.target,
      edge.rationale,
      edge.provenance.source,
      edge.provenance.sourceFile,
    );
  }

  const pollutedValue = values.find(includesPollutedMarker);

  if (pollutedValue) {
    throw new SearchGraphError(
      "GRAPH_POLLUTED",
      "Search graph artifact contains code-graph pollution.",
      {
        value: pollutedValue,
      },
    );
  }
}

function getPassageMap(corpus: PassageRecord[]): Map<string, PassageRecord> {
  return new Map(corpus.map(passage => [passage.id, passage]));
}

function assertPassageNode(
  node: SearchGraphPassageNode,
  passageMap: Map<string, PassageRecord>,
): void {
  const passage = passageMap.get(node.passageId);

  if (!passage) {
    throw new SearchGraphError(
      "GRAPH_ORPHAN_PASSAGE_NODE",
      "Search graph passage node has no corpus passage.",
      {
        nodeId: node.id,
        passageId: node.passageId,
      },
    );
  }

  if (node.textHash !== passage.textHash) {
    throw new SearchGraphError(
      "GRAPH_STALE_TEXT_HASH",
      "Search graph passage node textHash is stale.",
      {
        nodeId: node.id,
        passageId: node.passageId,
        expected: passage.textHash,
        actual: node.textHash,
      },
    );
  }
}

function assertEdgeEndpoints(
  edge: SearchGraphEdge,
  nodeIds: Set<string>,
  passageMap: Map<string, PassageRecord>,
): void {
  if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
    throw new SearchGraphError(
      "GRAPH_DANGLING_EDGE",
      "Search graph edge references a missing node.",
      {
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
      },
    );
  }

  if (edge.sourcePassageId && !passageMap.has(edge.sourcePassageId)) {
    throw new SearchGraphError(
      "GRAPH_ORPHAN_SOURCE_PASSAGE",
      "Search graph edge sourcePassageId has no corpus passage.",
      {
        edgeId: edge.id,
        sourcePassageId: edge.sourcePassageId,
      },
    );
  }
}

function assertArtifactSignature(artifact: SearchGraphArtifact): void {
  const expected = buildSearchGraphArtifactSignature(artifact);

  if (artifact.artifactSignature !== expected) {
    throw new SearchGraphError(
      "GRAPH_SIGNATURE_MISMATCH",
      "Search graph artifact signature is invalid.",
      {
        expected,
        actual: artifact.artifactSignature,
      },
    );
  }
}

export function validateSearchGraphArtifactForIndex(
  artifact: SearchGraphArtifact,
  index: SearchIndex,
): SearchGraphArtifact {
  if (artifact.corpusVersion !== index.corpusVersion) {
    throw new SearchGraphError(
      "GRAPH_CORPUS_MISMATCH",
      "Search graph corpusVersion does not match active search index.",
      {
        expected: index.corpusVersion,
        actual: artifact.corpusVersion,
      },
    );
  }

  assertArtifactSignature(artifact);
  assertUniqueIds(artifact.nodes, "GRAPH_DUPLICATE_NODE_ID");
  assertUniqueIds(artifact.edges, "GRAPH_DUPLICATE_EDGE_ID");
  assertUnpollutedGraphText(artifact);

  const nodeIds = new Set<string>(artifact.nodes.map((node: SearchGraphNode) => node.id));
  const passageMap = getPassageMap(index.corpus);

  for (const node of artifact.nodes) {
    if (node.type === "passage") {
      assertPassageNode(node, passageMap);
    }
  }

  for (const edge of artifact.edges) {
    assertEdgeEndpoints(edge, nodeIds, passageMap);
  }

  return artifact;
}

async function readSearchGraphArtifact(graphPath: string): Promise<SearchGraphArtifact> {
  let rawArtifact: string;

  try {
    rawArtifact = await fs.readFile(graphPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new SearchGraphError("GRAPH_MISSING", "Search graph artifact is missing.", {
        graphPath,
      });
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawArtifact) as unknown;
  } catch (error) {
    throw new SearchGraphError(
      "GRAPH_INVALID_JSON",
      "Search graph artifact contains invalid JSON.",
      {
        graphPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }

  const result = searchGraphArtifactSchema.safeParse(parsed);

  if (!result.success) {
    throw new SearchGraphError(
      "GRAPH_SCHEMA_INVALID",
      "Search graph artifact does not match the expected schema.",
      {
        graphPath,
        issues: result.error.issues,
      },
    );
  }

  return result.data;
}

async function loadAndValidateSearchGraph(
  index: SearchIndex,
  graphPath: string,
): Promise<SearchGraphLoadState> {
  const artifact = validateSearchGraphArtifactForIndex(
    await readSearchGraphArtifact(graphPath),
    index,
  );

  return {
    enabled: true,
    artifact,
    graphPath,
  };
}

function warnDisabledGraphOnce(graphPath: string, error: SearchGraphError): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const key = `${graphPath}:${error.code}`;

  if (warnedDisabledGraphs.has(key)) {
    return;
  }

  warnedDisabledGraphs.add(key);
  console.warn(`[search-graph] disabled sidecar (${error.code}): ${error.message}`);
}

export async function loadSearchGraphForIndex(
  index: SearchIndex,
  options: SearchGraphLoadOptions = {},
): Promise<SearchGraphLoadState> {
  const required = options.required ?? false;
  const graphPath = resolveGraphPath(options.graphPath);
  const cacheKey = `${graphPath}:${index.corpusVersion}:${required ? "required" : "optional"}`;

  if (!graphCache.has(cacheKey)) {
    graphCache.set(
      cacheKey,
      loadAndValidateSearchGraph(index, graphPath).catch((error: unknown) => {
        graphCache.delete(cacheKey);

        if (error instanceof SearchGraphError) {
          if (required) {
            throw error;
          }

          warnDisabledGraphOnce(graphPath, error);

          return {
            enabled: false,
            reason: graphErrorToDisabledReason(error.code),
            error,
            graphPath,
          };
        }

        throw error;
      }),
    );
  }

  return graphCache.get(cacheKey) as Promise<SearchGraphLoadState>;
}

export function clearSearchGraphCache(): void {
  graphCache.clear();
  warnedDisabledGraphs.clear();
}
