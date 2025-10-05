/**
 * Logging Utilities
 *
 * Centralized logging with different levels and structured output.
 */

import { loggingConfig } from '@/lib/config';

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

// Log entry interface
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  userId?: string;
  service?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: any;
}

// Logger class
export class Logger {
  private service: string;
  private level: LogLevel;

  constructor(service: string = 'api') {
    this.service = service;
    this.level = this.getLogLevelFromString(loggingConfig.level);
  }

  // Get log level from string
  private getLogLevelFromString(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  // Check if log level is enabled
  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  // Format log entry
  private formatLogEntry(
    level: LogLevel,
    message: string,
    metadata?: any
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      service: this.service,
      ...metadata,
    };
  }

  // Output log entry
  private output(entry: LogEntry): void {
    if (loggingConfig.format === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      // Pretty format
      const parts = [
        `[${entry.timestamp}]`,
        `[${entry.level}]`,
        entry.service ? `[${entry.service}]` : '',
        entry.requestId ? `[${entry.requestId}]` : '',
        entry.message,
      ].filter(Boolean).join(' ');

      if (entry.error) {
        console.error(parts);
        if (entry.level === 'DEBUG' || entry.level === 'ERROR') {
          console.error(entry.error.stack);
        }
      } else if (entry.level === 'ERROR') {
        console.error(parts);
      } else if (entry.level === 'WARN') {
        console.warn(parts);
      } else {
        console.log(parts);
      }

      // Log metadata
      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        console.log('  Metadata:', JSON.stringify(entry.metadata, null, 2));
      }
    }
  }

  // Log methods
  error(message: string, error?: Error, metadata?: any): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const entry = this.formatLogEntry(LogLevel.ERROR, message, metadata);
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.output(entry);
  }

  warn(message: string, metadata?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const entry = this.formatLogEntry(LogLevel.WARN, message, metadata);
    this.output(entry);
  }

  info(message: string, metadata?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const entry = this.formatLogEntry(LogLevel.INFO, message, metadata);
    this.output(entry);
  }

  debug(message: string, metadata?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry = this.formatLogEntry(LogLevel.DEBUG, message, metadata);
    this.output(entry);
  }

  // Request logging
  logRequest(
    method: string,
    path: string,
    requestId: string,
    userId?: string,
    duration?: number
  ): void {
    this.info(`${method} ${path}`, {
      requestId,
      userId,
      duration,
      type: 'request',
    });
  }

  // Performance logging
  logPerformance(
    operation: string,
    duration: number,
    metadata?: any
  ): void {
    this.info(`Performance: ${operation}`, {
      duration,
      operation,
      type: 'performance',
      ...metadata,
    });
  }

  // Cache logging
  logCacheHit(key: string, hit: boolean, latency?: number): void {
    this.debug(`Cache ${hit ? 'HIT' : 'MISS'}: ${key}`, {
      key,
      hit,
      latency,
      type: 'cache',
    });
  }

  // Search logging
  logSearch(
    query: string,
    resultsCount: number,
    duration: number,
    metadata?: any
  ): void {
    this.info(`Search: "${query}"`, {
      query,
      resultsCount,
      duration,
      type: 'search',
      ...metadata,
    });
  }

  // LLM logging
  logLLMCall(
    provider: string,
    model: string,
    tokens: { prompt?: number; completion?: number; total?: number },
    duration: number,
    metadata?: any
  ): void {
    this.info(`LLM Call: ${provider}/${model}`, {
      provider,
      model,
      tokens,
      duration,
      type: 'llm',
      ...metadata,
    });
  }
}

// Create logger instances
export const createLogger = (service: string): Logger => new Logger(service);

// Default logger
export const logger = new Logger('api');

// Log middleware helper
export function createRequestLogger(requestId: string, userId?: string) {
  return {
    error: (message: string, error?: Error, metadata?: any) =>
      logger.error(message, error, { requestId, userId, ...metadata }),
    warn: (message: string, metadata?: any) =>
      logger.warn(message, { requestId, userId, ...metadata }),
    info: (message: string, metadata?: any) =>
      logger.info(message, { requestId, userId, ...metadata }),
    debug: (message: string, metadata?: any) =>
      logger.debug(message, { requestId, userId, ...metadata }),
  };
}

// Performance tracker
export class PerformanceTracker {
  private operation: string;
  private startTime: number;
  private logger: Logger;
  private metadata: any;

  constructor(operation: string, logger: Logger, metadata?: any) {
    this.operation = operation;
    this.startTime = Date.now();
    this.logger = logger;
    this.metadata = metadata || {};
  }

  // Get elapsed time
  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  // End tracking and log
  end(additionalMetadata?: any): number {
    const duration = this.getElapsed();
    this.logger.logPerformance(
      this.operation,
      duration,
      { ...this.metadata, ...additionalMetadata }
    );
    return duration;
  }

  // Create a child tracker
  child(operation: string, metadata?: any): PerformanceTracker {
    return new PerformanceTracker(
      `${this.operation}/${operation}`,
      this.logger,
      { ...this.metadata, ...metadata }
    );
  }
}

// Create performance tracker
export function trackPerformance(operation: string, metadata?: any): PerformanceTracker {
  return new PerformanceTracker(operation, logger, metadata);
}

// Async function wrapper for performance tracking
export async function withPerformanceTracking<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: any
): Promise<T> {
  const tracker = trackPerformance(operation, metadata);
  try {
    const result = await fn();
    tracker.end({ success: true });
    return result;
  } catch (error) {
    tracker.end({ success: false, error: (error as Error).message });
    throw error;
  }
}