import { GET } from "@/app/api/internal/annotation-telemetry/route";
import { recordAnnotationTelemetry, resetAnnotationTelemetry } from "@/lib/annotation/telemetry";

describe("GET /api/internal/annotation-telemetry", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of [
      "ANNOTATION_LLM_MODE",
      "ANNOTATION_LLM_TIMEOUT_MS",
      "LLM_MODEL_PRIMARY",
      "LLM_BASE_URL_PRIMARY",
      "LLM_API_KEY_PRIMARY",
      "LLM_MODEL_SECONDARY",
      "LLM_BASE_URL_SECONDARY",
      "LLM_API_KEY_SECONDARY",
      "LLM_PROVIDER",
      "LLM_PROVIDE_2",
      "OPENAI_BASE_URL",
      "OPENAI_API_KEY",
      "OPENAI_API_KEY_2",
    ]) {
      delete process.env[key];
    }

    resetAnnotationTelemetry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAnnotationTelemetry();
  });

  it("returns telemetry events, summary, and redacted runtime config in dev/test", async () => {
    process.env.ANNOTATION_LLM_MODE = "fast";
    process.env.ANNOTATION_LLM_TIMEOUT_MS = "3000";
    process.env.LLM_MODEL_PRIMARY = "gpt-5.4-nano";
    process.env.LLM_BASE_URL_PRIMARY = "https://yunwu.ai/v1";
    process.env.LLM_API_KEY_PRIMARY = "sk-primary";

    recordAnnotationTelemetry({
      mode: "fast",
      provider: "llm",
      elapsedMs: 120,
      cacheHit: false,
      fallbackHit: false,
      model: "gpt-5.4-nano",
      slot: "primary",
      timestamp: "2026-04-27T00:00:00.000Z",
    });
    recordAnnotationTelemetry({
      mode: "fast",
      provider: "cache",
      elapsedMs: 4,
      cacheHit: true,
      fallbackHit: false,
      timestamp: "2026-04-27T00:00:01.000Z",
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      data: {
        events: [
          expect.objectContaining({
            provider: "llm",
            elapsedMs: 120,
            model: "gpt-5.4-nano",
          }),
          expect.objectContaining({
            provider: "cache",
            cacheHit: true,
          }),
        ],
        summary: {
          count: 2,
          cacheHits: 1,
          fallbackHits: 0,
          averageElapsedMs: 62,
          byProvider: {
            cache: 1,
            deterministic: 0,
            llm: 1,
          },
          byMode: {
            fast: 2,
            quality: 0,
          },
        },
        llm: {
          mode: "fast",
          timeoutMs: 3000,
          slots: [
            expect.objectContaining({
              slot: "primary",
              configured: true,
              canonicalConfigured: true,
              apiKeyConfigured: true,
              sources: {
                model: "LLM_MODEL_PRIMARY",
                baseUrl: "LLM_BASE_URL_PRIMARY",
                apiKey: "LLM_API_KEY_PRIMARY",
              },
              legacyAliases: {},
              migrationRequired: false,
            }),
            expect.objectContaining({
              slot: "secondary",
              configured: false,
            }),
          ],
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("sk-primary");
  });

  it("surfaces migration warnings when legacy aliases are still in use", async () => {
    process.env.LLM_PROVIDER = "gpt-5.4-nano";
    process.env.OPENAI_BASE_URL = "https://yunwu.ai/v1";
    process.env.OPENAI_API_KEY = "sk-primary";
    process.env.LLM_PROVIDE_2 = "gemini-3.1-flash-lite-preview";
    process.env.OPENAI_API_KEY_2 = "sk-secondary";

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      data: {
        llm: {
          warnings: expect.arrayContaining([
            "primary.model uses legacy env LLM_PROVIDER; migrate to LLM_MODEL_PRIMARY.",
            "secondary.model uses legacy env LLM_PROVIDE_2; migrate to LLM_MODEL_SECONDARY.",
          ]),
          slots: [
            expect.objectContaining({
              slot: "primary",
              configured: true,
              canonicalConfigured: false,
              migrationRequired: true,
              legacyAliases: {
                model: "LLM_PROVIDER",
                baseUrl: "OPENAI_BASE_URL",
                apiKey: "OPENAI_API_KEY",
              },
            }),
            expect.objectContaining({
              slot: "secondary",
              configured: true,
              canonicalConfigured: false,
              migrationRequired: true,
              legacyAliases: {
                model: "LLM_PROVIDE_2",
                baseUrl: "OPENAI_BASE_URL",
                apiKey: "OPENAI_API_KEY_2",
              },
            }),
          ],
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("sk-primary");
    expect(JSON.stringify(payload)).not.toContain("sk-secondary");
  });

  it("is disabled by default in production", async () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
    };

    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "NOT_FOUND",
      },
    });
  });
});
