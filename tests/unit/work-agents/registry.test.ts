import { resolveWorkAgentByPassageId } from "@/lib/work-agents/registry";

describe("work-agent registry", () => {
  it("resolves a classic passage work agent by passage id", async () => {
    const manifest = await resolveWorkAgentByPassageId("lunyu-1-1", {
      passageText: "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？",
    });

    expect(manifest).toMatchObject({
      kind: "classic_passage",
      contentRef: {
        passageId: "lunyu-1-1",
      },
    });
  });

  it("fails open for missing passages", async () => {
    await expect(resolveWorkAgentByPassageId("missing-passage")).resolves.toBeNull();
  });

  it("fails open for stale passage text", async () => {
    await expect(
      resolveWorkAgentByPassageId("lunyu-1-1", {
        passageText: "stale text",
      }),
    ).resolves.toBeNull();
  });
});
