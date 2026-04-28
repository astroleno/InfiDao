import { buildLocalEmbedding, LOCAL_EMBEDDING_DIMENSION, LOCAL_EMBEDDING_MODEL } from "@/lib/search/local-embedding";
import {
  assertSearchQueryEncoderCompatible,
  encodeSearchQuery,
  resolveRemoteSearchEmbeddingConfig,
} from "@/lib/search/query-encoder";

describe("search query encoder", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("uses the deterministic local query encoder for the local artifact", async () => {
    await expect(
      encodeSearchQuery({
        query: "治理国家",
        model: LOCAL_EMBEDDING_MODEL,
        dimension: LOCAL_EMBEDDING_DIMENSION,
      }),
    ).resolves.toEqual(buildLocalEmbedding("治理国家"));
  });

  it("rewrites chat completions URLs to embeddings URLs for remote config", () => {
    process.env.OPENAI_BASE_URL = "https://yunwu.ai/v1/chat/completions";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.BGE_MODEL_REPO = "text-embedding-3-large";

    expect(resolveRemoteSearchEmbeddingConfig()).toEqual({
      endpoint: "https://yunwu.ai/v1/embeddings",
      apiKey: "sk-test",
      model: "text-embedding-3-large",
    });
  });

  it("encodes remote queries with the configured openai-compatible embedding endpoint", async () => {
    process.env.BGE_MODEL_PATH = "https://yunwu.ai/v1/embeddings";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.BGE_MODEL_REPO = "text-embedding-3-large";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [
            {
              embedding: [0.1, 0.2, 0.3],
            },
          ],
        }),
    }) as jest.Mock;

    await expect(
      encodeSearchQuery({
        query: "如何面对困境",
        model: "text-embedding-3-large",
        dimension: 3,
      }),
    ).resolves.toEqual([0.1, 0.2, 0.3]);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://yunwu.ai/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
      }),
    );
  });

  it("rejects non-local artifacts when remote config is missing", () => {
    delete process.env.SEARCH_EMBEDDING_BASE_URL;
    delete process.env.SEARCH_EMBEDDING_API_KEY;
    delete process.env.SEARCH_EMBEDDING_MODEL;
    delete process.env.EMBEDDING_BASE_URL;
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.BGE_MODEL_PATH;
    delete process.env.BGE_MODEL_REPO;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;

    expect(() => {
      assertSearchQueryEncoderCompatible("text-embedding-3-large", 3072);
    }).toThrow("remote query encoder");
  });
});
