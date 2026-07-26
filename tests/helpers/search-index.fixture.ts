import { buildTextHash } from "@/lib/data/hash";
import {
  buildLocalEmbedding,
  LOCAL_EMBEDDING_DIMENSION,
  LOCAL_EMBEDDING_MODEL,
} from "@/lib/search/local-embedding";
import type { SearchIndex } from "@/lib/search/index-store";
import type { PassageRecord } from "@/types";

const corpusVersion = "guji-core-v1";

const passages: PassageRecord[] = [
  {
    id: "lunyu-1-1",
    source: "论语",
    collection: "six_classics",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 1,
    text: "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？",
    textHash: "",
    corpusVersion,
  },
  {
    id: "lunyu-1-2",
    source: "论语",
    collection: "six_classics",
    workId: "lunyu",
    workTitle: "论语",
    chapter: "学而篇",
    section: 2,
    text: "其为人也孝弟，而好犯上者，鲜矣；不好犯上，而好作乱者，未之有也。君子务本，本立而道生。",
    textHash: "",
    corpusVersion,
  },
].map((passage) => ({
  ...passage,
  textHash: buildTextHash(passage.text),
}));

export function createSearchIndexFixture(): SearchIndex {
  const corpus = passages.map((passage) => ({ ...passage }));

  return {
    corpus,
    embeddingMap: new Map(corpus.map((passage) => [passage.id, buildLocalEmbedding(passage.text)])),
    model: LOCAL_EMBEDDING_MODEL,
    dimension: LOCAL_EMBEDDING_DIMENSION,
    corpusVersion,
  };
}
