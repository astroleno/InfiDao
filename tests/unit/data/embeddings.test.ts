import path from "node:path";
import { loadCorpus } from "@/lib/data/corpus";
import { loadEmbeddingArtifact, loadEmbeddingsForCorpus } from "@/lib/data/embeddings";
import { buildLocalEmbedding } from "@/lib/search/local-embedding";

describe("embedding loaders", () => {
  it("loads the artifact envelope", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "valid-embeddings.json");
    const artifact = await loadEmbeddingArtifact(fixturePath);

    expect(artifact.model).toBe("infidao-local-concept-v1");
    expect(artifact.dimension).toBe(3);
    expect(artifact.corpusVersion).toBe("sixclassics-sample-v1");
    expect(artifact.items).toHaveLength(1);
  });

  it("fails with a typed error when the file is malformed", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "malformed-embeddings.json");
    await expect(loadEmbeddingArtifact(fixturePath)).rejects.toMatchObject({
      code: "EMBEDDINGS_MALFORMED",
      status: 500,
    });
  });

  it("fails with a typed error when a passage embedding is missing", async () => {
    const corpus = await loadCorpus();
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "missing-embedding.json");

    await expect(loadEmbeddingsForCorpus(corpus, fixturePath)).rejects.toMatchObject({
      code: "EMBEDDING_NOT_FOUND",
      status: 500,
    });
  });

  it("matches every production embedding to a passage id and text hash", async () => {
    const corpus = await loadCorpus();
    const embeddingMap = await loadEmbeddingsForCorpus(corpus);
    const firstPassage = corpus.find((passage) => passage.id === "lunyu-1-1");

    expect(firstPassage).toBeDefined();
    if (!firstPassage) {
      throw new Error("Expected lunyu-1-1 in the production corpus.");
    }

    expect(embeddingMap.get("lunyu-1-1")).toHaveLength(21);
    expect(embeddingMap.get("lunyu-1-1")).toEqual(
      buildLocalEmbedding(`${firstPassage.source} ${firstPassage.chapter} ${firstPassage.text}`, {
        expandAliases: false,
      }),
    );
    expect(embeddingMap.size).toBe(corpus.length);
  });
});
