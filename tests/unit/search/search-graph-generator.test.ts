import { loadSearchIndex, clearSearchIndexCache } from "@/lib/search/index-store";
import { loadSearchConceptSeed } from "@/lib/search/concepts/load";
import { generateSearchGraphArtifact } from "@/lib/search/graph/generator";
import { buildSearchGraphArtifactSignature } from "@/lib/search/graph/signature";
import { validateSearchGraphArtifactForIndex } from "@/lib/search/graph/store";
import type { SearchGraphArtifact } from "@/lib/search/graph/types";

describe("search graph generator", () => {
  afterEach(() => {
    clearSearchIndexCache();
  });

  it("generates a valid graph artifact only from corpus and concept seed inputs", async () => {
    const index = await loadSearchIndex();
    const artifact = await generateSearchGraphArtifact({
      generatedAt: "2026-05-13T00:00:00.000Z",
    });

    expect(() => validateSearchGraphArtifactForIndex(artifact, index)).not.toThrow();
    expect(artifact.nodes.length).toBeGreaterThan(index.corpus.length);
    expect(artifact.edges.length).toBeGreaterThan(index.corpus.length);
    expect(
      artifact.nodes.some(
        node =>
          node.type === "concept" && node.provenance.sourceFile === "data/search-concepts.json",
      ),
    ).toBe(true);
    expect(artifact.nodes.filter(node => node.type === "passage")).toHaveLength(
      index.corpus.length,
    );
    expect(artifact.nodes.every(node => !JSON.stringify(node).includes("graphify-out"))).toBe(true);
    expect(artifact.edges.every(edge => !JSON.stringify(edge).includes("ref/"))).toBe(true);
    expect(artifact.edges.every(edge => !JSON.stringify(edge).includes("_nuxt"))).toBe(true);
  });

  it("binds every passage node to a pure hex textHash", async () => {
    const artifact = await generateSearchGraphArtifact({
      generatedAt: "2026-05-13T00:00:00.000Z",
    });
    const passageNodes = artifact.nodes.filter(node => node.type === "passage");

    expect(passageNodes.length).toBeGreaterThan(0);
    expect(passageNodes.every(node => /^[a-f0-9]{64}$/u.test(node.textHash))).toBe(true);
    expect(passageNodes.every(node => !node.textHash.startsWith("sha256:"))).toBe(true);
  });

  it("generates stable concept mentions with positive and negative precision fixtures", async () => {
    const seed = await loadSearchConceptSeed();
    const artifact = await generateSearchGraphArtifact({
      generatedAt: "2026-05-13T00:00:00.000Z",
    });
    const mentionEdges = artifact.edges.filter(edge => edge.relation === "mentions");

    for (const concept of seed.concepts) {
      expect(mentionEdges.some(edge => edge.target === `concept:${concept.id}`)).toBe(true);
    }

    expect(
      mentionEdges.some(
        edge =>
          edge.source === "passage:lunyu-1-1" && edge.target === "concept:learning-and-practice",
      ),
    ).toBe(true);
    expect(
      mentionEdges.some(
        edge =>
          edge.source === "passage:lunyu-1-3" && edge.target === "concept:learning-and-practice",
      ),
    ).toBe(false);
  });

  it("keeps signatures stable across record and field order", async () => {
    const artifact = await generateSearchGraphArtifact({
      generatedAt: "2026-05-13T00:00:00.000Z",
    });
    const reorderedArtifact = {
      ...artifact,
      nodes: [...artifact.nodes].reverse(),
      edges: [...artifact.edges].reverse(),
    } satisfies SearchGraphArtifact;

    expect(buildSearchGraphArtifactSignature(reorderedArtifact)).toBe(artifact.artifactSignature);
  });

  it("changes signatures for semantic graph changes", async () => {
    const artifact = await generateSearchGraphArtifact({
      generatedAt: "2026-05-13T00:00:00.000Z",
    });
    const changedRationale = {
      ...artifact,
      edges: [
        { ...artifact.edges[0]!, rationale: "Changed rationale." },
        ...artifact.edges.slice(1),
      ],
    } satisfies SearchGraphArtifact;
    const changedWeight = {
      ...artifact,
      edges: [{ ...artifact.edges[0]!, weight: 0.1 }, ...artifact.edges.slice(1)],
    } satisfies SearchGraphArtifact;

    expect(buildSearchGraphArtifactSignature(changedRationale)).not.toBe(
      artifact.artifactSignature,
    );
    expect(buildSearchGraphArtifactSignature(changedWeight)).not.toBe(artifact.artifactSignature);
  });
});
