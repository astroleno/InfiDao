import { readFileSync } from "fs";
import { join } from "path";

describe("reboot MVP release readiness", () => {
  const releaseReadinessPath = join(process.cwd(), "docs/qa/reboot-mvp-release-readiness.md");

  it("documents canonical annotation LLM env and migration-only legacy aliases", () => {
    const document = readFileSync(releaseReadinessPath, "utf8");

    expect(document).toContain("LLM_MODEL_PRIMARY=");
    expect(document).toContain("LLM_BASE_URL_PRIMARY=");
    expect(document).toContain("LLM_API_KEY_PRIMARY=");
    expect(document).toContain("LLM_MODEL_SECONDARY=");
    expect(document).toContain("LLM_BASE_URL_SECONDARY=");
    expect(document).toContain("LLM_API_KEY_SECONDARY=");
    expect(document).toContain("Legacy annotation aliases remain migration compatibility only");
    expect(document).toContain("migrationRequired: true");
    expect(document).toContain("canonicalConfigured: true");
    expect(document).toContain("llm.warnings: []");
  });

  it("freezes production defaults for annotation runtime hardening", () => {
    const document = readFileSync(releaseReadinessPath, "utf8");

    expect(document).toContain("ANNOTATION_LLM_MODE=fast");
    expect(document).toContain("ANNOTATION_LLM_TIMEOUT_MS=5000");
    expect(document).toContain("ANNOTATION_CACHE_TTL_MS=600000");
    expect(document).toContain("ANNOTATION_CACHE_MAX_ENTRIES=100");
    expect(document).toContain("ANNOTATION_FALLBACK_ALERT_RATE=0.15");
    expect(document).toContain("ANNOTATION_P95_ALERT_MS=5000");
    expect(document).toContain("10_240");
    expect(document).toContain("20 requests per client per 60 seconds");
    expect(document).toContain("production must return `404`");
  });

  it("documents the ci gate and production smoke command", () => {
    const document = readFileSync(releaseReadinessPath, "utf8");

    expect(document).toContain(".github/workflows/reboot-mvp-ci.yml");
    expect(document).toContain("npm run smoke:release");
    expect(document).toContain("cp -R .next/static .next/standalone/.next/static");
    expect(document).toContain("top result `lunyu-1-8`");
    expect(document).toContain("referenced `/_next/static/*.js` assets return `200`");
    expect(document).toContain("`GET /api/embed` -> `410 LEGACY_EMBED_DISABLED`");
  });

  it("covers the release smoke matrix requested for Phase 6.5", () => {
    const document = readFileSync(releaseReadinessPath, "utf8");

    for (const requiredCase of [
      "`fast` mode",
      "`quality` mode",
      "timeout fallback",
      "provider failover",
      "cache hit",
      "oversized body",
      "rate limit",
      "telemetry canonical",
      "telemetry legacy",
      "telemetry quality signals",
      "production internal route",
    ]) {
      expect(document).toContain(requiredCase);
    }
  });
});
