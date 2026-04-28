import fs from "node:fs";
import path from "node:path";
import { GET } from "@/app/api/health/route";
import type { AnnotationResult, SearchRequest } from "@/types";

describe("GET /api/health", () => {
  it("returns the reboot minimal health payload", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        status: "ok",
      },
    });
  });

  it("does not import legacy db, embed, or llm services", () => {
    const routeSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/health/route.ts"),
      "utf8",
    );

    expect(routeSource).not.toContain("@/lib/db");
    expect(routeSource).not.toContain("@/lib/embed");
    expect(routeSource).not.toContain("@/lib/llm");
  });

  it("exposes reboot camelCase contract names", () => {
    const request: SearchRequest = {
      query: "如何面对困境",
      topK: 3,
      threshold: 0.35,
    };

    const annotation: AnnotationResult = {
      passageId: "lunyu-1-1",
      passageText: "学而时习之，不亦说乎？",
      sixToMe: "从经典回应当下问题",
      meToSix: "从当下反观经典原文",
      links: [],
    };

    expect(request.topK).toBe(3);
    expect(annotation.passageId).toBe("lunyu-1-1");
    expect(annotation.sixToMe).toContain("经典");
    expect(annotation.meToSix).toContain("经典");
  });
});
