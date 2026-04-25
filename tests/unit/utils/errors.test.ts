import { buildErrorResponse, RouteError } from "@/lib/utils/errors";

describe("buildErrorResponse", () => {
  it("keeps validation details for 4xx errors", async () => {
    const response = buildErrorResponse(
      new RouteError(400, "VALIDATION_ERROR", "Bad request.", {
        fieldErrors: {
          query: ["Required"],
        },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        details: {
          fieldErrors: {
            query: ["Required"],
          },
        },
      },
    });
  });

  it("omits internal details for 5xx errors", async () => {
    const response = buildErrorResponse(
      new RouteError(500, "EMBEDDINGS_READ_FAILED", "Embedding data could not be read.", {
        filePath: "/Users/aitoshuu/Documents/GitHub/InfiDao/data/embeddings.json",
        cause: "ENOENT: no such file or directory",
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: "EMBEDDINGS_READ_FAILED",
        message: "Embedding data could not be read.",
      },
    });
    expect(payload.error).not.toHaveProperty("details");
    expect(JSON.stringify(payload)).not.toContain("/Users/");
    expect(JSON.stringify(payload)).not.toContain("ENOENT");
  });
});
