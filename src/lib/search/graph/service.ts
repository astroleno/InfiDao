import type { AnnotationLink, PassageRecord } from "@/types";
import type { SearchIndex } from "@/lib/search/index-store";
import {
  loadSearchGraphForIndex,
  type SearchGraphDisabledReason,
  type SearchGraphLoadOptions,
  type SearchGraphLoadState,
} from "@/lib/search/graph/store";
import type {
  SearchGraphArtifact,
  SearchGraphConfidence,
  SearchGraphEdge,
  SearchGraphNode,
  SearchGraphRelation,
} from "@/lib/search/graph/types";

export const MAX_GRAPH_LINKS_PER_ANNOTATION = 3;
export const MAX_GRAPH_NEIGHBORS_PER_PASSAGE = 20;
export const MAX_GRAPH_DISPLAY_LABEL_LENGTH = 80;
export const MAX_GRAPH_RELATION_LENGTH = 40;
export const MAX_GRAPH_RATIONALE_LENGTH = 240;
export const MAX_GRAPH_RELATION_HINT_LENGTH = 180;

export interface SearchGraphNeighborOptions {
  relations?: SearchGraphRelation[];
  confidences?: SearchGraphConfidence[];
  maxNeighbors?: number;
}

export interface SearchGraphNeighbor {
  node: SearchGraphNode;
  edge: SearchGraphEdge;
  direction: "outgoing" | "incoming";
}

export interface SearchGraphRelationHint {
  passage: PassageRecord;
  edge: SearchGraphEdge;
  relationHint: string;
}

export interface SearchGraphService {
  enabled: boolean;
  reason?: SearchGraphDisabledReason;
  getPassageNeighbors(
    passageId: string,
    options?: SearchGraphNeighborOptions,
  ): SearchGraphNeighbor[];
  buildRelationHints(
    passageId: string,
    options?: SearchGraphNeighborOptions & { maxLinks?: number },
  ): SearchGraphRelationHint[];
}

interface EdgeWithDirection {
  edge: SearchGraphEdge;
  direction: "outgoing" | "incoming";
}

const RELATION_LABELS: Record<SearchGraphRelation, string> = {
  contains: "篇章包含",
  mentions: "直接触及",
  resonates_with: "相互呼应",
  contrasts_with: "形成对照",
  adjacent_to: "前后相邻",
};

function sanitizeGraphText(value: string, maxLength: number): string {
  const normalized = value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const characters = [...normalized];

  if (characters.length <= maxLength) {
    return normalized;
  }

  return `${characters.slice(0, Math.max(0, maxLength - 3)).join("")}...`;
}

function compareNeighbors(left: SearchGraphNeighbor, right: SearchGraphNeighbor): number {
  if (left.edge.confidence !== right.edge.confidence) {
    return left.edge.confidence === "EXTRACTED" ? -1 : 1;
  }

  if (left.edge.weight !== right.edge.weight) {
    return right.edge.weight - left.edge.weight;
  }

  return left.node.id.localeCompare(right.node.id);
}

function buildDisabledGraphService(
  loadState: Extract<SearchGraphLoadState, { enabled: false }>,
): SearchGraphService {
  return {
    enabled: false,
    reason: loadState.reason,
    getPassageNeighbors: () => [],
    buildRelationHints: () => [],
  };
}

function buildEnabledGraphService(
  index: SearchIndex,
  artifact: SearchGraphArtifact,
): SearchGraphService {
  const nodesById = new Map<string, SearchGraphNode>(artifact.nodes.map(node => [node.id, node]));
  const passageNodeIds = new Map<string, string>();
  const passageMap = new Map<string, PassageRecord>(
    index.corpus.map(passage => [passage.id, passage]),
  );
  const adjacency = new Map<string, EdgeWithDirection[]>();

  for (const node of artifact.nodes) {
    if (node.type === "passage") {
      passageNodeIds.set(node.passageId, node.id);
    }
  }

  for (const edge of artifact.edges) {
    const outgoing = adjacency.get(edge.source) ?? [];
    outgoing.push({ edge, direction: "outgoing" });
    adjacency.set(edge.source, outgoing);

    const incoming = adjacency.get(edge.target) ?? [];
    incoming.push({ edge, direction: "incoming" });
    adjacency.set(edge.target, incoming);
  }

  function getPassageNeighbors(
    passageId: string,
    options: SearchGraphNeighborOptions = {},
  ): SearchGraphNeighbor[] {
    const passageNodeId = passageNodeIds.get(passageId);

    if (!passageNodeId) {
      return [];
    }

    const relationSet = options.relations ? new Set<SearchGraphRelation>(options.relations) : null;
    const confidenceSet = options.confidences
      ? new Set<SearchGraphConfidence>(options.confidences)
      : null;
    const maxNeighbors = Math.min(
      MAX_GRAPH_NEIGHBORS_PER_PASSAGE,
      Math.max(0, options.maxNeighbors ?? MAX_GRAPH_NEIGHBORS_PER_PASSAGE),
    );

    return (adjacency.get(passageNodeId) ?? [])
      .filter(({ edge }) => !relationSet || relationSet.has(edge.relation))
      .filter(({ edge }) => !confidenceSet || confidenceSet.has(edge.confidence))
      .map(({ edge, direction }) => {
        const neighborNodeId = direction === "outgoing" ? edge.target : edge.source;
        const node = nodesById.get(neighborNodeId);

        return node ? { node, edge, direction } : null;
      })
      .filter((neighbor): neighbor is SearchGraphNeighbor => neighbor !== null)
      .sort(compareNeighbors)
      .slice(0, maxNeighbors);
  }

  function buildRelationHints(
    passageId: string,
    options: SearchGraphNeighborOptions & { maxLinks?: number } = {},
  ): SearchGraphRelationHint[] {
    const maxLinks = Math.min(
      MAX_GRAPH_LINKS_PER_ANNOTATION,
      Math.max(0, options.maxLinks ?? MAX_GRAPH_LINKS_PER_ANNOTATION),
    );

    return getPassageNeighbors(passageId, {
      ...options,
      confidences: options.confidences ?? ["EXTRACTED"],
    })
      .filter(neighbor => neighbor.node.type === "passage")
      .map(neighbor => {
        if (neighbor.node.type !== "passage") {
          return null;
        }

        const passage = passageMap.get(neighbor.node.passageId);

        if (!passage) {
          return null;
        }

        const relationLabel = sanitizeGraphText(
          RELATION_LABELS[neighbor.edge.relation],
          MAX_GRAPH_RELATION_LENGTH,
        );
        const targetLabel = sanitizeGraphText(neighbor.node.label, MAX_GRAPH_DISPLAY_LABEL_LENGTH);
        const rationale = sanitizeGraphText(neighbor.edge.rationale, MAX_GRAPH_RATIONALE_LENGTH);
        const relationHint = sanitizeGraphText(
          `${relationLabel}：${targetLabel}。${rationale}`,
          MAX_GRAPH_RELATION_HINT_LENGTH,
        );

        return {
          passage,
          edge: neighbor.edge,
          relationHint,
        };
      })
      .filter((hint): hint is SearchGraphRelationHint => hint !== null)
      .slice(0, maxLinks);
  }

  return {
    enabled: true,
    getPassageNeighbors,
    buildRelationHints,
  };
}

export async function loadSearchGraphServiceForIndex(
  index: SearchIndex,
  options: SearchGraphLoadOptions = {},
): Promise<SearchGraphService> {
  const loadState = await loadSearchGraphForIndex(index, options);

  if (!loadState.enabled) {
    return buildDisabledGraphService(loadState);
  }

  return buildEnabledGraphService(index, loadState.artifact);
}

export function buildAnnotationLinkFromGraphHint(hint: SearchGraphRelationHint): AnnotationLink {
  return {
    passageId: hint.passage.id,
    label: `延伸：${hint.passage.source} ${hint.passage.chapter} 第 ${hint.passage.section} 节`,
    relationHint: hint.relationHint,
    passageText: hint.passage.text,
    source: hint.passage.source,
    chapter: hint.passage.chapter,
    section: hint.passage.section,
  };
}
