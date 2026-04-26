import fs from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/annotate/route";

function createRequest(body: unknown): Request {
  return {
    json: async () => body,
  } as Request;
}

describe("POST /api/annotate", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of [
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
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns a deterministic annotation for a valid reboot request", async () => {
    const response = await POST(
      createRequest({
        query: "朋友相处要诚信",
        passageId: "lunyu-1-7",
        passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
        style: "modern",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        passageId: "lunyu-1-7",
        passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
        sixToMe: expect.stringContaining("朋友相处要诚信"),
        meToSix: expect.stringContaining("朋友相处要诚信"),
        links: expect.arrayContaining([
          expect.objectContaining({
            passageId: expect.any(String),
            label: expect.any(String),
            passageText: expect.any(String),
          }),
        ]),
      },
    });
  });

  it("rejects legacy alternate fields", async () => {
    const response = await POST(
      createRequest({
        q: "朋友相处要诚信",
        passage_id: "lunyu-1-7",
        passage_text: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: "VALIDATION_ERROR",
      }),
    });
  });

  it("does not import legacy db, embed, or llm services", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/annotate/route.ts"),
      "utf8",
    );

    expect(routeSource).not.toContain("@/lib/db");
    expect(routeSource).not.toContain("@/lib/embed");
    expect(routeSource).not.toContain("@/lib/llm");
  });
});
