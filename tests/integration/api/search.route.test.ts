import fs from "node:fs";
import path from "node:path";
import { POST } from "@/app/api/search/route";
import { resetSearchAbuseGuard } from "@/lib/search/abuse-guard";

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

describe("POST /api/search", () => {
  afterEach(() => {
    resetSearchAbuseGuard();
  });

  it("returns reboot search results for a valid request", async () => {
    const response = await POST(
      createRequest({
        query: "治理国家",
        topK: 2,
        threshold: 0.4,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload).toMatchObject({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "daxue-2-2",
          source: "大学",
          chapter: expect.any(String),
          section: expect.any(Number),
          text: expect.any(String),
          score: expect.any(Number),
        }),
      ]),
    });
    expect(payload.data[0]).not.toHaveProperty("textHash");
    expect(payload.data[0]).not.toHaveProperty("corpusVersion");
  });

  it("rejects an empty query", async () => {
    const response = await POST(
      createRequest({
        query: "   ",
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

  it("does not accept legacy alternate fields", async () => {
    const response = await POST(
      createRequest({
        q: "治理国家",
        limit: 3,
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

  it("rejects legacy field aliases", async () => {
    const response = await POST(
      createRequest({
        query: "治理国家",
        top_k: 3,
        hybrid: true,
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

  it("returns success with an empty array when no result crosses the threshold", async () => {
    const response = await POST(
      createRequest({
        query: "星际跃迁",
        topK: 5,
        threshold: 0.99,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [],
    });
  });

  it("rejects oversized request bodies", async () => {
    const response = await POST(createRequest(`{"query":"${"治".repeat(3000)}"}`));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: "REQUEST_TOO_LARGE",
      }),
    });
  });

  it("rate limits repeated requests from one client", async () => {
    for (let index = 0; index < 30; index += 1) {
      const response = await POST(
        createRequest(
          {
            query: "治理国家",
            topK: 1,
            threshold: 0.25,
          },
          {
            "x-forwarded-for": "203.0.113.10",
          },
        ),
      );
      expect(response.status).toBe(200);
    }

    const limited = await POST(
      createRequest(
        {
          query: "治理国家",
          topK: 1,
          threshold: 0.25,
        },
        {
          "x-forwarded-for": "203.0.113.10",
        },
      ),
    );

    expect(limited.status).toBe(429);
  });

  it("does not import legacy db, embed, or llm services", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/search/route.ts"),
      "utf8",
    );

    expect(routeSource).not.toContain("@/lib/db");
    expect(routeSource).not.toContain("@/lib/embed");
    expect(routeSource).not.toContain("@/lib/llm");
  });
});
