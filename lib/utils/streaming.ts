import { StreamChunk } from '@/types';

export interface StreamingOptions {
  onChunk?: (chunk: StreamChunk) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  onProgress?: (progress: number) => void;
}

export class StreamingReader {
  private decoder: TextDecoder;
  private buffer: string = '';
  private options: StreamingOptions;
  private isComplete: boolean = false;
  private totalChunks: number = 0;
  private processedChunks: number = 0;

  constructor(options: StreamingOptions = {}) {
    this.decoder = new TextDecoder();
    this.options = options;
  }

  async readStream(response: Response): Promise<void> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    this.isComplete = false;
    this.totalChunks = 0;
    this.processedChunks = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.handleComplete();
          break;
        }

        this.processChunk(value);
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('Streaming failed'));
    } finally {
      reader.releaseLock();
    }
  }

  private processChunk(value: Uint8Array): void {
    this.buffer += this.decoder.decode(value, { stream: true });
    const lines = this.buffer.split('\n');

    // Keep incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const chunk: StreamChunk = JSON.parse(line);
        this.totalChunks++;
        this.handleStreamChunk(chunk);
      } catch (parseError) {
        console.warn('Failed to parse stream chunk:', line, parseError);
      }
    }
  }

  private handleStreamChunk(chunk: StreamChunk): void {
    this.processedChunks++;

    switch (chunk.type) {
      case 'chunk':
        this.options.onChunk?.(chunk);
        break;

      case 'meta':
        this.options.onChunk?.(chunk);
        break;

      case 'annotation':
        this.options.onChunk?.(chunk);
        break;

      case 'error':
        const error = new Error(chunk.data?.message || 'Stream error');
        this.handleError(error);
        break;

      case 'end':
        this.handleComplete();
        break;

      default:
        console.warn('Unknown chunk type:', chunk.type);
    }

    // Update progress
    if (this.totalChunks > 0) {
      this.options.onProgress?.(this.processedChunks / this.totalChunks);
    }
  }

  private handleError(error: Error): void {
    this.options.onError?.(error);
  }

  private handleComplete(): void {
    if (!this.isComplete) {
      this.isComplete = true;
      this.options.onComplete?.();
    }
  }

  getProgress(): number {
    return this.totalChunks > 0 ? this.processedChunks / this.totalChunks : 0;
  }

  isStreamingComplete(): boolean {
    return this.isComplete;
  }
}

// Utility function for simple streaming
export async function streamResponse(
  response: Response,
  options: StreamingOptions = {}
): Promise<void> {
  const reader = new StreamingReader(options);
  return reader.readStream(response);
}

// Utility function for parsing streaming text
export function parseStreamingLine(line: string): StreamChunk | null {
  if (!line.trim()) return null;

  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Utility function for creating abortable streaming
export function createAbortableStream(
  streamFn: (signal: AbortSignal) => Promise<Response>,
  options: StreamingOptions = {}
): {
  start: () => Promise<void>;
  abort: () => void;
  isAborted: () => boolean;
} {
  const controller = new AbortController();
  let isAborted = false;

  const start = async (): Promise<void> => {
    try {
      const response = await streamFn(controller.signal);
      await streamResponse(response, options);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Streaming was aborted');
      } else {
        options.onError?.(error instanceof Error ? error : new Error('Streaming failed'));
      }
    }
  };

  const abort = (): void => {
    if (!isAborted) {
      isAborted = true;
      controller.abort();
    }
  };

  const isAbortedFn = (): boolean => isAborted;

  return { start, abort, isAborted: isAbortedFn };
}

// Typed streaming functions for specific use cases
export async function streamAnnotation(
  request: any,
  options: StreamingOptions = {}
): Promise<void> {
  const response = await fetch('/api/annotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Annotation streaming failed: ${response.statusText}`);
  }

  return streamResponse(response, options);
}

export async function streamSearch(
  request: any,
  options: StreamingOptions = {}
): Promise<void> {
  const response = await fetch('/api/search/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Search streaming failed: ${response.statusText}`);
  }

  return streamResponse(response, options);
}