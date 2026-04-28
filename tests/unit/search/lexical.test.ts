import type { PassageRecord } from "@/types";
import { rankLexicalCandidates } from "@/lib/search/lexical";

const base = {
  collection: "six_classics",
  corpusVersion: "sixclassics-sample-v1",
  textHash: "0".repeat(64),
};

const corpus: PassageRecord[] = [
  {
    ...base,
    id: "lunyu-1-1",
    source: "论语",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 1,
    text: "学而时习之，不亦说乎？",
  },
  {
    ...base,
    id: "daxue-1-1",
    source: "大学",
    workId: "daxue",
    workTitle: "大学",
    chapter: "经一章",
    section: 1,
    text: "大学之道，在明明德，在亲民，在止于至善。",
  },
  {
    ...base,
    id: "lunyu-1-4",
    source: "论语",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 4,
    text: "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？",
  },
];

describe("rankLexicalCandidates", () => {
  it("rewards exact source and text matches", () => {
    const results = rankLexicalCandidates(corpus, "大学 明德", 5);

    expect(results[0]).toMatchObject({
      id: "daxue-1-1",
    });
    expect(results[0]?.lexicalScore).toBeGreaterThan(0);
  });

  it("returns an empty list when there is no lexical overlap", () => {
    expect(rankLexicalCandidates(corpus, "星际跃迁", 5)).toEqual([]);
  });

  it("uses deterministic classical aliases without promoting arbitrary single-character matches", () => {
    const results = rankLexicalCandidates(corpus, "反省自己哪里做得不够", 5);

    expect(results[0]?.id).toBe("lunyu-1-4");
    expect(results[0]?.matchedTerms).toEqual(expect.arrayContaining(["三省", "不忠", "不信"]));
  });
});
