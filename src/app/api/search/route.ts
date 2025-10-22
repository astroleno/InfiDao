/**
 * API Route: Semantic Search
 *
 * Handles semantic search queries against the Six Classics database.
 * Supports hybrid search (vector + BM25), filtering, and caching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDatabaseConnection } from '@/lib/db';
import { getSearchEngine } from '@/lib/search';
import { getCacheManager } from '@/lib/cache';
import { cacheUtils } from '@/lib/cache';
import type { SearchRequest, SearchResult, ApiResponse } from '@/types';

// Request schema validation
const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  top_k: z.number().int().min(1).max(20).default(5),
  threshold: z.number().min(0).max(1).default(0.7),
  hybrid: z.boolean().default(true),
  filters: z
    .object({
      book: z.array(z.string()).optional(),
      chapter: z.array(z.string()).optional(),
      section_range: z.tuple([z.number(), z.number()]).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  weights: z
    .object({
      vector: z.number().min(0).max(1).default(0.7),
      bm25: z.number().min(0).max(1).default(0.3),
      semantic: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
  rerank: z.boolean().default(true),
  expand_query: z.boolean().default(true),
});

// POST /api/search
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<SearchResult[]>>> {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Parse and validate request
    const body = await request.json();
    const validated = SearchRequestSchema.parse(body);

    // Initialize cache
    const cache = getCacheManager();

    // Generate cache key
    const cacheKey = cacheUtils.generateSearchKey(validated);

    // Check cache first
    const cached = await cache.get<{
      results: SearchResult[];
      meta: { query_time_ms: number; cache_hit: boolean };
    }>(cacheKey);

    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached.results,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: requestId,
          version: 'v1',
        },
      });
    }

    // Initialize database connection
    const db = getDatabaseConnection();
    await db.connect();

    // Initialize search engine
    const searchEngine = getSearchEngine();

    // Perform search
    const results = await searchEngine.search(validated as SearchRequest);

    const queryTime = Date.now() - startTime;

    // Cache the results
    await cache.set(cacheKey, {
      results,
      meta: {
        query_time_ms: queryTime,
        cache_hit: false,
      },
    }, 300); // Cache for 5 minutes

    // Return success response
    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        version: 'v1',
        performance: {
          query_time_ms: queryTime,
          cache_hit: false,
          results_count: results.length,
        },
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Search API error:`, error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        },
        { status: 400 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while processing your search request',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: requestId,
          version: 'v1',
        },
      },
      { status: 500 }
    );
  }
}

// GET /api/search (for health check and suggestions)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    switch (action) {
      case 'health': {
        const db = getDatabaseConnection();
        const isHealthy = await db.healthCheck();

        const cache = getCacheManager();
        const cacheStats = await cache.getStats();

        return NextResponse.json({
          success: true,
          data: {
            status: isHealthy ? 'healthy' : 'unhealthy',
            services: {
              database: {
                status: isHealthy ? 'up' : 'down',
                last_check: new Date().toISOString(),
              },
              cache: {
                status: 'up',
                hit_rate: cacheStats.overall.hitRate,
                last_check: new Date().toISOString(),
              },
            },
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }

      case 'suggestions': {
        const query = searchParams.get('q');
        if (!query) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'MISSING_QUERY',
                message: 'Query parameter "q" is required',
              },
            },
            { status: 400 }
          );
        }

        const searchEngine = getSearchEngine();
        const suggestions = await searchEngine.getSearchSuggestions(query);

        return NextResponse.json({
          success: true,
          data: suggestions,
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }

      case 'similar': {
        const passageId = searchParams.get('id');
        const limit = parseInt(searchParams.get('limit') || '5');

        if (!passageId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'MISSING_ID',
                message: 'Passage ID parameter "id" is required',
              },
            },
            { status: 400 }
          );
        }

        const searchEngine = getSearchEngine();
        const similar = await searchEngine.getSimilarPassages(passageId, limit);

        return NextResponse.json({
          success: true,
          data: similar,
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }

      default: {
        // Default: return API info
        return NextResponse.json({
          success: true,
          data: {
            name: 'InfiDao Search API',
            version: 'v1',
            endpoints: {
              'POST /': 'Perform semantic search',
              'GET /?action=health': 'Health check',
              'GET /?action=suggestions&q=<query>': 'Get search suggestions',
              'GET /?action=similar&id=<passageId>': 'Get similar passages',
            },
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }
    }
  } catch (error) {
    console.error(`[${requestId}] Search GET error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred while processing your request',
        },
        meta: {
          timestamp: new Date().toISOString(),
          request_id: requestId,
          version: 'v1',
        },
      },
      { status: 500 }
    );
  }
}