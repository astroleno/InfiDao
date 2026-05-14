import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearSearchIndexCache, loadSearchIndex } from "@/lib/search/index-store";
import { attachSearchGraphArtifactSignature } from "@/lib/search/graph/signature";
import { clearSearchGraphCache } from "@/lib/search/graph/store";
import {
  loadSearchGraphServiceForIndex,
  MAX_GRAPH_NEIGHBORS_PER_PASSAGE,
  MAX_GRAPH_RELATION_HINT_LENGTH,
} from "@/lib/search/graph/service";
import type {
  SearchGraphArtifact,
  SearchGraphEdge,
  SearchGraphNode,
} from "@/lib/search/graph/types";

const validFixturePath = path.join(process.cwd(), "tests", "fixtures", "search-graph.valid.json");

async function readValidFixture(): Promise<SearchGraphArtifact> {
  return JSON.parse(await fs.readFile(validFixturePath, "utf8")) as SearchGraphArtifact;
}

async function writeArtifact(artifact: SearchGraphArtifact): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "infidao-search-graph-service-"));
  const graphPath = path.join(directory, "search-graph.json");

  await fs.writeFile(graphPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return graphPath;
}

function resignArtifact(artifact: SearchGraphArtifact): SearchGraphArtifact {
  const { artifactSignature: _artifactSignature, ...unsignedArtifact } = artifact;
  return attachSearchGraphArtifactSignature(unsignedArtifact);
}

describe("search graph service", () => {
  afterEach(() => {
    clearSearchGraphCache();
    clearSearchIndexCache();
  });

  it("returns bounded passage relation hints from a valid graph", async () => {
    const index = await loadSearchIndex();
    const service = await loadSearchGraphServiceForIndex(index, {
      required: true,
      graphPath: validFixturePath,
    });
    const hints = service.buildRelationHints("lunyu-1-1");

    expect(service.enabled).toBe(true);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      passage: expect.objectContaining({ id: "lunyu-1-2" }),
      relationHint: expect.stringContaining("前后相邻"),
    });
  });

  it("returns empty graph results when the sidecar is disabled", async () => {
    const index = await loadSearchIndex();
    const service = await loadSearchGraphServiceForIndex(index, {
      graphPath: path.join(os.tmpdir(), "missing-search-graph-service.json"),
    });

    expect(service.enabled).toBe(false);
    expect(service.getPassageNeighbors("lunyu-1-1")).toEqual([]);
    expect(service.buildRelationHints("lunyu-1-1")).toEqual([]);
  });

  it("caps traversal for dense graph neighborhoods", async () => {
    const index = await loadSearchIndex();
    const base = await readValidFixture();
    const conceptNodes: SearchGraphNode[] = Array.from({ length: 30 }, (_, index) => ({
      id: `concept:dense-${index}`,
      type: "concept",
      label: `Dense ${index}`,
      conceptGroup: "dense",
      provenance: {
        source: "concept-seed",
        sourceFile: "data/search-concepts.json",
      },
    }));
    const denseEdges: SearchGraphEdge[] = conceptNodes.map(node => ({
      id: `mentions:passage:lunyu-1-1->${node.id}`,
      source: "passage:lunyu-1-1",
      target: node.id,
      relation: "mentions",
      confidence: "EXTRACTED",
      weight: 1,
      sourcePassageId: "lunyu-1-1",
      rationale: "Dense graph fixture.",
      provenance: {
        source: "concept-seed-pattern",
        sourceFile: "data/search-concepts.json",
      },
    }));
    const graphPath = await writeArtifact(
      resignArtifact({
        ...base,
        nodes: [...base.nodes, ...conceptNodes],
        edges: [...base.edges, ...denseEdges],
      }),
    );
    const service = await loadSearchGraphServiceForIndex(index, { required: true, graphPath });

    expect(service.getPassageNeighbors("lunyu-1-1").length).toBe(MAX_GRAPH_NEIGHBORS_PER_PASSAGE);
  });

  it("sanitizes malicious graph text before relation hints reach annotation links", async () => {
    const index = await loadSearchIndex();
    const base = await readValidFixture();
    const graphPath = await writeArtifact(
      resignArtifact({
        ...base,
        nodes: base.nodes.map(node =>
          node.id === "passage:lunyu-1-2"
            ? {
                ...node,
                label: `论语\u0000 <script>alert(1)</script> ${"very-long-label ".repeat(20)}`,
              }
            : node,
        ),
        edges: base.edges.map(edge =>
          edge.id === "adjacent_to:passage:lunyu-1-1->passage:lunyu-1-2"
            ? {
                ...edge,
                rationale: `clean\u0007 ${"long rationale ".repeat(40)}`,
              }
            : edge,
        ),
      }),
    );
    const service = await loadSearchGraphServiceForIndex(index, { required: true, graphPath });
    const hint = service.buildRelationHints("lunyu-1-1")[0];

    expect(hint?.relationHint).toBeDefined();
    expect(hint?.relationHint).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u);
    expect([...(hint?.relationHint ?? "")].length).toBeLessThanOrEqual(
      MAX_GRAPH_RELATION_HINT_LENGTH,
    );
  });
});
