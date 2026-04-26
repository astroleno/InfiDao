import { readFileSync } from "fs";
import { join } from "path";

describe("reboot MVP acceptance checklist", () => {
  it("documents the stable MVP path and Phase 5 polish gates", () => {
    const checklistPath = join(process.cwd(), "docs/qa/reboot-mvp-acceptance-checklist.md");
    const checklist = readFileSync(checklistPath, "utf8");

    expect(checklist).toContain("query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state");
    expect(checklist).toContain("移动端可访问性");
    expect(checklist).toContain("视觉一致性");
    expect(checklist).toContain("未接线控件");
    expect(checklist).toContain("验收命令");
  });

  it("spells out the exact reboot health smoke contract", () => {
    const checklistPath = join(process.cwd(), "docs/qa/reboot-mvp-acceptance-checklist.md");
    const checklist = readFileSync(checklistPath, "utf8");

    expect(checklist).toContain('`GET /api/health` returns `200`, `success: true`, and `data.status: "ok"`.');
  });
});
