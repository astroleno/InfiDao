import fs from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/annotate/route";
import { resetAnnotateAbuseGuard } from "@/lib/annotation/abuse-guard";

function createRequest(body: unknown, headers?: Record<string, string>): Request {
  const requestBody = typeof body === "string" ? body : JSON.stringify(body);
  const requestBytes = Uint8Array.from(Buffer.from(requestBody, "utf8"));
  const requestHeaders = new Map(
    Object.entries({
      "content-type": "application/json",
      ...(headers ?? {}),
    }).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    headers: {
      get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null,
    },
    body: {
      getReader: () => {
        let consumed = false;

        return {
          read: async () => {
            if (consumed) {
              return { done: true, value: undefined };
            }

            consumed = true;
            return { done: false, value: requestBytes };
          },
        };
      },
    },
  } as unknown as Request;
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
    resetAnnotateAbuseGuard();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    resetAnnotateAbuseGuard();
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

  it("rejects oversized request bodies", async () => {
    const response = await POST(
      createRequest({
        query: "朋友相处要诚信",
        passageId: "lunyu-1-7",
        passageText: "信".repeat(5000),
        style: "modern",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: "REQUEST_TOO_LARGE",
      }),
    });
  });

  it("rate limits repeated annotate requests from one client", async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await POST(
        createRequest(
          {
            query: "朋友相处要诚信",
            passageId: "lunyu-1-7",
            passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
            style: "modern",
          },
          {
            "x-forwarded-for": "203.0.113.20",
          },
        ),
      );

      expect(response.status).toBe(200);
    }

    const limited = await POST(
      createRequest(
        {
          query: "朋友相处要诚信",
          passageId: "lunyu-1-7",
          passageText: "贤贤易色，事父母能竭其力，事君能致其身，与朋友交言而有信。",
          style: "modern",
        },
        {
          "x-forwarded-for": "203.0.113.20",
        },
      ),
    );

    expect(limited.status).toBe(429);
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
