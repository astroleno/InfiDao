/**
 * Hybrid Search Service
 *
 * Implements semantic search with vector similarity,
 * BM25 full-text search, and query expansion.
 */

import { getDatabaseConnection } from '@/lib/db';
import { getEmbeddingService } from '@/lib/embed';
import { getLLMManager } from '@/lib/llm';
import { searchConfig } from '@/lib/config';
import { embedUtils } from '@/lib/embed';
import type {
  SearchRequest,
  SearchResult,
  SearchOptions,
  SearchFilters,
  SearchWeights,
  VectorSimilarityResult,
  BM25Result,
  Passage
} from '@/types';

// Search Engine class
export class HybridSearchEngine {
  private db = getDatabaseConnection();
  private embeddingService = getEmbeddingService();
  private llmManager = getLLMManager();

  // Main search method
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const startTime = Date.now();

    try {
      // Validate request
      const options = this.validateAndNormalizeRequest(request);

      // Query expansion if enabled
      let expandedQueries: string[] = [options.query];
      if (options.expandQuery) {
        expandedQueries = await this.expandQuery(options.query);
      }

      // Perform searches for each query variant
      const allResults: SearchResult[] = [];

      for (const query of expandedQueries) {
        const results = await this.performSearch(query, options);
        allResults.push(...results);
      }

      // Merge and rank results
      const mergedResults = await this.mergeResults(allResults, options);

      // Apply final threshold
      const filteredResults = mergedResults.filter(
        result => result.score >= options.threshold
      );

      // Return top K results
      const topKResults = filteredResults.slice(0, options.topK);

      // Add search metadata
      const queryTime = Date.now() - startTime;
      console.log(`Search completed in ${queryTime}ms, found ${topKResults.length} results`);

      return topKResults;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  // Validate and normalize search request
  private validateAndNormalizeRequest(request: SearchRequest): SearchOptions {
    return {
      query: request.query.trim(),
      topK: Math.min(request.top_k || searchConfig.defaultTopK, 20),
      threshold: Math.max(Math.min(request.threshold || searchConfig.defaultThreshold, 1), 0),
      hybrid: request.hybrid !== false,
      filters: request.filters || {},
      weights: {
        vector: request.weights?.vector || searchConfig.weights.vector,
        bm25: request.weights?.bm25 || searchConfig.weights.bm25,
        semantic: request.weights?.semantic || searchConfig.weights.semantic,
      },
      rerank: request.rerank !== false,
      expandQuery: request.expand_query !== false,
    };
  }

  // Perform search for a single query
  private async performSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Vector similarity search
    const vectorResults = await this.vectorSearch(query, options);
    results.push(...vectorResults);

    // BM25 full-text search
    if (options.hybrid) {
      const bm25Results = await this.fullTextSearch(query, options);
      results.push(...bm25Results);
    }

    return results;
  }

  // Vector similarity search
  private async vectorSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    try {
      // Generate query embedding
      const queryVector = await this.embeddingService.embed(query);

      // Perform vector search
      const vectorResults = await this.db.vectorSearch(
        queryVector,
        options.topK * 2, // Get more results for better merging
        options.threshold * 0.8, // Lower threshold for intermediate results
        options.filters
      );

      // Transform to SearchResult format
      const searchResults: SearchResult[] = vectorResults.map(result => ({
        id: result.id,
        text: result.passage.text,
        source: result.passage.source,
        chapter: result.passage.chapter,
        section: result.passage.section,
        score: result.score,
        similarity_score: result.score,
        bm25_score: 0, // Will be filled during merging
        metadata: {
          ...result.passage.metadata,
          highlighted_text: this.highlightTerms(result.passage.text, query),
        },
      }));

      return searchResults;
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }

  // Full-text search (BM25-like)
  private async fullTextSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    try {
      // Perform full-text search
      const bm25Results = await this.db.fullTextSearch(
        query,
        options.topK * 2,
        options.filters
      );

      // Transform to SearchResult format
      const searchResults: SearchResult[] = bm25Results.map(result => ({
        id: result.id,
        text: result.passage.text,
        source: result.passage.source,
        chapter: result.passage.chapter,
        section: result.passage.section,
        score: result.score,
        similarity_score: 0, // Will be filled during merging
        bm25_score: result.score,
        metadata: {
          ...result.passage.metadata,
          highlighted_text: this.highlightTerms(result.passage.text, ...result.matched_terms),
          matched_terms: result.matched_terms,
        },
      }));

      return searchResults;
    } catch (error) {
      console.error('Full-text search failed:', error);
      return [];
    }
  }

  // Merge results from different search methods
  private async mergeResults(
    results: SearchResult[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // Group results by ID
    const groupedResults = new Map<string, SearchResult>();

    for (const result of results) {
      const existing = groupedResults.get(result.id);

      if (!existing) {
        groupedResults.set(result.id, { ...result });
      } else {
        // Merge scores
        if (result.similarity_score && existing.similarity_score) {
          existing.similarity_score = Math.max(existing.similarity_score, result.similarity_score);
        } else if (result.similarity_score) {
          existing.similarity_score = result.similarity_score;
        }

        if (result.bm25_score && existing.bm25_score) {
          existing.bm25_score = Math.max(existing.bm25_score, result.bm25_score);
        } else if (result.bm25_score) {
          existing.bm25_score = result.bm25_score;
        }

        // Merge metadata
        if (result.metadata) {
          existing.metadata = {
            ...existing.metadata,
            ...result.metadata,
          };
        }
      }
    }

    // Calculate final scores
    const mergedResults = Array.from(groupedResults.values()).map(result => {
      const vectorScore = result.similarity_score || 0;
      const bm25Score = result.bm25_score || 0;

      const finalScore = embedUtils.calculateRelevanceScore(
        vectorScore,
        bm25Score,
        options.weights
      );

      return {
        ...result,
        score: finalScore,
      };
    });

    // Sort by score
    mergedResults.sort((a, b) => b.score - a.score);

    // Rerank if enabled
    if (options.rerank && mergedResults.length > 1) {
      return await this.rerankResults(mergedResults, options.query);
    }

    return mergedResults;
  }

  // Rerank results using cross-encoder or LLM
  private async rerankResults(results: SearchResult[], query: string): Promise<SearchResult[]> {
    try {
      // For now, use simple LLM-based reranking
      // In production, you might use a cross-encoder model

      const topResults = results.slice(0, 10); // Only rerank top 10
      const prompt = this.buildRerankingPrompt(query, topResults);

      const response = await this.llmManager.complete(prompt, {
        maxTokens: 500,
        temperature: 0.1, // Low temperature for consistent ranking
      });

      // Extract ranking from response
      const ranking = this.extractRankingFromResponse(response.content);

      // Apply new ranking
      const rerankedResults = [...topResults];
      ranking.forEach((originalIndex, newPosition) => {
        if (originalIndex < rerankedResults.length) {
          rerankedResults[newPosition] = topResults[originalIndex];
        }
      });

      // Combine with remaining results
      return [...rerankedResults, ...results.slice(10)];
    } catch (error) {
      console.error('Reranking failed:', error);
      // Return original results if reranking fails
      return results;
    }
  }

  // Build prompt for LLM-based reranking
  private buildRerankingPrompt(query: string, results: SearchResult[]): string {
    const resultsText = results
      .map((result, index) => `[${index}] ${result.source} ${result.chapter}: ${result.text.substring(0, 100)}...`)
      .join('\n');

    return `请根据查询内容对以下搜索结果进行重新排序。

查询：${query}

搜索结果：
${resultsText}

请只返回一个数字列表，表示重新排序后的索引顺序，例如：[2, 0, 4, 1, 3]

排序：`;
  }

  // Extract ranking from LLM response
  private extractRankingFromResponse(response: string): number[] {
    try {
      // Try to extract array from response
      const match = response.match(/\[([\d,\s]+)\]/);
      if (match) {
        return match[1].split(',').map(n => parseInt(n.trim()));
      }
    } catch {
      // Ignore parsing errors
    }

    // Return default order if parsing fails
    return Array.from({ length: 10 }, (_, i) => i);
  }

  // Expand query using LLM
  private async expandQuery(query: string): Promise<string[]> {
    try {
      const prompt = `请为以下查询生成3个语义相似的扩展查询，用于搜索中国古典文献。

原始查询：${query}

扩展查询（每行一个）：`;

      const response = await this.llmManager.complete(prompt, {
        maxTokens: 200,
        temperature: 0.5,
      });

      // Extract expanded queries
      const expanded = response.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.match(/^\d+[\.\)]/))
        .slice(0, searchConfig.queryExpansion.maxExpansions);

      return [query, ...expanded];
    } catch (error) {
      console.error('Query expansion failed:', error);
      return [query];
    }
  }

  // Highlight search terms in text
  private highlightTerms(text: string, ...terms: string[]): string {
    if (!terms || terms.length === 0) {
      return text;
    }

    let highlighted = text;
    terms.forEach(term => {
      if (term && term.length > 0) {
        const regex = new RegExp(`(${term})`, 'gi');
        highlighted = highlighted.replace(regex, '**$1**');
      }
    });

    return highlighted;
  }

  // Get search suggestions
  async getSearchSuggestions(query: string, limit: number = 5): Promise<string[]> {
    try {
      // Simple implementation using popular queries
      // In production, you might use query logs or analytics
      const suggestions = [
        '仁义礼智信',
        '修身齐家治国平天下',
        '天人合一',
        '中庸之道',
        '格物致知',
        '知行合一',
        '温故知新',
        '教学相长',
        '君子和而不同',
        '大道至简',
      ];

      return suggestions
        .filter(suggestion => suggestion.includes(query))
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      return [];
    }
  }

  // Get similar passages
  async getSimilarPassages(passageId: string, limit: number = 5): Promise<SearchResult[]> {
    try {
      // Get the original passage
      const passage = await this.db.getPassageById(passageId);
      if (!passage) {
        return [];
      }

      // Search for similar passages
      const results = await this.search({
        query: passage.text.substring(0, 200), // Use first 200 chars as query
        top_k: limit,
        threshold: 0.6,
        hybrid: true,
      });

      // Filter out the original passage
      return results.filter(result => result.id !== passageId);
    } catch (error) {
      console.error('Failed to get similar passages:', error);
      return [];
    }
  }
}

// Export functions
export function getSearchEngine(): HybridSearchEngine {
  return new HybridSearchEngine();
}

// Search utilities
export const searchUtils = {
  // Calculate search relevance metrics
  calculateMetrics(results: SearchResult[], queryTime: number): {
    precision: number;
    recall: number;
    f1Score: number;
    avgScore: number;
    responseTime: number;
  } {
    if (results.length === 0) {
      return {
        precision: 0,
        recall: 0,
        f1Score: 0,
        avgScore: 0,
        responseTime: queryTime,
      };
    }

    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const highQualityResults = results.filter(r => r.score > 0.8).length;
    const precision = highQualityResults / results.length;

    // Simplified recall calculation (would need ground truth for accurate recall)
    const recall = Math.min(precision * 1.2, 1);
    const f1Score = (2 * precision * recall) / (precision + recall);

    return {
      precision,
      recall,
      f1Score,
      avgScore,
      responseTime: queryTime,
    };
  },

  // Extract search facets from results
  extractFacets(results: SearchResult[]): {
    sources: { [key: string]: number };
    chapters: { [source: string]: { [chapter: string]: number } };
  } {
    const sources: { [key: string]: number } = {};
    const chapters: { [source: string]: { [chapter: string]: number } } = {};

    results.forEach(result => {
      // Count sources
      sources[result.source] = (sources[result.source] || 0) + 1;

      // Count chapters per source
      if (!chapters[result.source]) {
        chapters[result.source] = {};
      }
      chapters[result.source][result.chapter] = (chapters[result.source][result.chapter] || 0) + 1;
    });

    return { sources, chapters };
  },

  // Generate search explanation
  generateExplanation(
    query: string,
    results: SearchResult[],
    options: SearchOptions
  ): string {
    const hasVector = results.some(r => r.similarity_score && r.similarity_score > 0);
    const hasBM25 = results.some(r => r.bm25_score && r.bm25_score > 0);

    let explanation = `搜索查询："${query}"\n\n`;
    explanation += `找到 ${results.length} 个相关结果`;

    if (hasVector && hasBM25) {
      explanation += '（结合语义搜索和全文搜索）';
    } else if (hasVector) {
      explanation += '（基于语义相似度）';
    } else if (hasBM25) {
      explanation += '（基于关键词匹配）';
    }

    if (options.filters && Object.keys(options.filters).length > 0) {
      explanation += `\n\n应用了筛选条件：`;
      Object.entries(options.filters).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          explanation += `\n- ${key}: ${value.join(', ')}`;
        }
      });
    }

    return explanation;
  },
};