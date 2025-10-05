/**
 * API Route: Health Check
 *
 * Comprehensive health check endpoint that monitors all services
 * including database, embedding model, LLM providers, and cache.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabaseConnection } from '@/lib/db';
import { getEmbeddingService } from '@/lib/embed';
import { getLLMManager, llmUtils } from '@/lib/llm';
import { getCacheManager } from '@/lib/cache';
import { apiConfig, embeddingConfig } from '@/lib/config';
import type { HealthCheckResponse, ServiceStatus } from '@/types';

// GET /api/health
export async function GET(request: NextRequest): Promise<NextResponse<HealthCheckResponse>> {
  const startTime = Date.now();
  const requestId = `health_${Date.now()}`;

  try {
    // Initialize service status tracking
    const services: {
      database: ServiceStatus;
      embedding: ServiceStatus;
      llm: ServiceStatus;
      cache: ServiceStatus;
    } = {
      database: {
        status: 'down',
        last_check: new Date().toISOString(),
      },
      embedding: {
        status: 'down',
        last_check: new Date().toISOString(),
      },
      llm: {
        status: 'down',
        last_check: new Date().toISOString(),
      },
      cache: {
        status: 'down',
        last_check: new Date().toISOString(),
      },
    };

    let healthyServices = 0;
    const totalServices = 4;

    // Check Database
    try {
      const db = getDatabaseConnection();
      const dbStartTime = Date.now();
      const isHealthy = await db.healthCheck();
      const responseTime = Date.now() - dbStartTime;

      services.database = {
        status: isHealthy ? 'up' : 'down',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
      };

      if (isHealthy) healthyServices++;
    } catch (error) {
      services.database = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
        last_check: new Date().toISOString(),
      };
    }

    // Check Embedding Service
    try {
      const embedService = getEmbeddingService();
      const embedStartTime = Date.now();
      const modelInfo = embedService.getModelInfo();
      const responseTime = Date.now() - embedStartTime;

      if (modelInfo.isInitialized) {
        services.embedding = {
          status: 'up',
          response_time_ms: responseTime,
          last_check: new Date().toISOString(),
        };
        healthyServices++;
      } else {
        services.embedding = {
          status: 'down',
          error: 'Model not initialized',
          last_check: new Date().toISOString(),
        };
      }
    } catch (error) {
      services.embedding = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
        last_check: new Date().toISOString(),
      };
    }

    // Check LLM Service
    try {
      const llmStartTime = Date.now();
      const availability = await llmUtils.checkLLMAvailability();
      const responseTime = Date.now() - llmStartTime;

      if (availability.available) {
        services.llm = {
          status: 'up',
          response_time_ms: responseTime,
          last_check: new Date().toISOString(),
        };
        healthyServices++;
      } else {
        services.llm = {
          status: 'down',
          error: 'No LLM providers configured',
          last_check: new Date().toISOString(),
        };
      }
    } catch (error) {
      services.llm = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
        last_check: new Date().toISOString(),
      };
    }

    // Check Cache Service
    try {
      const cache = getCacheManager();
      const cacheStartTime = Date.now();
      const stats = await cache.getStats();
      const responseTime = Date.now() - cacheStartTime;

      services.cache = {
        status: 'up',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
      };
      healthyServices++;
    } catch (error) {
      services.cache = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
        last_check: new Date().toISOString(),
      };
    }

    // Determine overall status
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (healthyServices === totalServices) {
      overallStatus = 'healthy';
    } else if (healthyServices >= totalServices / 2) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    // Get additional system info
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    // Build health check response
    const healthResponse: HealthCheckResponse = {
      status: overallStatus,
      services,
      version: apiConfig.version,
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
    };

    // Add performance metrics if requested
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';

    if (detailed) {
      const db = getDatabaseConnection();
      const embedService = getEmbeddingService();
      const cache = getCacheManager();

      // Get detailed stats
      const [dbStats, embedStats, cacheStats] = await Promise.allSettled([
        db.getStatistics().catch(() => null),
        Promise.resolve(embedService.getCacheStats()),
        cache.getStats(),
      ]);

      return NextResponse.json({
        ...healthResponse,
        system: {
          node_version: process.version,
          platform: process.platform,
          memory: {
            used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external_mb: Math.round(memoryUsage.external / 1024 / 1024),
            rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
          },
          cpu_usage: process.cpuUsage(),
        },
        detailed_stats: {
          database: dbStats.status === 'fulfilled' ? dbStats.value : null,
          embedding: embedStats,
          cache: cacheStats,
        },
        response_time_ms: Date.now() - startTime,
      });
    }

    return NextResponse.json(healthResponse);
  } catch (error) {
    console.error(`[${requestId}] Health check error:`, error);

    return NextResponse.json(
      {
        status: 'unhealthy',
        services: {
          database: { status: 'down', error: 'Health check failed', last_check: new Date().toISOString() },
          embedding: { status: 'down', error: 'Health check failed', last_check: new Date().toISOString() },
          llm: { status: 'down', error: 'Health check failed', last_check: new Date().toISOString() },
          cache: { status: 'down', error: 'Health check failed', last_check: new Date().toISOString() },
        },
        version: apiConfig.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

// HEAD /api/health (for simple liveness checks)
export async function HEAD(): Promise<NextResponse> {
  try {
    const db = getDatabaseConnection();
    const isHealthy = await db.healthCheck();

    return new NextResponse(null, {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Health-Status': isHealthy ? 'healthy' : 'unhealthy',
      },
    });
  } catch {
    return new NextResponse(null, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache',
        'X-Health-Status': 'unhealthy',
      },
    });
  }
}