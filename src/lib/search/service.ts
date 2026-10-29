import { DEFAULT_SEARCH_THRESHOLD, DEFAULT_SEARCH_TOP_K, type SearchRequest, type SearchResult } from "@/types";
import { applySearchEvidenceGuard } from "@/lib/search/evidence";
import { fuseSearchCandidates } from "@/lib/search/fusion";
import { encodeSearchQuery } from "@/lib/search/query-encoder";
import { rankLexicalCandidates } from "@/lib/search/lexical";
import { rankPassagesByVector } from "@/lib/search/json";
import { loadSearchIndex } from "@/lib/search/index-store";
import { resolveContentScope } from '@/lib/content/scope';
import { searchPoetry } from '@/lib/content/store';

export async function searchPassages({
  query,
  topK = DEFAULT_SEARCH_TOP_K,
  threshold = DEFAULT_SEARCH_THRESHOLD,
  contentPacks,
}: SearchRequest): Promise<SearchResult[]> {
  const index = await loadSearchIndex();
  const candidateLimit = Math.max(topK * 4, 20);
  const queryVector = await encodeSearchQuery({
    query,
    model: index.model,
    dimension: index.dimension,
  });

  const vectorResults = rankPassagesByVector({
    corpus: index.corpus,
    embeddingMap: index.embeddingMap,
    queryVector,
    topK: candidateLimit,
    threshold: Math.max(0, threshold * 0.7),
  });
  const lexicalResults = rankLexicalCandidates(index.corpus, query, candidateLimit);

  const core = applySearchEvidenceGuard(
    query,
    lexicalResults,
    fuseSearchCandidates(vectorResults, lexicalResults, topK, threshold),
  ).map(
    ({
      vectorScore: _vectorScore,
      lexicalScore: _lexicalScore,
      evidenceScore: _evidenceScore,
      hasDomainEvidence: _hasDomainEvidence,
      matchedTerms: _matchedTerms,
      ...result
    }) => result,
  );
  if (!contentPacks?.includes('poetry')) return core;
  const scope = await resolveContentScope(contentPacks);
  if (!scope.packIds.includes('poetry')) return core;
  const poetry = (await searchPoetry(query, Math.max(10, topK * 2))).filter(item => item.score >= threshold);
  const { normalize, topics } = require('../../../shared/content/text.cjs') as { normalize: (text: string) => string; topics: (text: string) => string[] };
  const compact = (text: string) => normalize(text).replace(/[^\p{L}\p{N}]/gu,'');
  const exactQuery = compact(query);
  const intent = topics(query);
  // The same scene evidence adjusts reciprocal ranks in either package. A
  // broad “friend” match must not dilute a supported farewell or departure.
  // Raw vector scores from the different indexes are never compared.
  const support = (labels: string[]) => 1 + (intent.length ? .5 * intent.filter(label => labels.includes(label)).length / intent.length : 0);
  const exact = (row: SearchResult) => compact(row.source) === exactQuery || (exactQuery.length >= 4 && compact(row.text).includes(exactQuery));
  const combined = [
    ...core.map((row, rank) => ({ result: row, exact: exact(row), rank: support(topics(row.source + row.text)) / (60 + rank) })),
    ...poetry.map(({ passage, score }, rank) => ({ result: { id: passage.id, source: passage.source, chapter: passage.chapter, section: passage.section, text: passage.text, score, ...(passage.work ? { work: passage.work } : {}) }, exact: score === .999 || exact({ source: passage.source, text: passage.text } as SearchResult), rank: support(passage.imagery || topics(passage.source + passage.text)) / (60 + rank) })),
  ];
  return combined.sort((a,b) => Number(b.exact)-Number(a.exact) || b.rank-a.rank).slice(0,topK).map(item => item.result);
}
