import { useState, useCallback, useRef, useEffect } from 'react';
import { Annotation, StreamChunk, LLMProvider, ApiResponse } from '@/types';

interface UseAnnotationOptions {
  onSuccess?: (annotation: Annotation) => void;
  onError?: (error: Error) => void;
  onChunk?: (chunk: StreamChunk) => void;
  onComplete?: () => void;
  autoStart?: boolean;
}

interface UseAnnotationReturn {
  stream: (params: {
    query: string;
    passage: string;
    model?: LLMProvider;
  }) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;

  // State
  annotation: Annotation | null;
  streamingText: {
    six_to_me: string;
    me_to_six: string;
  };
  isLoading: boolean;
  error: Error | null;
  isComplete: boolean;
  isPaused: boolean;

  // Metadata
  model: LLMProvider;
  streamingTime: number;
  chunksReceived: number;
}

export function useAnnotation(options: UseAnnotationOptions = {}): UseAnnotationReturn {
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [streamingText, setStreamingText] = useState({
    six_to_me: '',
    me_to_six: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [model, setModel] = useState<LLMProvider>('glm');
  const [streamingTime, setStreamingTime] = useState(0);
  const [chunksReceived, setChunksReceived] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingStartTimeRef = useRef<number>(0);
  const pauseResolverRef = useRef<(() => void) | null>(null);

  const { onSuccess, onError, onChunk, onComplete } = options;

  // Streaming timer
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isLoading && !isPaused) {
      interval = setInterval(() => {
        setStreamingTime(Date.now() - streamingStartTimeRef.current);
      }, 100);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLoading, isPaused]);

  const processChunk = useCallback((chunk: StreamChunk) => {
    setChunksReceived(prev => prev + 1);
    onChunk?.(chunk);

    switch (chunk.type) {
      case 'chunk':
        setStreamingText(prev => ({
          ...prev,
          ...chunk.data
        }));
        break;

      case 'meta':
        // Update annotation with metadata
        if (chunk.data.annotation_id) {
          setAnnotation(prev => prev ? {
            ...prev,
            id: chunk.data.annotation_id,
            reason: chunk.data.reason || prev.reason,
            links: chunk.data.links || prev.links,
            metadata: {
              ...prev.metadata,
              ...chunk.data.metadata
            }
          } : null);
        }
        break;

      case 'annotation':
        // Final annotation received
        if (chunk.data) {
          setAnnotation(chunk.data);
        }
        break;

      case 'error':
        const error = new Error(chunk.data?.message || '流式响应错误');
        setError(error);
        onError?.(error);
        break;

      case 'end':
        setIsComplete(true);
        onComplete?.();
        break;

      default:
        console.warn('Unknown chunk type:', chunk.type);
    }
  }, [onChunk, onError, onComplete]);

  const stream = useCallback(async (params: {
    query: string;
    passage: string;
    model?: LLMProvider;
  }) => {
    const { query, passage, model: requestedModel = 'glm' } = params;

    // Reset state
    setStreamingText({ six_to_me: '', me_to_six: '' });
    setAnnotation(null);
    setError(null);
    setIsComplete(false);
    setIsPaused(false);
    setStreamingTime(0);
    setChunksReceived(0);
    setModel(requestedModel);
    streamingStartTimeRef.current = Date.now();

    // Create new AbortController
    abortControllerRef.current = new AbortController();

    setIsLoading(true);

    try {
      const response = await fetch('/api/annotate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          passage: passage.trim(),
          model: requestedModel
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`注释请求失败: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let buffer = '';
      let finalAnnotation: Annotation | null = null;

      try {
        while (true) {
          // Handle pause
          if (isPaused) {
            await new Promise<void>((resolve) => {
              pauseResolverRef.current = resolve;
            });
          }

          if (abortControllerRef.current?.signal.aborted) {
            break;
          }

          const { done, value } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');

          // Keep incomplete line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const chunk: StreamChunk = JSON.parse(line);
              processChunk(chunk);

              // Store final annotation if provided
              if (chunk.type === 'annotation' && chunk.data) {
                finalAnnotation = chunk.data;
              }
            } catch (parseError) {
              console.warn('Failed to parse stream chunk:', line, parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Create annotation from streaming text if not provided
      if (!finalAnnotation && streamingText.six_to_me && streamingText.me_to_six) {
        finalAnnotation = {
          id: `annotation_${Date.now()}`,
          note_id: `note_${Date.now()}`,
          passage_id: `passage_${Date.now()}`,
          score: 1.0,
          reason: 'semantic',
          six_to_me: streamingText.six_to_me,
          me_to_six: streamingText.me_to_six,
          links: []
        };
      }

      if (finalAnnotation) {
        setAnnotation(finalAnnotation);
        onSuccess?.(finalAnnotation);
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Annotation streaming was aborted');
      } else {
        const error = err instanceof Error ? err : new Error('注释生成失败');
        setError(error);
        onError?.(error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [processChunk, onSuccess, onError, isPaused, streamingText]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
    if (pauseResolverRef.current) {
      pauseResolverRef.current();
      pauseResolverRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setAnnotation(null);
    setStreamingText({ six_to_me: '', me_to_six: '' });
    setError(null);
    setIsComplete(false);
    setIsPaused(false);
    setStreamingTime(0);
    setChunksReceived(0);
  }, [stop]);

  return {
    stream,
    stop,
    pause,
    resume,
    reset,

    // State
    annotation,
    streamingText,
    isLoading,
    error,
    isComplete,
    isPaused,

    // Metadata
    model,
    streamingTime,
    chunksReceived
  };
}