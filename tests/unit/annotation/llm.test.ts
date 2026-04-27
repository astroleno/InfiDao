import {
  DEFAULT_ANNOTATION_LLM_TIMEOUT_MS,
  AnnotationLlmTimeoutError,
  generateAnnotationFromLlm,
  resolveAnnotationLlmConfigs,
  resolveAnnotationLlmMode,
  resolveAnnotationLlmRequestPlan,
  resolveAnnotationLlmRuntimeStatus,
  resolveAnnotationLlmTimeoutMs,
} from "@/lib/annotation/llm";

describe("annotation llm runtime", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of [
      "ANNOTATION_LLM_MODE",
      "ANNOTATION_MODE",
      "ANNOTATION_LLM_TIMEOUT_MS",
      "LLM_TIMEOUT_MS",
      "TIMEOUT_MS",
      "LLM_MODEL_PRIMARY",
      "LLM_BASE_URL_PRIMARY",
      "LLM_API_KEY_PRIMARY",
      "LLM_MODEL_SECONDARY",
      "LLM_BASE_URL_SECONDARY",
      "LLM_API_KEY_SECONDARY",
      "LLM_MODEL",
      "LLM_PROVIDER",
      "LLM_MODEL_2",
      "LLM_PROVIDER_2",
      "LLM_PROVIDE_2",
      "LLM_API_KEY",
      "LLM_API_KEY_2",
      "LLM_BASE_URL",
      "LLM_BASE_URL_2",
      "OPENAI_API_KEY",
      "OPENAI_API_KEY_2",
      "OPENAI_BASE_URL",
      "OPENAI_BASE_URL_2",
    ]) {
      delete process.env[key];
    }

    global.fetch = originalFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("resolves canonical primary and secondary slot names", () => {
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1/chat/completions";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    expect(resolveAnnotationLlmConfigs()).toEqual([
      {
        slot: "primary",
        endpoint: "https://yunwu.ai/v1/chat/completions",
        apiKey: "sk-primary",
        model: "gpt-5.4-nano",
      },
      {
        slot: "secondary",
        endpoint: "https://yunwu.ai/v1/chat/completions",
        apiKey: "sk-secondary",
        model: "gemini-3.1-flash-lite-preview",
      },
    ]);
  });

  it("reports canonical runtime config without leaking api keys", () => {
    process.env.ANNOTATION_LLM_MODE = "quality";
    process.env.ANNOTATION_LLM_TIMEOUT_MS = "2500";
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    const status = resolveAnnotationLlmRuntimeStatus();

    expect(status).toMatchObject({
      mode: "quality",
      timeoutMs: 2500,
      warnings: [],
      slots: [
        {
          slot: "primary",
          configured: true,
          apiKeyConfigured: true,
          model: "gpt-5.4-nano",
          endpoint: "https://yunwu.ai/v1/chat/completions",
          sources: {
            model: "LLM_MODEL_PRIMARY",
            baseUrl: "LLM_BASE_URL_PRIMARY",
            apiKey: "LLM_API_KEY_PRIMARY",
          },
          usesLegacyAliases: false,
        },
        {
          slot: "secondary",
          configured: true,
          apiKeyConfigured: true,
          model: "gemini-3.1-flash-lite-preview",
          endpoint: "https://yunwu.ai/v1/chat/completions",
          sources: {
            model: "LLM_MODEL_SECONDARY",
            baseUrl: "LLM_BASE_URL_SECONDARY",
            apiKey: "LLM_API_KEY_SECONDARY",
          },
          usesLegacyAliases: false,
        },
      ],
    });
    expect(JSON.stringify(status)).not.toContain("sk-primary");
    expect(JSON.stringify(status)).not.toContain("sk-secondary");
  });

  it("keeps backward-compatible aliases, including LLM_PROVIDE_2", () => {
    process.env.LLM_PROVIDER = "gpt-5.4-nano";
    process.env.OPENAI_BASE_URL = "https://yunwu.ai/v1";
    process.env.OPENAI_API_KEY = "sk-primary";
    process.env.LLM_PROVIDE_2 = "gemini-3.1-flash-lite-preview";
    process.env.OPENAI_API_KEY_2 = "sk-secondary";

    expect(resolveAnnotationLlmConfigs()).toEqual([
      {
        slot: "primary",
        endpoint: "https://yunwu.ai/v1/chat/completions",
        apiKey: "sk-primary",
        model: "gpt-5.4-nano",
      },
      {
        slot: "secondary",
        endpoint: "https://yunwu.ai/v1/chat/completions",
        apiKey: "sk-secondary",
        model: "gemini-3.1-flash-lite-preview",
      },
    ]);
  });

  it("marks backward-compatible aliases as legacy runtime config", () => {
    process.env.LLM_PROVIDER = "gpt-5.4-nano";
    process.env.OPENAI_BASE_URL = "https://yunwu.ai/v1";
    process.env.OPENAI_API_KEY = "sk-primary";
    process.env.LLM_PROVIDE_2 = "gemini-3.1-flash-lite-preview";
    process.env.OPENAI_API_KEY_2 = "sk-secondary";

    const status = resolveAnnotationLlmRuntimeStatus();

    expect(status.slots).toEqual([
      expect.objectContaining({
        slot: "primary",
        configured: true,
        usesLegacyAliases: true,
        sources: {
          model: "LLM_PROVIDER",
          baseUrl: "OPENAI_BASE_URL",
          apiKey: "OPENAI_API_KEY",
        },
      }),
      expect.objectContaining({
        slot: "secondary",
        configured: true,
        usesLegacyAliases: true,
        sources: {
          model: "LLM_PROVIDE_2",
          baseUrl: "OPENAI_BASE_URL",
          apiKey: "OPENAI_API_KEY_2",
        },
      }),
    ]);
    expect(status.warnings).toEqual(
      expect.arrayContaining([
        "primary.model uses legacy env LLM_PROVIDER; migrate to LLM_MODEL_PRIMARY.",
        "secondary.model uses legacy env LLM_PROVIDE_2; migrate to LLM_MODEL_SECONDARY.",
      ]),
    );
  });

  it("defaults to fast mode and prioritizes the secondary slot", () => {
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    expect(resolveAnnotationLlmMode()).toBe("fast");
    expect(resolveAnnotationLlmRequestPlan().map(config => config.slot)).toEqual([
      "secondary",
      "primary",
    ]);
  });

  it("uses quality mode when requested and prioritizes the primary slot", () => {
    process.env.ANNOTATION_LLM_MODE = "quality";
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    expect(resolveAnnotationLlmMode()).toBe("quality");
    expect(resolveAnnotationLlmRequestPlan().map(config => config.slot)).toEqual([
      "primary",
      "secondary",
    ]);
  });

  it("resolves a bounded provider timeout", () => {
    expect(resolveAnnotationLlmTimeoutMs()).toBe(DEFAULT_ANNOTATION_LLM_TIMEOUT_MS);

    process.env.ANNOTATION_LLM_TIMEOUT_MS = "2500";
    expect(resolveAnnotationLlmTimeoutMs()).toBe(2500);

    process.env.ANNOTATION_LLM_TIMEOUT_MS = "999999";
    expect(resolveAnnotationLlmTimeoutMs()).toBe(60_000);

    process.env.ANNOTATION_LLM_TIMEOUT_MS = "-1";
    expect(resolveAnnotationLlmTimeoutMs()).toBe(DEFAULT_ANNOTATION_LLM_TIMEOUT_MS);
  });

  it("falls back to the primary slot when the default fast slot fails", async () => {
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: "upstream unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"sixToMe":"主槽失败后由副槽接管。","meToSix":"这次问题让经典呈现新的切面。"}',
                },
              },
            ],
          }),
      }) as jest.Mock;

    await expect(
      generateAnnotationFromLlm({
        query: "如何面对困境",
        passageLabel: "论语 学而 第 1 节",
        passageText: "学而时习之，不亦说乎？",
        style: "modern",
      }),
    ).resolves.toEqual({
      sixToMe: "主槽失败后由副槽接管。",
      meToSix: "这次问题让经典呈现新的切面。",
      model: "gpt-5.4-nano",
      slot: "primary",
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://yunwu.ai/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"gemini-3.1-flash-lite-preview"'),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://yunwu.ai/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining('"model":"gpt-5.4-nano"'),
      }),
    );
  });

  it("falls back to the secondary slot in quality mode when the primary request fails", async () => {
    process.env.ANNOTATION_LLM_MODE = "quality";
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: "upstream unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"sixToMe":"质量模式主槽失败后由快槽接管。","meToSix":"这次问题让经典呈现新的切面。"}',
                },
              },
            ],
          }),
      }) as jest.Mock;

    await expect(
      generateAnnotationFromLlm({
        query: "如何面对困境",
        passageLabel: "论语 学而 第 1 节",
        passageText: "学而时习之，不亦说乎？",
        style: "modern",
      }),
    ).resolves.toEqual({
      sixToMe: "质量模式主槽失败后由快槽接管。",
      meToSix: "这次问题让经典呈现新的切面。",
      model: "gemini-3.1-flash-lite-preview",
      slot: "secondary",
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("passes an abort signal to provider requests", async () => {
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"sixToMe":"带 signal 的响应。","meToSix":"超时控制已经进入请求层。"}',
              },
            },
          ],
        }),
    }) as jest.Mock;

    await expect(
      generateAnnotationFromLlm({
        query: "如何面对困境",
        passageLabel: "论语 学而 第 1 节",
        passageText: "学而时习之，不亦说乎？",
        style: "modern",
      }),
    ).resolves.toMatchObject({
      sixToMe: "带 signal 的响应。",
      model: "gpt-5.4-nano",
      slot: "primary",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://yunwu.ai/v1/chat/completions",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts provider requests that exceed the timeout", async () => {
    jest.useFakeTimers();
    process.env.ANNOTATION_LLM_TIMEOUT_MS = "25";
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";

    global.fetch = jest.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;

      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as jest.Mock;

    const request = generateAnnotationFromLlm({
      query: "如何面对困境",
      passageLabel: "论语 学而 第 1 节",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
    });
    const rejection = expect(request).rejects.toEqual(
      new AnnotationLlmTimeoutError("primary", "gpt-5.4-nano", 25),
    );

    await jest.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("shares one timeout budget across failover slots", async () => {
    jest.useFakeTimers();
    process.env.ANNOTATION_LLM_TIMEOUT_MS = "50";
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    global.fetch = jest.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      const callNumber = (global.fetch as jest.Mock).mock.calls.length;

      return new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });

        if (callNumber === 1) {
          setTimeout(() => {
            resolve({
              ok: false,
              status: 503,
              text: async () => JSON.stringify({ error: { message: "upstream unavailable" } }),
            });
          }, 20);
        }
      });
    }) as jest.Mock;

    const request = generateAnnotationFromLlm({
      query: "如何面对困境",
      passageLabel: "论语 学而 第 1 节",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
    });
    const rejection = expect(request).rejects.toEqual(
      new AnnotationLlmTimeoutError("primary", "gpt-5.4-nano", 30),
    );

    await jest.advanceTimersByTimeAsync(20);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(30);
    await rejection;
  });
});
