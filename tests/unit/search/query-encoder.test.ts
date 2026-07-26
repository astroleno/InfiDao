import {
  buildLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
} from "@/lib/search/local-embedding";
import {
  DEFAULT_SEARCH_EMBEDDING_TIMEOUT_MS,
  assertSearchQueryEncoderCompatible,
  encodeSearchQuery,
  resolveRemoteSearchEmbeddingConfig,
  resolveSearchEmbeddingTimeoutMs,
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
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test",
        }),
      }),
    );
  });

  it("resolves a bounded timeout for remote embedding requests", () => {
    expect(resolveSearchEmbeddingTimeoutMs()).toBe(
      DEFAULT_SEARCH_EMBEDDING_TIMEOUT_MS,
    );

    process.env.SEARCH_EMBEDDING_TIMEOUT_MS = "2500";
    expect(resolveSearchEmbeddingTimeoutMs()).toBe(2500);

    process.env.SEARCH_EMBEDDING_TIMEOUT_MS = "999999";
    expect(resolveSearchEmbeddingTimeoutMs()).toBe(60_000);

    process.env.SEARCH_EMBEDDING_TIMEOUT_MS = "-1";
    expect(resolveSearchEmbeddingTimeoutMs()).toBe(
      DEFAULT_SEARCH_EMBEDDING_TIMEOUT_MS,
    );
  });

  it("aborts remote query embedding requests that exceed the timeout", async () => {
    jest.useFakeTimers();

    try {
      process.env.BGE_MODEL_PATH = "https://yunwu.ai/v1/embeddings";
      process.env.OPENAI_API_KEY = "sk-test";
      process.env.BGE_MODEL_REPO = "text-embedding-3-large";
      process.env.SEARCH_EMBEDDING_TIMEOUT_MS = "25";

      global.fetch = jest.fn((_endpoint, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }) as jest.Mock;

      const encoding = encodeSearchQuery({
        query: "如何面对困境",
        model: "text-embedding-3-large",
        dimension: 3,
      });
      const assertion = expect(encoding).rejects.toMatchObject({
        status: 504,
        code: "EMBEDDING_PROVIDER_TIMEOUT",
      });

      await jest.advanceTimersByTimeAsync(25);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
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
