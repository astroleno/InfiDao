import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearSearchIndexCache, loadSearchIndex } from "@/lib/search/index-store";
import { clearSearchGraphCache, loadSearchGraphForIndex } from "@/lib/search/graph/store";
import type { SearchGraphArtifact } from "@/lib/search/graph/types";
import { attachSearchGraphArtifactSignature } from "@/lib/search/graph/signature";

const validFixturePath = path.join(process.cwd(), "tests", "fixtures", "search-graph.valid.json");

async function readValidFixture(): Promise<SearchGraphArtifact> {
  return JSON.parse(await fs.readFile(validFixturePath, "utf8")) as SearchGraphArtifact;
}

async function writeGraphFixture(artifactOrText: SearchGraphArtifact | string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "infidao-search-graph-"));
  const graphPath = path.join(directory, "search-graph.json");
  const contents =
    typeof artifactOrText === "string"
      ? artifactOrText
      : `${JSON.stringify(artifactOrText, null, 2)}\n`;

  await fs.writeFile(graphPath, contents, "utf8");
  return graphPath;
}

function resignArtifact(artifact: SearchGraphArtifact): SearchGraphArtifact {
  const { artifactSignature: _artifactSignature, ...unsignedArtifact } = artifact;
  return attachSearchGraphArtifactSignature(unsignedArtifact);
}

describe("search graph store", () => {
  afterEach(() => {
    clearSearchGraphCache();
    clearSearchIndexCache();
  });

  it("loads a valid fixture in required mode", async () => {
    const index = await loadSearchIndex();
    const state = await loadSearchGraphForIndex(index, {
      required: true,
      graphPath: validFixturePath,
    });

    expect(state.enabled).toBe(true);

    if (state.enabled) {
      expect(state.artifact.nodes.some(node => node.type === "concept")).toBe(true);
      expect(state.artifact.edges.some(edge => edge.relation === "adjacent_to")).toBe(true);
    }
  });

  it("fails open when the graph file is missing by default", async () => {
    const index = await loadSearchIndex();
    const state = await loadSearchGraphForIndex(index, {
      graphPath: path.join(os.tmpdir(), "missing-search-graph.json"),
    });

    expect(state).toMatchObject({
      enabled: false,
      reason: "missing",
    });
  });

  it("throws typed errors in required mode", async () => {
    const index = await loadSearchIndex();

    await expect(
      loadSearchGraphForIndex(index, {
        required: true,
        graphPath: path.join(os.tmpdir(), "missing-search-graph-required.json"),
      }),
    ).rejects.toMatchObject({
      code: "GRAPH_MISSING",
    });
  });

  it("fails open on invalid JSON in runtime mode", async () => {
    const index = await loadSearchIndex();
    const graphPath = await writeGraphFixture("{ not json");
    const state = await loadSearchGraphForIndex(index, { graphPath });

    expect(state).toMatchObject({
      enabled: false,
      reason: "invalid-json",
    });
  });

  it("rejects malformed graph artifacts", async () => {
    const index = await loadSearchIndex();
    const base = await readValidFixture();

    const cases: Array<[string, SearchGraphArtifact, string]> = [
      [
        "duplicate node ids",
        resignArtifact({
          ...base,
          nodes: [...base.nodes, { ...base.nodes[0]! }],
        }),
        "GRAPH_DUPLICATE_NODE_ID",
      ],
      [
        "dangling edge endpoints",
        resignArtifact({
          ...base,
          edges: [{ ...base.edges[0]!, target: "passage:not-real" }, ...base.edges.slice(1)],
        }),
        "GRAPH_DANGLING_EDGE",
      ],
      [
        "stale text hashes",
        resignArtifact({
          ...base,
          nodes: base.nodes.map(node =>
            node.type === "passage" && node.passageId === "lunyu-1-1"
              ? { ...node, textHash: "0".repeat(64) }
              : node,
          ),
        }),
        "GRAPH_STALE_TEXT_HASH",
      ],
      [
        "orphan passage nodes",
        resignArtifact({
          ...base,
          nodes: base.nodes.map(node =>
            node.type === "passage" && node.passageId === "lunyu-1-1"
              ? { ...node, id: "passage:not-real", passageId: "not-real" }
              : node,
          ),
        }),
        "GRAPH_ORPHAN_PASSAGE_NODE",
      ],
      [
        "corpus mismatches",
        resignArtifact({
          ...base,
          corpusVersion: "other-corpus",
        }),
        "GRAPH_CORPUS_MISMATCH",
      ],
      [
        "bad source passage ids",
        resignArtifact({
          ...base,
          edges: [{ ...base.edges[0]!, sourcePassageId: "not-real" }, ...base.edges.slice(1)],
        }),
        "GRAPH_ORPHAN_SOURCE_PASSAGE",
      ],
      [
        "code graph pollution",
        resignArtifact({
          ...base,
          nodes: base.nodes.map(node =>
            node.id === "work:lunyu"
              ? {
                  ...node,
                  provenance: { ...node.provenance, sourceFile: "ref/www/_nuxt/bundle.js" },
                }
              : node,
          ),
        }),
        "GRAPH_POLLUTED",
      ],
    ];

    for (const [name, artifact, code] of cases) {
      const graphPath = await writeGraphFixture(artifact);

      await expect(
        loadSearchGraphForIndex(index, { required: true, graphPath }),
      ).rejects.toMatchObject({
        code,
      });
      clearSearchGraphCache();
    }
  });

  it("rejects invalid confidence before semantic validation", async () => {
    const index = await loadSearchIndex();
    const base = await readValidFixture();
    const graphPath = await writeGraphFixture({
      ...base,
      edges: [{ ...base.edges[0]!, confidence: "CERTAIN" as never }, ...base.edges.slice(1)],
    });

    await expect(
      loadSearchGraphForIndex(index, { required: true, graphPath }),
    ).rejects.toMatchObject({
      code: "GRAPH_SCHEMA_INVALID",
    });
  });

  it("rejects invalid artifact signatures", async () => {
    const index = await loadSearchIndex();
    const base = await readValidFixture();
    const graphPath = await writeGraphFixture({
      ...base,
      artifactSignature: `sha256:${"0".repeat(64)}`,
    });

    await expect(
      loadSearchGraphForIndex(index, { required: true, graphPath }),
    ).rejects.toMatchObject({
      code: "GRAPH_SIGNATURE_MISMATCH",
    });
  });

  it("exposes clearSearchGraphCache for test and dev reload isolation", async () => {
    const index = await loadSearchIndex();
    const base = await readValidFixture();
    const graphPath = await writeGraphFixture(base);
    const first = await loadSearchGraphForIndex(index, { required: true, graphPath });

    await fs.writeFile(
      graphPath,
      JSON.stringify(
        resignArtifact({
          ...base,
          edges: [],
        }),
        null,
        2,
      ),
      "utf8",
    );

    const cached = await loadSearchGraphForIndex(index, { required: true, graphPath });
    clearSearchGraphCache();
    const refreshed = await loadSearchGraphForIndex(index, { required: true, graphPath });

    expect(first.enabled && first.artifact.edges.length).toBeGreaterThan(0);
    expect(cached.enabled && cached.artifact.edges.length).toBeGreaterThan(0);
    expect(refreshed.enabled && refreshed.artifact.edges.length).toBe(0);
  });
});
