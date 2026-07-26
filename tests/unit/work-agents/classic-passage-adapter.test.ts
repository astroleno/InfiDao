import { buildTextHash } from "@/lib/data/hash";
import { loadSearchIndex } from "@/lib/search/index-store";
import { createClassicPassageWorkAgent } from "@/lib/work-agents/classic-passage-adapter";

describe("classic passage work-agent adapter", () => {
  it("converts a passage record into a stable work-agent manifest", async () => {
    const index = await loadSearchIndex();
    const passage = index.corpus.find(candidate => candidate.id === "lunyu-1-1");

    if (!passage) {
      throw new Error("Expected lunyu-1-1 fixture.");
    }

    const first = createClassicPassageWorkAgent(passage);
    const second = createClassicPassageWorkAgent(passage);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      id: expect.stringContaining("work:classic:lunyu-1-1"),
      kind: "classic_passage",
      source: "论语",
      contentRef: {
        passageId: "lunyu-1-1",
        textHash: passage.textHash,
      },
      growthPolicy: {
        persist: "ephemeral_only",
        canGrow: true,
      },
    });
    expect(first?.interpretiveFrames.map(frame => frame.id)).toEqual(
      expect.arrayContaining(["liu_jing_zhu_wo", "wo_zhu_liu_jing", "contrast", "echo", "silence"]),
    );
  });

  it("returns null for a stale text hash", async () => {
    const index = await loadSearchIndex();
    const passage = index.corpus.find(candidate => candidate.id === "lunyu-1-1");

    if (!passage) {
      throw new Error("Expected lunyu-1-1 fixture.");
    }

    expect(
      createClassicPassageWorkAgent(passage, {
        expectedTextHash: buildTextHash("stale text"),
      }),
    ).toBeNull();
  });
});
