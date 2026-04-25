import type { PassageRecord } from "@/types";
import { buildQueryEmbedding, cosineSimilarity, rankPassages } from "@/lib/search/json";

const basePassage = {
  collection: "six_classics",
  textHash: "0".repeat(64),
  corpusVersion: "sixclassics-sample-v1",
};

const corpus: PassageRecord[] = [
  {
    ...basePassage,
    id: "lunyu-1-1",
    source: "论语",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 1,
    text: "学而时习之，不亦说乎？",
  },
  {
    ...basePassage,
    id: "daxue-2-1",
    source: "大学",
    workId: "daxue",
    workTitle: "大学",
    chapter: "传二章",
    section: 1,
    text: "先治其国；欲治其国者，先齐其家。",
  },
  {
    ...basePassage,
    id: "zhongyong-1-4",
    source: "中庸",
    workId: "zhongyong",
    workTitle: "中庸",
    chapter: "第一章",
    section: 4,
    text: "中也者，天下之大本也；和也者，天下之达道也。",
  },
];

const embeddingMap = new Map<string, number[]>(
  corpus.map((passage) => [passage.id, buildQueryEmbedding(`${passage.source} ${passage.chapter} ${passage.text}`)]),
);

describe("json search ranking", () => {
  it("sorts results by descending score and respects topK", () => {
    const results = rankPassages({
      corpus,
      embeddingMap,
      query: "治理国家",
      topK: 2,
      threshold: 0.1,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("daxue-2-1");
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
  });

  it("filters weak matches with threshold", () => {
    const results = rankPassages({
      corpus,
      embeddingMap,
      query: "中庸之道",
      topK: 5,
      threshold: 0.7,
    });

    expect(results.map((result) => result.id)).toEqual(["zhongyong-1-4"]);
  });

  it("returns an empty array for an empty corpus or no matches", () => {
    expect(
      rankPassages({
        corpus: [],
        embeddingMap: new Map(),
        query: "任何问题",
        topK: 5,
        threshold: 0.1,
      }),
    ).toEqual([]);

    expect(
      rankPassages({
        corpus,
        embeddingMap,
        query: "星际跃迁",
        topK: 5,
        threshold: 0.95,
      }),
    ).toEqual([]);
  });

  it("calculates cosine similarity for aligned vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });
});
