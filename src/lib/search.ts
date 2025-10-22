import { db } from './db';
import { embeddingService } from './embed';
import { llmService } from './llm';
import { SearchOptions, SearchResult } from '@/types';
import { createHash } from 'crypto';

interface CacheEntry {
  data: SearchResult[];
  timestamp: number;
}

export class SearchService {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5分钟缓存

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // 检查缓存
    if (process.env.KV_CACHE === 'true') {
      const cacheKey = this.getCacheKey(query, options);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        console.log('[Search] Cache hit for query:', query);
        return cached.data;
      }
    }

    const startTime = Date.now();
    console.log('[Search] Searching for:', query);

    try {
      // 生成查询向量
      const queryVector = await embeddingService.embed(query);

      // 如果启用混合搜索，先进行关键词扩展
      let expandedQuery = query;
      if (options.hybrid && process.env.HYBRID_SEARCH === 'true') {
        const expanded = await llmService.expandQuery(query);
        expandedQuery = [...expanded.keywords, ...expanded.semantic_terms].join(' ');
        console.log('[Search] Expanded query:', expandedQuery);
      }

      // 执行向量搜索
      const results = await db.search(queryVector, options);

      // 记录搜索耗时
      const duration = Date.now() - startTime;
      console.log(`[Search] Found ${results.length} results in ${duration}ms`);

      // 缓存结果
      if (process.env.KV_CACHE === 'true') {
        const cacheKey = this.getCacheKey(query, options);
        this.cache.set(cacheKey, {
          data: results,
          timestamp: Date.now()
        });

        // 清理过期缓存
        this.cleanCache();
      }

      return results;
    } catch (error) {
      console.error('[Search] Search failed:', error);
      throw error;
    }
  }

  async hybridSearch(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    // 简化的混合搜索实现
    // 实际应用中可以结合 BM25 算法
    console.log('[Search] Performing hybrid search');

    // 1. 向量搜索
    const vectorResults = await this.search(query, {
      ...options,
      top_k: (options.top_k || 5) * 2
    });

    // 2. 关键词搜索（模拟）
    // 实际应用中可以使用 mini-search 或 lunr.js
    const keywordResults = await this.keywordSearch(query, options);

    // 3. 合并和去重
    const combined = this.mergeResults(vectorResults, keywordResults);

    // 4. 返回 top_k 结果
    return combined.slice(0, options.top_k || 5);
  }

  private async keywordSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // 模拟关键词搜索
    // 实际应用中应该实现真正的 BM25 或其他文本检索算法
    console.log('[Search] Performing keyword search for:', query);

    // 简单的文本匹配（仅用于演示）
    const allResults: SearchResult[] = [];
    // 这里应该实现真正的关键词搜索逻辑

    return allResults;
  }

  private mergeResults(vectorResults: SearchResult[], keywordResults: SearchResult[]): SearchResult[] {
    // 合并两个结果列表，去除重复项
    const seen = new Set<string>();
    const merged: SearchResult[] = [];

    // 优先保留向量搜索结果
    for (const result of vectorResults) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        merged.push(result);
      }
    }

    // 添加关键词搜索结果
    for (const result of keywordResults) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        merged.push({
          ...result,
          score: result.score * 0.8 // 降低关键词搜索结果的权重
        });
      }
    }

    // 按分数排序
    return merged.sort((a, b) => b.score - a.score);
  }

  private getCacheKey(query: string, options: SearchOptions): string {
    const key = {
      query,
      top_k: options.top_k || 5,
      threshold: options.threshold || 0.7,
      hybrid: options.hybrid || false,
      filters: options.filters || {}
    };
    return createHash('md5').update(JSON.stringify(key)).digest('hex');
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
    console.log('[Search] Cache cleared');
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// 导出单例实例
export const searchService = new SearchService();