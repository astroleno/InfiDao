import path from "node:path";
import { loadCorpus } from "@/lib/data/corpus";

describe("loadCorpus", () => {
  it("returns stable reboot passage records with generated ids", async () => {
    const corpus = await loadCorpus();

    expect(corpus).toHaveLength(20);
    expect(corpus[0]).toMatchObject({
      id: "lunyu-1-1",
      source: "论语",
      collection: "six_classics",
      workId: "lunyu",
      workTitle: "论语",
      chapter: "学而篇",
      section: 1,
      text: "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？",
    });
    expect(corpus[0]?.textHash).toHaveLength(64);
    expect(corpus[0]?.corpusVersion).toBe("sixclassics-sample-v1");

    expect(corpus.find((passage) => passage.source === "大学")).toMatchObject({
      collection: "six_classics",
      workId: "daxue",
      workTitle: "大学",
    });

    expect(corpus.find((passage) => passage.source === "中庸")).toMatchObject({
      collection: "six_classics",
      workId: "zhongyong",
      workTitle: "中庸",
    });
  });

  it("fails with a typed error when the manifest is unreadable", async () => {
    await expect(loadCorpus(path.join(process.cwd(), "data", "missing-manifest.json"))).rejects.toMatchObject({
      code: "CORPUS_READ_FAILED",
      status: 500,
    });
  });

  it("fails with a typed error when a referenced corpus file is empty", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "empty-corpus-manifest.json");
    await expect(loadCorpus(fixturePath)).rejects.toMatchObject({
      code: "CORPUS_EMPTY",
      status: 500,
    });
  });
});
