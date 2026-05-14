import fs from "node:fs/promises";
import path from "node:path";
import type { PassageRecord } from "@/types";
import { loadCorpus } from "@/lib/data/corpus";
import { buildTextHash } from "@/lib/data/hash";
import { loadSearchConceptSeed } from "@/lib/search/concepts/load";
import type { SearchConcept, SearchConceptSeed } from "@/lib/search/concepts/schema";
import {
  SEARCH_GRAPH_SCHEMA_VERSION,
  searchGraphArtifactSchema,
  type SearchGraphArtifact,
  type SearchGraphEdge,
  type SearchGraphNode,
  type SearchGraphProvenance,
} from "@/lib/search/graph/types";
import { attachSearchGraphArtifactSignature } from "@/lib/search/graph/signature";

interface CorpusManifestForGraph {
  version: string;
  files: Array<{
    path: string;
    collection?: string;
  }>;
}

interface GenerateSearchGraphOptions {
  manifestPath?: string;
  conceptSeedPath?: string;
  generatedAt?: string;
}

interface WriteSearchGraphOptions {
  outputPath?: string;
  preserveGeneratedAtForSameSignature?: boolean;
}

const DEFAULT_MANIFEST_PATH = path.join(process.cwd(), "data", "corpus-manifest.json");
const DEFAULT_CONCEPT_SEED_PATH = path.join(process.cwd(), "data", "search-concepts.json");
const DEFAULT_GRAPH_OUTPUT_PATH = path.join(process.cwd(), "data", "search-graph.json");

function isCorpusManifestForGraph(value: unknown): value is CorpusManifestForGraph {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.version === "string" && Array.isArray(candidate.files);
}

function normalizePathForArtifact(filePath: string): string {
  return path.relative(process.cwd(), path.resolve(process.cwd(), filePath)).replace(/\\/gu, "/");
}

async function readCorpusManifest(manifestPath: string): Promise<CorpusManifestForGraph> {
  const rawManifest = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(rawManifest) as unknown;

  if (!isCorpusManifestForGraph(parsed)) {
    throw new Error("Corpus manifest does not match the graph generator shape.");
  }

  return parsed;
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function buildNodeProvenance(source: string, sourceFile: string): SearchGraphProvenance {
  return {
    source,
    sourceFile,
  };
}

function buildChapterId(workId: string, chapter: string): string {
  return `chapter:${workId}:${buildTextHash(`${workId}:${chapter}`).slice(0, 12)}`;
}

function buildPassageLabel(passage: PassageRecord): string {
  return `${passage.source} ${passage.chapter} 第 ${passage.section} 节`;
}

function buildContainsEdge(
  source: string,
  target: string,
  sourceFile: string,
  sourcePassageId?: string,
): SearchGraphEdge {
  return {
    id: `contains:${source}->${target}`,
    source,
    target,
    relation: "contains",
    confidence: "EXTRACTED",
    weight: 1,
    ...(sourcePassageId ? { sourcePassageId } : {}),
    rationale: "Corpus manifest establishes this containment relation.",
    provenance: buildNodeProvenance("corpus-manifest", sourceFile),
  };
}

function buildAdjacentEdge(
  left: PassageRecord,
  right: PassageRecord,
  sourceFile: string,
): SearchGraphEdge {
  const source = `passage:${left.id}`;
  const target = `passage:${right.id}`;

  return {
    id: `adjacent_to:${source}->${target}`,
    source,
    target,
    relation: "adjacent_to",
    confidence: "EXTRACTED",
    weight: 0.9,
    sourcePassageId: left.id,
    rationale: "Corpus order places these passages next to each other in the same chapter.",
    provenance: buildNodeProvenance("corpus-sequence", sourceFile),
  };
}

function compileMentionPatterns(concept: SearchConcept): RegExp[] {
  return concept.mentionPatterns.map(pattern => new RegExp(pattern, "u"));
}

function buildMentionEdge(
  passage: PassageRecord,
  concept: SearchConcept,
  conceptSeedPath: string,
): SearchGraphEdge {
  const source = `passage:${passage.id}`;
  const target = `concept:${concept.id}`;

  return {
    id: `mentions:${source}->${target}`,
    source,
    target,
    relation: "mentions",
    confidence: "EXTRACTED",
    weight: 1,
    sourcePassageId: passage.id,
    rationale: `原文直接触及「${concept.label}」。`,
    provenance: buildNodeProvenance("concept-seed-pattern", conceptSeedPath),
  };
}

function buildStructuralGraph(
  corpus: PassageRecord[],
  manifest: CorpusManifestForGraph,
  sourceManifestPath: string,
): { nodes: SearchGraphNode[]; edges: SearchGraphEdge[] } {
  const nodes = new Map<string, SearchGraphNode>();
  const edges = new Map<string, SearchGraphEdge>();
  const corpusSourceFile = manifest.files[0]?.path ?? sourceManifestPath;
  const chapterPassages = new Map<string, PassageRecord[]>();

  for (const passage of corpus) {
    const workNodeId = `work:${passage.workId}`;
    const chapterNodeId = buildChapterId(passage.workId, passage.chapter);
    const passageNodeId = `passage:${passage.id}`;
    const chapterKey = `${passage.workId}\u0000${passage.chapter}`;

    nodes.set(workNodeId, {
      id: workNodeId,
      type: "work",
      label: passage.workTitle,
      workId: passage.workId,
      provenance: buildNodeProvenance("corpus-manifest", sourceManifestPath),
    });
    nodes.set(chapterNodeId, {
      id: chapterNodeId,
      type: "chapter",
      label: passage.chapter,
      workId: passage.workId,
      chapter: passage.chapter,
      provenance: buildNodeProvenance("corpus-manifest", sourceManifestPath),
    });
    nodes.set(passageNodeId, {
      id: passageNodeId,
      type: "passage",
      label: buildPassageLabel(passage),
      passageId: passage.id,
      workId: passage.workId,
      chapter: passage.chapter,
      textHash: passage.textHash,
      provenance: buildNodeProvenance("corpus-manifest", corpusSourceFile),
    });

    const workEdge = buildContainsEdge(workNodeId, chapterNodeId, sourceManifestPath);
    const passageEdge = buildContainsEdge(
      chapterNodeId,
      passageNodeId,
      corpusSourceFile,
      passage.id,
    );
    edges.set(workEdge.id, workEdge);
    edges.set(passageEdge.id, passageEdge);

    const passages = chapterPassages.get(chapterKey) ?? [];
    passages.push(passage);
    chapterPassages.set(chapterKey, passages);
  }

  for (const passages of chapterPassages.values()) {
    const sortedPassages = [...passages].sort((left, right) => left.section - right.section);

    for (let index = 0; index < sortedPassages.length - 1; index += 1) {
      const left = sortedPassages[index];
      const right = sortedPassages[index + 1];

      if (left && right) {
        const edge = buildAdjacentEdge(left, right, corpusSourceFile);
        edges.set(edge.id, edge);
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

function buildConceptGraph(
  corpus: PassageRecord[],
  seed: SearchConceptSeed,
  conceptSeedPath: string,
): { nodes: SearchGraphNode[]; edges: SearchGraphEdge[] } {
  const nodes: SearchGraphNode[] = seed.concepts.map(concept => ({
    id: `concept:${concept.id}`,
    type: "concept",
    label: concept.label,
    conceptGroup: concept.conceptGroup,
    provenance: buildNodeProvenance("concept-seed", conceptSeedPath),
  }));
  const edges: SearchGraphEdge[] = [];

  for (const concept of seed.concepts) {
    const patterns = compileMentionPatterns(concept);

    for (const passage of corpus) {
      const searchableText = `${passage.source} ${passage.workTitle} ${passage.chapter} ${passage.text}`;

      if (patterns.some(pattern => pattern.test(searchableText))) {
        edges.push(buildMentionEdge(passage, concept, conceptSeedPath));
      }
    }
  }

  return {
    nodes,
    edges,
  };
}

export async function generateSearchGraphArtifact(
  options: GenerateSearchGraphOptions = {},
): Promise<SearchGraphArtifact> {
  const manifestPath = path.resolve(process.cwd(), options.manifestPath ?? DEFAULT_MANIFEST_PATH);
  const conceptSeedPath = path.resolve(
    process.cwd(),
    options.conceptSeedPath ?? DEFAULT_CONCEPT_SEED_PATH,
  );
  const sourceManifestPath = normalizePathForArtifact(manifestPath);
  const normalizedConceptSeedPath = normalizePathForArtifact(conceptSeedPath);
  const [manifest, corpus, conceptSeed] = await Promise.all([
    readCorpusManifest(manifestPath),
    loadCorpus(manifestPath),
    loadSearchConceptSeed(conceptSeedPath),
  ]);
  const structuralGraph = buildStructuralGraph(corpus, manifest, sourceManifestPath);
  const conceptGraph = buildConceptGraph(corpus, conceptSeed, normalizedConceptSeedPath);
  const unsignedArtifact = {
    schemaVersion: SEARCH_GRAPH_SCHEMA_VERSION,
    corpusVersion: manifest.version,
    conceptSeedVersion: conceptSeed.conceptSeedVersion,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceManifestPath,
    nodes: [...structuralGraph.nodes, ...conceptGraph.nodes].sort(compareById),
    edges: [...structuralGraph.edges, ...conceptGraph.edges].sort(compareById),
  } satisfies Omit<SearchGraphArtifact, "artifactSignature">;
  const artifact = attachSearchGraphArtifactSignature(unsignedArtifact);

  return searchGraphArtifactSchema.parse(artifact);
}

async function readExistingGeneratedAtForSignature(
  outputPath: string,
  artifactSignature: string,
): Promise<string | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(outputPath, "utf8")) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;

    if (
      candidate.artifactSignature === artifactSignature &&
      typeof candidate.generatedAt === "string"
    ) {
      return candidate.generatedAt;
    }
  } catch {
    return null;
  }

  return null;
}

export async function writeSearchGraphArtifact(
  artifact: SearchGraphArtifact,
  options: WriteSearchGraphOptions = {},
): Promise<SearchGraphArtifact> {
  const outputPath = path.resolve(process.cwd(), options.outputPath ?? DEFAULT_GRAPH_OUTPUT_PATH);
  const existingGeneratedAt =
    options.preserveGeneratedAtForSameSignature === false
      ? null
      : await readExistingGeneratedAtForSignature(outputPath, artifact.artifactSignature);
  const outputArtifact = existingGeneratedAt
    ? { ...artifact, generatedAt: existingGeneratedAt }
    : artifact;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(outputArtifact, null, 2)}\n`, "utf8");

  return outputArtifact;
}
