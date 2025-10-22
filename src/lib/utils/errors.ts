/**
 * Error Handling Utilities
 *
 * Centralized error handling and custom error classes
 * for consistent error responses across the API.
 */

import { ApiError } from '@/types';

// Custom error classes
export class ValidationError extends Error {
  public code = 'VALIDATION_ERROR';
  public statusCode = 400;
  public details?: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends Error {
  public code = 'NOT_FOUND';
  public statusCode = 404;

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  public code = 'UNAUTHORIZED';
  public statusCode = 401;

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class RateLimitError extends Error {
  public code = 'RATE_LIMIT';
  public statusCode = 429;

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class DatabaseError extends Error {
  public code = 'DATABASE_ERROR';
  public statusCode = 500;

  constructor(message: string = 'Database operation failed') {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class EmbeddingError extends Error {
  public code = 'EMBEDDING_ERROR';
  public statusCode = 500;

  constructor(message: string = 'Embedding generation failed') {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export class LLMError extends Error {
  public code = 'LLM_ERROR';
  public statusCode = 500;

  constructor(message: string = 'LLM operation failed') {
    super(message);
    this.name = 'LLMError';
  }
}

export class CacheError extends Error {
  public code = 'CACHE_ERROR';
  public statusCode = 500;

  constructor(message: string = 'Cache operation failed') {
    super(message);
    this.name = 'CacheError';
  }
}

export class ConfigurationError extends Error {
  public code = 'CONFIGURATION_ERROR';
  public statusCode = 500;

  constructor(message: string = 'Configuration error') {
    super(message);
    this.name = 'ConfigurationError';
  }
}

// Error handler utility
export function handleError(error: unknown): ApiError {
  // If it's already a custom error, return it
  if (error instanceof Error && 'code' in error && 'statusCode' in error) {
    return {
      code: (error as any).code,
      message: error.message,
      status: (error as any).statusCode,
      details: (error as any).details,
    };
  }

  // Handle Zod validation errors
  if (error && typeof error === 'object' && 'errors' in error) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request parameters',
      status: 400,
      details: (error as any).errors,
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    // Check for common error patterns
    if (error.message.includes('timeout')) {
      return {
        code: 'TIMEOUT_ERROR',
        message: 'Request timed out',
        status: 408,
      };
    }

    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      return {
        code: 'CONNECTION_ERROR',
        message: 'Service unavailable',
        status: 503,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : error.message,
      status: 500,
    };
  }

  // Unknown error
  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    status: 500,
  };
}

// Error boundary for API routes
export function withErrorHandler(handler: Function) {
  return async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('API Error:', error);
      const apiError = handleError(error);

      // Return error response
      const { Response } = await import('next/server');
      return Response.json(
        {
          success: false,
          error: {
            code: apiError.code,
            message: apiError.message,
            ...(apiError.details && { details: apiError.details }),
          },
          meta: {
            timestamp: new Date().toISOString(),
            request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            version: 'v1',
          },
        },
        { status: apiError.status }
      );
    }
  };
}

// Retry utility for transient errors
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000,
  backoff: number = 2
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on certain errors
      if (error instanceof ValidationError ||
          error instanceof UnauthorizedError ||
          error instanceof NotFoundError) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= backoff; // Exponential backoff
    }
  }

  throw lastError!;
}