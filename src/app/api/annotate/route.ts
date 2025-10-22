/**
 * API Route: Annotation Generation
 *
 * Generates annotations for user notes using LLM.
 * Supports streaming responses for real-time generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLLMManager, llmUtils, annotationPrompts } from '@/lib/llm';
import { getSearchEngine } from '@/lib/search';
import { getCacheManager } from '@/lib/cache';
import { cacheUtils } from '@/lib/cache';
import { v4 as uuidv4 } from 'uuid';
import type { AnnotateRequest, StreamChunk, ApiResponse, Annotation } from '@/types';

// Request schema validation
const AnnotateRequestSchema = z.object({
  note: z.string().min(1).max(2000),
  context: z.string().max(1000).optional(),
  options: z
    .object({
      max_passages: z.number().int().min(1).max(10).default(5),
      threshold: z.number().min(0).max(1).default(0.7),
      include_links: z.boolean().default(true),
      style: z.enum(['academic', 'poetic', 'modern', 'classical']).default('modern'),
    })
    .optional(),
});

// POST /api/annotate
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Check if client wants streaming
    const acceptHeader = request.headers.get('accept');
    const wantsStreaming = acceptHeader?.includes('text/event-stream');

    // Parse and validate request
    const body = await request.json();
    const validated = AnnotateRequestSchema.parse(body);

    if (wantsStreaming) {
      // Return streaming response
      return new Response(
        createAnnotationStream(validated, requestId),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    } else {
      // Return non-streaming response
      const result = await generateAnnotation(validated, requestId);

      return NextResponse.json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          request_id: requestId,
          version: 'v1',
        },
      });
    }
  } catch (error) {
    console.error(`[${requestId}] Annotation API error:`, error);

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
          message: 'An error occurred while generating annotations',
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

// Create streaming response for annotation generation
async function* createAnnotationStream(
  request: AnnotateRequest,
  requestId: string
): AsyncGenerator<string, void, unknown> {
  try {
    // Send initial chunk
    yield formatSSEChunk({
      type: 'meta',
      data: {
        status: 'starting',
        request_id: requestId,
      },
    });

    // Initialize services
    const llmManager = getLLMManager();
    const searchEngine = getSearchEngine();
    const cache = getCacheManager();

    // Check cache first
    const cacheKey = cacheUtils.generateAnnotationKey(request.note, request.context);
    const cached = await cache.get<any>(cacheKey);

    if (cached) {
      yield formatSSEChunk({
        type: 'chunk',
        data: cached,
        chunk_id: uuidv4(),
        sequence: 0,
      });

      yield formatSSEChunk({
        type: 'end',
        data: {
          status: 'completed',
          cached: true,
        },
      });

      return;
    }

    // Step 1: Search for related passages
    yield formatSSEChunk({
      type: 'meta',
      data: {
        status: 'searching',
        message: 'Searching for related passages...',
      },
    });

    const searchResults = await searchEngine.search({
      query: request.note,
      top_k: request.options?.max_passages || 5,
      threshold: request.options?.threshold || 0.7,
      hybrid: true,
    });

    yield formatSSEChunk({
      type: 'meta',
      data: {
        status: 'found_passages',
        count: searchResults.length,
      },
    });

    // Step 2: Generate annotation with LLM
    yield formatSSEChunk({
      type: 'meta',
      data: {
        status: 'generating',
        message: 'Generating annotation...',
      },
    });

    const style = request.options?.style || 'modern';
    const prompt = annotationPrompts.userPromptTemplate(request.note, request.context);
    const systemPrompt = `${annotationPrompts.systemPrompt}\n\n风格要求：${getStyleDescription(style)}`;

    // Stream LLM response
    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of llmManager.stream(prompt, {
      systemPrompt,
      maxTokens: 2000,
      temperature: 0.7,
    })) {
      fullResponse += chunk;
      chunkCount++;

      yield formatSSEChunk({
        type: 'chunk',
        data: chunk,
        chunk_id: uuidv4(),
        sequence: chunkCount,
      });
    }

    // Step 3: Parse and format the response
    yield formatSSEChunk({
      type: 'meta',
      data: {
        status: 'processing',
        message: 'Processing response...',
      },
    });

    const annotation = llmUtils.extractJSON(fullResponse);

    if (annotation) {
      // Add search results to annotation
      annotation.search_results = searchResults;

      // Cache the result
      await cache.set(cacheKey, annotation, 1800); // Cache for 30 minutes

      // Send final annotation
      yield formatSSEChunk({
        type: 'annotation',
        data: annotation,
      });
    }

    // Send completion signal
    yield formatSSEChunk({
      type: 'end',
      data: {
        status: 'completed',
        chunks_sent: chunkCount,
      },
    });
  } catch (error) {
    console.error('Streaming annotation error:', error);

    yield formatSSEChunk({
      type: 'error',
      data: {
        code: 'GENERATION_ERROR',
        message: 'Failed to generate annotation',
      },
    });

    yield formatSSEChunk({
      type: 'end',
      data: {
        status: 'error',
      },
    });
  }
}

// Generate annotation (non-streaming version)
async function generateAnnotation(
  request: AnnotateRequest,
  requestId: string
): Promise<any> {
  // Initialize services
  const searchEngine = getSearchEngine();
  const cache = getCacheManager();

  // Check cache first
  const cacheKey = cacheUtils.generateAnnotationKey(request.note, request.context);
  const cached = await cache.get<any>(cacheKey);

  if (cached) {
    return cached;
  }

  // Search for related passages
  const searchResults = await searchEngine.search({
    query: request.note,
    top_k: request.options?.max_passages || 5,
    threshold: request.options?.threshold || 0.7,
    hybrid: true,
  });

  // Generate annotation
  const annotation = await llmUtils.generateAnnotation(
    request.note,
    request.context,
    request.options?.style || 'modern'
  );

  // Add search results
  if (annotation) {
    annotation.search_results = searchResults;

    // Cache the result
    await cache.set(cacheKey, annotation, 1800); // Cache for 30 minutes
  }

  return annotation;
}

// Format Server-Sent Event chunk
function formatSSEChunk(chunk: StreamChunk): string {
  const lines = [
    `event: ${chunk.type}`,
    `data: ${JSON.stringify(chunk)}`,
    '',
    '',
  ];

  return lines.join('\n');
}

// Get style description for LLM
function getStyleDescription(style: string): string {
  const descriptions = {
    academic: '使用学术性的语言风格进行分析，引用经典，论证严谨',
    poetic: '使用诗意的语言风格进行表达，文字优美，富有意境',
    modern: '使用现代易懂的语言风格，贴近生活，易于理解',
    classical: '使用文言文风格进行解释，言简意赅，古韵盎然',
  };

  return descriptions[style as keyof typeof descriptions] || descriptions.modern;
}

// GET /api/annotate (for API info and stats)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    switch (action) {
      case 'health': {
        const availability = await llmUtils.checkLLMAvailability();

        return NextResponse.json({
          success: true,
          data: {
            status: availability.available ? 'healthy' : 'unhealthy',
            llm_providers: availability.providers,
            active_provider: availability.activeProvider,
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: requestId,
            version: 'v1',
          },
        });
      }

      case 'providers': {
        const availability = await llmUtils.checkLLMAvailability();

        return NextResponse.json({
          success: true,
          data: availability,
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
            name: 'InfiDao Annotation API',
            version: 'v1',
            description: 'Generate annotations for notes using LLM',
            features: [
              'Streaming responses',
              'Multiple output styles',
              'Related passage discovery',
              'Response caching',
            ],
            styles: ['academic', 'poetic', 'modern', 'classical'],
            endpoints: {
              'POST /': 'Generate annotation (supports streaming)',
              'GET /?action=health': 'Health check',
              'GET /?action=providers': 'List available LLM providers',
            },
            usage: {
              'Non-streaming': 'POST with Content-Type: application/json',
              'Streaming': 'POST with Accept: text/event-stream',
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
    console.error(`[${requestId}] Annotation GET error:`, error);

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