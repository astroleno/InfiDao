import { readFileSync } from "fs";
import { join } from "path";

describe("reboot MVP acceptance checklist", () => {
  it("documents the stable MVP path and Phase 5 polish gates", () => {
    const checklistPath = join(process.cwd(), "docs/qa/reboot-mvp-acceptance-checklist.md");
    const checklist = readFileSync(checklistPath, "utf8");

    expect(checklist).toContain(
      "query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state",
    );
    expect(checklist).toContain("移动端可访问性");
    expect(checklist).toContain("视觉一致性");
    expect(checklist).toContain("未接线控件");
    expect(checklist).toContain("验收命令");
    expect(checklist).toContain("docs/qa/reboot-mvp-release-readiness.md");
  });

  it("spells out the exact reboot health smoke contract", () => {
    const checklistPath = join(process.cwd(), "docs/qa/reboot-mvp-acceptance-checklist.md");
    const checklist = readFileSync(checklistPath, "utf8");

    expect(checklist).toContain(
      '`GET /api/health` returns `200`, `success: true`, and `data.status: "ok"`.',
    );
    expect(checklist).toContain("`GET /api/internal/annotation-telemetry` returns `200`");
    expect(checklist).toContain("telemetry `llm.warnings` is empty");
    expect(checklist).toContain("telemetry reports migration warnings and never returns API keys");
  });

  it("keeps the environment example centered on canonical annotation llm slots", () => {
    const envExamplePath = join(process.cwd(), ".env.example");
    const envExample = readFileSync(envExamplePath, "utf8");

    expect(envExample).toContain("LLM_MODEL_PRIMARY=");
    expect(envExample).toContain("LLM_BASE_URL_PRIMARY=");
    expect(envExample).toContain("LLM_API_KEY_PRIMARY=");
    expect(envExample).toContain("LLM_MODEL_SECONDARY=");
    expect(envExample).toContain("LLM_BASE_URL_SECONDARY=");
    expect(envExample).toContain("LLM_API_KEY_SECONDARY=");
    expect(envExample).toContain("Migration compatibility only");
    expect(envExample).not.toMatch(/^LLM_PROVIDER=/m);
    expect(envExample).not.toMatch(/^LLM_PROVIDE_2=/m);
    expect(envExample).not.toMatch(/^OPENAI_API_KEY=/m);
    expect(envExample).not.toMatch(/^OPENAI_BASE_URL=/m);
  });
});
