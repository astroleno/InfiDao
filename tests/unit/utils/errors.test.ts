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
        message: "Internal server error.",
      },
    });
    expect(payload.error).not.toHaveProperty("details");
    expect(JSON.stringify(payload)).not.toContain("/Users/");
    expect(JSON.stringify(payload)).not.toContain("ENOENT");
  });

  it("redacts unexpected 5xx error messages", async () => {
    const response = buildErrorResponse(new Error("token sk-secret leaked through upstream stack"));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("sk-secret");
    expect(JSON.stringify(payload)).not.toContain("upstream stack");
  });
});
