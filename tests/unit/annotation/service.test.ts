import { createAnnotation } from "@/lib/annotation/service";
import { resetAnnotationCache } from "@/lib/annotation/cache";
import { getAnnotationTelemetryEvents, resetAnnotationTelemetry } from "@/lib/annotation/telemetry";

describe("createAnnotation", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of [
      "ANNOTATION_LLM_MODE",
      "ANNOTATION_MODE",
      "ANNOTATION_LLM_TIMEOUT_MS",
      "ANNOTATION_CACHE_TTL_MS",
      "ANNOTATION_CACHE_MAX_ENTRIES",
      "ANNOTATION_TELEMETRY",
      "LLM_MODEL_PRIMARY",
      "LLM_BASE_URL_PRIMARY",
      "LLM_API_KEY_PRIMARY",
      "LLM_MODEL_SECONDARY",
      "LLM_BASE_URL_SECONDARY",
      "LLM_API_KEY_SECONDARY",
      "LLM_MODEL",
      "LLM_PROVIDER",
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
    resetAnnotationCache();
    resetAnnotationTelemetry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    resetAnnotationCache();
    resetAnnotationTelemetry();
    jest.restoreAllMocks();
  });

  it("builds a deterministic annotation response for the selected passage", async () => {
    const annotation = await createAnnotation({
      query: "朋友相处要诚信",
      passageId: "lunyu-1-7",
      passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
      style: "modern",
    });

    expect(annotation).toMatchObject({
      passageId: "lunyu-1-7",
      passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
    });
    expect(annotation.sixToMe).toContain("朋友相处要诚信");
    expect(annotation.sixToMe).toContain("与朋友交言而有信");
    expect(annotation.meToSix).toContain("朋友相处要诚信");
    expect(annotation.links.length).toBeGreaterThan(0);
    expect(annotation.links[0]).toEqual(
      expect.objectContaining({
        passageId: expect.any(String),
        label: expect.any(String),
        passageText: expect.any(String),
        source: expect.any(String),
        chapter: expect.any(String),
        section: expect.any(Number),
      }),
    );
    expect(annotation.links.map(link => link.passageId)).not.toContain("lunyu-1-7");
  });

  it("keeps unknown selected passages annotatable while returning known corpus links", async () => {
    const annotation = await createAnnotation({
      query: "如何自省",
      passageId: "external-note-1",
      passageText: "我想知道自己哪里做得不够。",
      style: "modern",
    });

    expect(annotation.passageId).toBe("external-note-1");
    expect(annotation.passageText).toBe("我想知道自己哪里做得不够。");
    expect(annotation.links.some(link => link.passageId === "lunyu-1-4")).toBe(true);
  });

  it("excludes already visited passages from exploration links", async () => {
    const annotation = await createAnnotation({
      query: "什么是君子之道",
      passageId: "daxue-2-1",
      passageText: "所谓诚其意者，毋自欺也。",
      style: "modern",
      visitedPassageIds: ["daxue-1-1", "daxue-2-1"],
    });

    const linkedPassageIds = annotation.links.map(link => link.passageId);

    expect(linkedPassageIds).not.toContain("daxue-1-1");
    expect(linkedPassageIds).not.toContain("daxue-2-1");
  });

  it("uses the configured llm copy when a provider returns valid reboot json", async () => {
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
                content:
                  '{"sixToMe":"经典先让你稳住当下，再决定下一步。","meToSix":"你的问题让原文从训诫转成了行动中的校准。"}',
              },
            },
          ],
        }),
    }) as jest.Mock;

    const annotation = await createAnnotation({
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern",
    });

    expect(annotation.sixToMe).toBe("经典先让你稳住当下，再决定下一步。");
    expect(annotation.meToSix).toBe("你的问题让原文从训诫转成了行动中的校准。");
    expect(annotation.links.length).toBeGreaterThan(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("caches successful llm annotations and records cache telemetry", async () => {
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
                content: '{"sixToMe":"缓存中的经典回应。","meToSix":"缓存中的当代反观。"}',
              },
            },
          ],
        }),
    }) as jest.Mock;

    const request = {
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern" as const,
    };

    const first = await createAnnotation(request);
    const second = await createAnnotation(request);

    expect(first.sixToMe).toBe("缓存中的经典回应。");
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getAnnotationTelemetryEvents()).toMatchObject([
      {
        provider: "llm",
        cacheHit: false,
        fallbackHit: false,
        model: "gpt-5.4-nano",
        slot: "primary",
      },
      {
        provider: "cache",
        cacheHit: true,
        fallbackHit: false,
      },
    ]);
  });

  it("keeps fast and quality annotation cache entries separate", async () => {
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"sixToMe":"fast 模式回应。","meToSix":"fast 模式反观。"}',
                },
              },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"sixToMe":"quality 模式回应。","meToSix":"quality 模式反观。"}',
                },
              },
            ],
          }),
      }) as jest.Mock;

    const request = {
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern" as const,
    };

    const fast = await createAnnotation(request);
    process.env.ANNOTATION_LLM_MODE = "quality";
    const quality = await createAnnotation(request);

    expect(fast.sixToMe).toBe("fast 模式回应。");
    expect(quality.sixToMe).toBe("quality 模式回应。");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache provider-error fallback annotations", async () => {
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: { message: "upstream unavailable" } }),
    }) as jest.Mock;

    const request = {
      query: "如何面对困境",
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      style: "modern" as const,
    };

    await createAnnotation(request);
    await createAnnotation(request);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(getAnnotationTelemetryEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "deterministic",
          cacheHit: false,
          fallbackHit: true,
          fallbackReason: "provider_error",
        }),
      ]),
    );
  });
});
