/**
 * API Route: Text Embedding
 *
 * Generates embeddings for text using BGE-M3 model.
 * Supports both single and batch embedding requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEmbeddingService } from '@/lib/embed';
import { getCacheManager } from '@/lib/cache';
import { cacheUtils } from '@/lib/cache';
import { embedConfig } from '@/lib/config';
import type { EmbedRequest, EmbedResponse, ApiResponse } from '@/types';

// Request schema validation
const EmbedRequestSchema = z.object({
  text: z.string().min(1).max(8000).optional(),
  texts: z.array(z.string().min(1).max(8000)).optional(),
  batch: z.boolean().default(false),
  normalize: z.boolean().default(true),
  precision: z.enum(['float16', 'float32', 'uint8']).default('float32'),
}).refine(
  (data) => {
    if (data.batch) {
      return data.texts && data.texts.length > 0 && data.texts.length <= 32;
    } else {
      return data.text !== undefined;
    }
  },
  {
    message: 'Either "text" for single embedding or "texts" for batch embedding must be provided',
  }
);

// POST /api/embed
export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<EmbedResponse['data']>>> {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Parse and validate request
    const body = await request.json();
    const validated = EmbedRequestSchema.parse(body);

    // Initialize services
    const cache = getCacheManager();
    const embedService = getEmbeddingService();

    // Prepare embed request
    const embedRequest: EmbedRequest = {
      text: validated.text || '',
      batch: validated.batch,
      texts: validated.texts,
      normalize: validated.normalize,
      precision: validated.precision,
    };

    // Check cache for single embedding
    if (!validated.batch) {
      const cacheKey = cacheUtils.generateEmbeddingKey(
        embedRequest.text,
        embedConfig.modelRepo
      );

      const cached = await cache.get<EmbedResponse['data']>(cacheKey);
      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached,
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
            performance: {
              processing_time_ms: Date.now() - startTime,
              cache_hit: true,
            },
          },
        });
      }
    }

    // Initialize embedding service if needed
    await embedService.initialize();

    // Process embedding request
    const result = await embedService.processRequest(embedRequest);

    // Cache single embedding results
    if (!validated.batch && result.success && result.data.vector) {
      const cacheKey = cacheUtils.generateEmbeddingKey(
        embedRequest.text,
        embedConfig.modelRepo
      );
      await cache.set(cacheKey, result.data, 3600); // Cache for 1 hour
    }

    // Return response
    return NextResponse.json({
      success: result.success,
      data: result.data,
      meta: {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        version: 'v1',
        performance: {
          processing_time_ms: Date.now() - startTime,
          cache_hit: false,
        },
      },
    });
  } catch (error) {
    console.error(`[${requestId}] Embed API error:`, error);

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
          message: 'An error occurred while generating embeddings',
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

// GET /api/embed (for model info and stats)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const embedService = getEmbeddingService();
    const cache = getCacheManager();

    switch (action) {
      case 'model': {
        const modelInfo = embedService.getModelInfo();

        return NextResponse.json({
          success: true,
          data: {
            ...modelInfo,
            config: {
              device: embedConfig.device,
              precision: embedConfig.precision,
              max_sequence_length: embedConfig.maxSequenceLength,
              batch_size: embedConfig.batchSize,
            },
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }

      case 'stats': {
        const cacheStats = await cache.getStats();
        const embedStats = embedService.getCacheStats();

        return NextResponse.json({
          success: true,
          data: {
            embedding_service: embedStats,
            cache: cacheStats,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }

      case 'health': {
        const modelInfo = embedService.getModelInfo();

        return NextResponse.json({
          success: true,
          data: {
            status: modelInfo.isInitialized ? 'healthy' : 'unhealthy',
            model: modelInfo.model,
            dimensions: modelInfo.dimensions,
            initialized: modelInfo.isInitialized,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }

      case 'clear-cache': {
        embedService.clearCache();
        await cache.clear();

        return NextResponse.json({
          success: true,
          data: {
            message: 'Embedding cache cleared successfully',
          },
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
            name: 'InfiDao Embedding API',
            version: 'v1',
            model: embedConfig.modelRepo,
            dimensions: embedConfig.dimensions,
            endpoints: {
              'POST /': 'Generate embeddings for text',
              'GET /?action=model': 'Get model information',
              'GET /?action=stats': 'Get service statistics',
              'GET /?action=health': 'Health check',
              'GET /?action=clear-cache': 'Clear embedding cache',
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
    console.error(`[${requestId}] Embed GET error:`, error);

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