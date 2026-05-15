import { DEFAULT_SEARCH_THRESHOLD, DEFAULT_SEARCH_TOP_K } from "@/types";
import type { SearchGraphDisabledReason } from "@/lib/search/graph/store";
import type {
  SearchGraphConfidence,
  SearchGraphNode,
  SearchGraphRelation,
} from "@/lib/search/graph/types";
import { encodeSearchQuery } from "@/lib/search/query-encoder";
import { fuseSearchCandidates, type FusedSearchCandidate } from "@/lib/search/fusion";
import { loadSearchGraphServiceForIndex } from "@/lib/search/graph/service";
import { loadSearchIndex } from "@/lib/search/index-store";
import { rankLexicalCandidates } from "@/lib/search/lexical";
import { rankPassagesByVector } from "@/lib/search/json";

export interface SearchDiagnosticsRequest {
  query: string;
  topK?: number;
  threshold?: number;
  graphPath?: string;
}

export interface SearchGraphCandidateSignal {
  nodeId: string;
  label: string;
  type: SearchGraphNode["type"];
  relation: SearchGraphRelation;
  confidence: SearchGraphConfidence;
  weight: number;
  direction: "outgoing" | "incoming";
  conceptGroup?: string;
  passageId?: string;
}

export interface SearchDiagnosticCandidate {
  id: string;
  score: number;
  vectorScore: number;
  lexicalScore: number;
  rank: number;
  graph: {
    neighborCount: number;
    extractedEdgeCount: number;
    inferredEdgeCount: number;
    conceptGroups: string[];
    adjacentPassageIds: string[];
    signals: SearchGraphCandidateSignal[];
  };
}

export interface SearchDiagnosticsReport {
  query: string;
  topK: number;
  threshold: number;
  results: SearchDiagnosticCandidate[];
  graph: {
    enabled: boolean;
    reason?: SearchGraphDisabledReason;
  };
  diversity: {
    uniqueConceptGroups: string[];
    repeatedConceptGroups: Array<{
      conceptGroup: string;
      count: number;
    }>;
  };
}

function toCandidateSignal(neighbor: {
  node: SearchGraphNode;
  edge: {
    relation: SearchGraphRelation;
    confidence: SearchGraphConfidence;
    weight: number;
  };
  direction: "outgoing" | "incoming";
}): SearchGraphCandidateSignal {
  return {
    nodeId: neighbor.node.id,
    label: neighbor.node.label,
    type: neighbor.node.type,
    relation: neighbor.edge.relation,
    confidence: neighbor.edge.confidence,
    weight: neighbor.edge.weight,
    direction: neighbor.direction,
    ...(neighbor.node.type === "concept" ? { conceptGroup: neighbor.node.conceptGroup } : {}),
    ...(neighbor.node.type === "passage" ? { passageId: neighbor.node.passageId } : {}),
  };
}

function summarizeCandidateGraph(
  candidate: FusedSearchCandidate,
  graphService: Awaited<ReturnType<typeof loadSearchGraphServiceForIndex>>,
): SearchDiagnosticCandidate["graph"] {
  const neighbors = graphService.getPassageNeighbors(candidate.id);
  const signals = neighbors.map(toCandidateSignal);
  const conceptGroups = Array.from(
    new Set(
      signals
        .map(signal => signal.conceptGroup)
        .filter((conceptGroup): conceptGroup is string => conceptGroup !== undefined),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const adjacentPassageIds = signals
    .filter(signal => signal.relation === "adjacent_to" && signal.passageId !== undefined)
    .map(signal => signal.passageId as string);

  return {
    neighborCount: neighbors.length,
    extractedEdgeCount: signals.filter(signal => signal.confidence === "EXTRACTED").length,
    inferredEdgeCount: signals.filter(signal => signal.confidence === "INFERRED").length,
    conceptGroups,
    adjacentPassageIds,
    signals,
  };
}

function buildDiversitySummary(
  candidates: SearchDiagnosticCandidate[],
): SearchDiagnosticsReport["diversity"] {
  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    for (const conceptGroup of candidate.graph.conceptGroups) {
      counts.set(conceptGroup, (counts.get(conceptGroup) ?? 0) + 1);
    }
  }

  const uniqueConceptGroups = [...counts.keys()].sort((left, right) => left.localeCompare(right));
  const repeatedConceptGroups = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([conceptGroup, count]) => ({ conceptGroup, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.conceptGroup.localeCompare(right.conceptGroup),
    );

  return {
    uniqueConceptGroups,
    repeatedConceptGroups,
  };
}

export async function diagnoseSearchPassages({
  query,
  topK = DEFAULT_SEARCH_TOP_K,
  threshold = DEFAULT_SEARCH_THRESHOLD,
  graphPath,
}: SearchDiagnosticsRequest): Promise<SearchDiagnosticsReport> {
  const index = await loadSearchIndex();
  const candidateLimit = Math.max(topK * 4, 20);
  const queryVector = await encodeSearchQuery({
    query,
    model: index.model,
    dimension: index.dimension,
  });
  const vectorResults = rankPassagesByVector({
    corpus: index.corpus,
    embeddingMap: index.embeddingMap,
    queryVector,
    topK: candidateLimit,
    threshold: Math.max(0, threshold * 0.7),
  });
  const lexicalResults = rankLexicalCandidates(index.corpus, query, candidateLimit);
  const fusedCandidates = fuseSearchCandidates(vectorResults, lexicalResults, topK, threshold);
  const graphService = await loadSearchGraphServiceForIndex(index, {
    required: false,
    ...(graphPath ? { graphPath } : {}),
  });
  const results = fusedCandidates.map((candidate, index) => ({
    id: candidate.id,
    score: candidate.score,
    vectorScore: candidate.vectorScore,
    lexicalScore: candidate.lexicalScore,
    rank: index + 1,
    graph: summarizeCandidateGraph(candidate, graphService),
  }));

  return {
    query,
    topK,
    threshold,
    results,
    graph: {
      enabled: graphService.enabled,
      ...(graphService.reason ? { reason: graphService.reason } : {}),
    },
    diversity: buildDiversitySummary(results),
  };
}
