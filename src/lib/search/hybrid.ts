/**
 * Hybrid Search Implementation
 *
 * Implements hybrid search combining vector similarity and BM25 text search
 * with intelligent result merging and caching.
 */

import type { DatabaseConnection } from '../db/connection';
import type { Passage } from '../db/schema';
import { L1Cache, L2Cache } from '../cache/manager';
import crypto from 'crypto';

export interface SearchOptions {
  query: string;
  topK?: number;
  threshold?: number;
  hybrid?: boolean;
  filters?: {
    book?: string[];
    chapter?: string[];
  };
  weights?: {
    vector?: number;
    bm25?: number;
  };
}

export interface SearchResult {
  id: string;
  book: string;
  chapter: string;
  section: number;
  text: string;
  score: number;
  metadata: {
    similarity_score: number;
    bm25_score: number;
    matched_terms: string[];
  };
}

export interface ExpandedQuery {
  original: string;
  keywords: string[];
  semantic_terms: string[];
  synonyms: string[];
}

export class HybridSearchEngine {
  constructor(
    private db: DatabaseConnection,
    private l1Cache: L1Cache,
    private l2Cache: L2Cache,
    private embeddingService: EmbeddingService,
    private llmService: LLMService
  ) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    // 1. Generate cache key
    const cacheKey = this.generateCacheKey(options);

    // 2. Check cache
    const cached = await this.checkCache(cacheKey);
    if (cached) {
      console.log('Cache hit for query:', options.query);
      return cached;
    }

    // 3. Expand query if needed
    const expandedQuery = await this.expandQuery(options.query);

    // 4. Perform searches in parallel
    const searchPromises: Promise<ScoredResult[]>[] = [];

    // Vector search
    searchPromises.push(this.vectorSearch(options, expandedQuery));

    // BM25 search if hybrid
    if (options.hybrid !== false) {
      searchPromises.push(this.bm25Search(options, expandedQuery));
    }

    // 5. Wait for all searches
    const results = await Promise.all(searchPromises);

    // 6. Merge and rank results
    const mergedResults = this.mergeResults(
      results[0], // Vector results
      results[1] || [], // BM25 results
      options.weights || { vector: 0.7, bm25: 0.3 }
    );

    // 7. Apply filters
    const filteredResults = this.applyFilters(mergedResults, options.filters);

    // 8. Apply topK and threshold
    const finalResults = filteredResults
      .filter(r => r.score >= (options.threshold || 0.7))
      .slice(0, options.topK || 5);

    // 9. Cache results
    await this.cacheResults(cacheKey, finalResults);

    return finalResults;
  }

  private async vectorSearch(
    options: SearchOptions,
    expandedQuery: ExpandedQuery
  ): Promise<ScoredResult[]> {
    try {
      // Get or generate embedding for the query
      const queryEmbedding = await this.embeddingService.getEmbedding(
        expandedQuery.original
      );

      // Perform vector search
      const vectorResults = await this.db.vectorSearch(queryEmbedding, {
        limit: options.topK ? options.topK * 2 : 10,
        threshold: (options.threshold || 0.7) * 0.8, // Lower threshold for recall
        filter: this.buildFilterString(options.filters),
      });

      return vectorResults.map(r => ({
        id: r.item.id,
        item: r.item,
        score: r.score,
        source: 'vector',
      }));
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }

  private async bm25Search(
    options: SearchOptions,
    expandedQuery: ExpandedQuery
  ): Promise<ScoredResult[]> {
    try {
      // Extract keywords from expanded query
      const keywords = [
        ...expandedQuery.keywords,
        ...expandedQuery.semantic_terms,
        ...expandedQuery.synonyms,
      ].slice(0, 5); // Limit to top 5 keywords

      // Simple text search implementation
      // In production, use proper BM25 library like lunr.js or fuse.js
      const passagesTable = await this.db.getTable('passages');
      const searchTerms = keywords.join(' | ');

      let filterQuery = `text ILIKE '%${keywords.join("%' AND text ILIKE '%")}%'`;

      if (options.filters?.book?.length) {
        const bookFilter = options.filters.book.map(b => `book = '${b}'`).join(' OR ');
        filterQuery += ` AND (${bookFilter})`;
      }

      if (options.filters?.chapter?.length) {
        const chapterFilter = options.filters.chapter
          .map(c => `chapter = '${c}'`)
          .join(' OR ');
        filterQuery += ` AND (${chapterFilter})`;
      }

      const results = await passagesTable.search().where(filterQuery).execute();

      // Calculate BM25 scores (simplified)
      return results.slice(0, options.topK ? options.topK * 2 : 10).map(r => ({
        id: r.id,
        item: r,
        score: this.calculateBM25Score(r.text, keywords),
        source: 'bm25',
      }));
    } catch (error) {
      console.error('BM25 search failed:', error);
      return [];
    }
  }

  private mergeResults(
    vectorResults: ScoredResult[],
    bm25Results: ScoredResult[],
    weights: { vector: number; bm25: number }
  ): SearchResult[] {
    const resultMap = new Map<string, ScoredResult>();

    // Process vector results
    vectorResults.forEach(r => {
      resultMap.set(r.id, {
        ...r,
        vectorScore: r.score,
        bm25Score: 0,
      });
    });

    // Process BM25 results
    bm25Results.forEach(r => {
      const existing = resultMap.get(r.id);
      if (existing) {
        // Merge scores
        existing.vectorScore = existing.vectorScore || 0;
        existing.bm25Score = r.score;
      } else {
        resultMap.set(r.id, {
          ...r,
          vectorScore: 0,
          bm25Score: r.score,
        });
      }
    });

    // Calculate final scores and format results
    return Array.from(resultMap.values())
      .map(r => {
        const finalScore = (r.vectorScore * weights.vector) + (r.bm25Score * weights.bm25);
        return {
          id: r.item.id,
          book: r.item.book,
          chapter: r.item.chapter,
          section: r.item.section,
          text: r.item.text,
          score: finalScore,
          metadata: {
            similarity_score: r.vectorScore,
            bm25_score: r.bm25Score,
            matched_terms: [], // Could be populated from search results
          },
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private applyFilters(
    results: SearchResult[],
    filters?: SearchOptions['filters']
  ): SearchResult[] {
    if (!filters) return results;

    return results.filter(r => {
      if (filters.book && !filters.book.includes(r.book)) return false;
      if (filters.chapter && !filters.chapter.includes(r.chapter)) return false;
      return true;
    });
  }

  private async expandQuery(query: string): Promise<ExpandedQuery> {
    // Check cache first
    const cacheKey = `query_expand:${crypto.createHash('md5').update(query).digest('hex')}`;

    // Try L1 cache
    let cached = this.l1Cache.get(cacheKey);
    if (cached) return cached;

    // Try L2 cache
    cached = await this.l2Cache.get(cacheKey);
    if (cached) {
      this.l1Cache.set(cacheKey, cached);
      return cached;
    }

    // Generate expansion using LLM
    const prompt = `
      扩展搜索查询，提供相关关键词和概念：
      原查询：${query}

      返回JSON格式：
      {
        "original": "${query}",
        "keywords": ["关键词1", "关键词2"],
        "semantic_terms": ["概念1", "概念2"],
        "synonyms": ["同义词1", "同义词2"]
      }
    `;

    try {
      const result = await this.llmService.complete(prompt);
      const expanded: ExpandedQuery = JSON.parse(result);

      // Cache result
      this.l1Cache.set(cacheKey, expanded);
      await this.l2Cache.set(cacheKey, expanded, { ttl: 3600 }); // 1 hour

      return expanded;
    } catch (error) {
      console.error('Query expansion failed:', error);
      // Return basic expansion
      return {
        original: query,
        keywords: [query],
        semantic_terms: [],
        synonyms: [],
      };
    }
  }

  private buildFilterString(filters?: SearchOptions['filters']): string | undefined {
    if (!filters) return undefined;

    const conditions: string[] = [];

    if (filters.book?.length) {
      conditions.push(
        `book IN (${filters.book.map(b => `'${b}'`).join(', ')})`
      );
    }

    if (filters.chapter?.length) {
      conditions.push(
        `chapter IN (${filters.chapter.map(c => `'${c}'`).join(', ')})`
      );
    }

    return conditions.length > 0 ? conditions.join(' AND ') : undefined;
  }

  private calculateBM25Score(text: string, keywords: string[]): number {
    // Simplified BM25 score calculation
    // In production, use proper BM25 implementation
    let score = 0;
    const textLower = text.toLowerCase();

    keywords.forEach(keyword => {
      if (textLower.includes(keyword.toLowerCase())) {
        score += 1 / (1 + Math.log(1 + text.length / 100));
      }
    });

    return Math.min(score / keywords.length, 1);
  }

  private generateCacheKey(options: SearchOptions): string {
    const key = {
      q: options.query,
      k: options.topK || 5,
      t: options.threshold || 0.7,
      h: options.hybrid !== false,
      f: options.filters || {},
      w: options.weights || { vector: 0.7, bm25: 0.3 },
    };

    return `search:${crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex')}`;
  }

  private async checkCache(cacheKey: string): Promise<SearchResult[] | null> {
    // Try L1 cache
    const l1Result = this.l1Cache.get(cacheKey);
    if (l1Result) return l1Result;

    // Try L2 cache
    const l2Result = await this.l2Cache.get(cacheKey);
    if (l2Result) {
      this.l1Cache.set(cacheKey, l2Result);
      return l2Result;
    }

    return null;
  }

  private async cacheResults(cacheKey: string, results: SearchResult[]): Promise<void> {
    // Cache in L1
    this.l1Cache.set(cacheKey, results);

    // Cache in L2 with TTL
    await this.l2Cache.set(cacheKey, results, { ttl: 1800 }); // 30 minutes
  }
}

// Supporting interfaces
interface ScoredResult {
  id: string;
  item: Passage;
  score: number;
  source: 'vector' | 'bm25';
  vectorScore?: number;
  bm25Score?: number;
}

// Service interfaces (to be implemented)
interface EmbeddingService {
  getEmbedding(text: string): Promise<Float32Array>;
}

interface LLMService {
  complete(prompt: string): Promise<string>;
}