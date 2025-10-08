import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { Annotation, StreamChunk, LLMProvider } from '@/types';

interface AnnotationState {
  // State
  currentAnnotation: Annotation | null;
  streamingText: {
    six_to_me: string;
    me_to_six: string;
  };
  isLoading: boolean;
  error: Error | null;
  model: LLMProvider;
  annotationHistory: Array<{
    query: string;
    passage: string;
    annotation: Annotation;
    timestamp: string;
  }>;

  // Streaming State
  streamingController: AbortController | null;
  streamingComplete: boolean;

  // Actions
  setCurrentAnnotation: (annotation: Annotation | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setModel: (model: LLMProvider) => void;
  clearStreamingText: () => void;
  addToHistory: (query: string, passage: string, annotation: Annotation) => void;
  clearHistory: () => void;

  // Streaming Actions
  stream: (params: {
    query: string;
    passage: string;
    model?: LLMProvider;
    abortSignal?: AbortSignal;
    onChunk?: (chunk: string) => void;
  }) => Promise<void>;
  stopStreaming: () => void;
  processStreamChunk: (chunk: StreamChunk) => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial State
      currentAnnotation: null,
      streamingText: {
        six_to_me: '',
        me_to_six: ''
      },
      isLoading: false,
      error: null,
      model: 'glm',
      annotationHistory: [],
      streamingController: null,
      streamingComplete: false,

      // Actions
      setCurrentAnnotation: (annotation) => set({ currentAnnotation: annotation }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      setModel: (model) => set({ model }),

      clearStreamingText: () => set({
        streamingText: { six_to_me: '', me_to_six: '' },
        streamingComplete: false
      }),

      addToHistory: (query, passage, annotation) => set((state) => ({
        annotationHistory: [
          {
            query,
            passage,
            annotation,
            timestamp: new Date().toISOString()
          },
          ...state.annotationHistory.slice(0, 49) // Keep last 50 annotations
        ]
      })),

      clearHistory: () => set({ annotationHistory: [] }),

      // Streaming Actions
      stream: async ({ query, passage, model = 'glm' }) => {
        const {
          setLoading,
          setError,
          clearStreamingText,
          processStreamChunk,
          addToHistory,
          setCurrentAnnotation
        } = get();

        setLoading(true);
        setError(null);
        clearStreamingText();

        // Create AbortController for this request
        const controller = new AbortController();
        set({ streamingController: controller });

        try {
          const response = await fetch('/api/annotate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
              passage,
              model
            }),
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`Annotation failed: ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error('No response body');
          }

          let buffer = '';
          let finalAnnotation: Annotation | null = null;

          try {
            while (true) {
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

                  // Process chunk based on type
                  processStreamChunk(chunk);

                  // Check if this is the final annotation
                  if (chunk.type === 'end' && get().streamingText.six_to_me && get().streamingText.me_to_six) {
                    const streamingText = get().streamingText;
                    finalAnnotation = {
                      note_id: `note_${Date.now()}`,
                      passage_id: `passage_${Date.now()}`,
                      score: 1.0,
                      reason: 'semantic',
                      six_to_me: streamingText.six_to_me,
                      me_to_six: streamingText.me_to_six,
                      links: []
                    };
                  }
                } catch (parseError) {
                  console.warn('Failed to parse stream chunk:', line, parseError);
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          if (finalAnnotation) {
            setCurrentAnnotation(finalAnnotation);
            addToHistory(query, passage, finalAnnotation);
          }

          set({ streamingComplete: true });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('Streaming was aborted');
          } else {
            console.error('Annotation streaming error:', error);
            setError(error instanceof Error ? error : new Error('Annotation failed'));
          }
        } finally {
          setLoading(false);
          set({ streamingController: null });
        }
      },

      stopStreaming: () => {
        const { streamingController } = get();

        if (streamingController) {
          streamingController.abort();
          set({ streamingController: null });
        }

        setLoading(false);
      },

      processStreamChunk: (chunk) => {
        const { streamingText } = get();

        switch (chunk.type) {
          case 'chunk':
            set({
              streamingText: {
                ...streamingText,
                ...chunk.data
              }
            });
            break;

          case 'meta':
            // Update annotation with metadata (links, reason, etc.)
            if (get().currentAnnotation) {
              set({
                currentAnnotation: {
                  ...get().currentAnnotation!,
                  reason: chunk.data.reason || 'semantic',
                  links: chunk.data.links || []
                }
              });
            }
            break;

          case 'end':
            set({ streamingComplete: true });
            break;

          default:
            console.warn('Unknown chunk type:', chunk.type);
        }
      }
    })),
    {
      name: 'annotation-store',
    }
  )
);