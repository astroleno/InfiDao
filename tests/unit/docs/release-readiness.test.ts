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
    expect(document).toContain("npm run test:search-quality");
    expect(document).toContain("cp -R .next/static .next/standalone/.next/static");
    expect(document).toContain("search response shape");
    expect(document).toContain("historical baseline");
    expect(document).toContain("如何面对困境");
    expect(document).toContain("referenced `/_next/static/*.js` assets return `200`");
    expect(document).toContain("`GET /api/embed` -> `410 LEGACY_EMBED_DISABLED`");
  });

  it("distinguishes the current convergence blocker from historical evidence", () => {
    const document = readFileSync(releaseReadinessPath, "utf8");

    expect(document).toContain("Decision: blocked; not a current Release Candidate signoff");
    expect(document).toContain("review of the independently authored one-shot frozen holdout v1");
    expect(document).toContain("Historical Release Evidence (2026-04-29)");
    expect(document).toContain("two no-cache full Jest runs");
    expect(document).toContain("f261607bf83560e746507e38d7dd93dffc5b8edb");
    expect(document).toContain("Integration preflight complete");
    expect(document).toContain("0e7a81768cbdfcf0b6cc8633edceee6e1e7c7990");
    expect(document).toContain("3e9eb8385ec2779708f0bbfe5afa41052a7f9f6b");
    expect(document).toContain("superseded before any fixture");
    expect(document).toContain("dc2944974ccf4a837a7894e12b073427d1d58cf0");
    expect(document).toContain("Decision: **blocked**");
    expect(document).toContain("In-domain: `0/24`");
    expect(document).toContain("OOD: `6/6`");
    expect(document).toContain("Task 7 and Release Candidate signoff remain blocked");
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
