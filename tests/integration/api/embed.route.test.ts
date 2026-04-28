import fs from "node:fs";
import path from "node:path";
import { GET, POST } from "@/app/api/embed/route";

describe("/api/embed legacy route", () => {
  it("returns a disabled response instead of loading the native embedding runtime", async () => {
    const postResponse = await POST();

    expect(postResponse.status).toBe(410);
    await expect(postResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "LEGACY_EMBED_DISABLED",
        message: "The legacy embedding API is disabled in the reboot MVP. Use /api/search for query handling.",
      },
    });

    const getResponse = await GET();

    expect(getResponse.status).toBe(410);
  });

  it("does not import the legacy embedding runtime", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/embed/route.ts"),
      "utf8",
    );

    expect(routeSource).not.toContain("@/lib/embed");
    expect(routeSource).not.toContain("@xenova/transformers");
  });
});
