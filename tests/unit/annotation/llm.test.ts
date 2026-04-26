import {
  generateAnnotationFromLlm,
  resolveAnnotationLlmConfigs,
  resolveAnnotationLlmMode,
  resolveAnnotationLlmRequestPlan,
} from "@/lib/annotation/llm";

describe("annotation llm runtime", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
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

  it("defaults to fast mode and prioritizes the secondary slot", () => {
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    process.env.LLM_MODEL_SECONDARY = "gemini-3.1-flash-lite-preview";
    process.env.LLM_BASE_URL_SECONDARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_SECONDARY = "sk-secondary";

    expect(resolveAnnotationLlmMode()).toBe("fast");
    expect(resolveAnnotationLlmRequestPlan().map((config) => config.slot)).toEqual(["secondary", "primary"]);
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
    expect(resolveAnnotationLlmRequestPlan().map((config) => config.slot)).toEqual(["primary", "secondary"]);
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
                  content: '{"sixToMe":"主槽失败后由副槽接管。","meToSix":"这次问题让经典呈现新的切面。"}',
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
                  content: '{"sixToMe":"质量模式主槽失败后由快槽接管。","meToSix":"这次问题让经典呈现新的切面。"}',
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
});
