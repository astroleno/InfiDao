/**
 * Embedding Service
 *
 * Handles text embedding using BGE-M3 model with caching
 * and batch processing capabilities.
 */

import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import { embeddingConfig } from '@/lib/config';
import type { EmbedRequest, EmbedResponse, CacheConfig } from '@/types';

// Embedding service class
export class EmbeddingService {
  private pipeline: FeatureExtractionPipeline | null = null;
  private model: string;
  private isInitialized = false;
  private cache: Map<string, number[]> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(modelPath?: string) {
    this.model = modelPath || embeddingConfig.modelPath;
  }

  // Initialize the embedding model
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log(`Initializing embedding model: ${embeddingConfig.modelRepo}`);

      // Initialize the pipeline
      this.pipeline = await pipeline(
        'feature-extraction',
        embeddingConfig.modelRepo,
        {
          device: embeddingConfig.device,
          dtype: embeddingConfig.precision,
          quantized: embeddingConfig.precision !== 'float32',
        }
      );

      this.isInitialized = true;
      console.log('Embedding model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize embedding model:', error);
      throw new Error(`Embedding initialization failed: ${error}`);
    }
  }

  // Embed a single text
  async embed(text: string, normalize: boolean = true): Promise<number[]> {
    await this.initialize();

    // Check cache first
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      this.cacheHits++;
      return cached;
    }

    this.cacheMisses++;

    try {
      if (!this.pipeline) {
        throw new Error('Embedding pipeline not initialized');
      }

      // Generate embedding
      const output = await this.pipeline(text, {
        pooling: 'mean',
        normalize: normalize || embeddingConfig.normalize,
      });

      // Extract embedding vector
      const embedding = Array.from(output.data);

      // Cache the result
      this.setCache(cacheKey, embedding);

      return embedding;
    } catch (error) {
      console.error('Failed to embed text:', error);
      throw new Error(`Embedding failed: ${error}`);
    }
  }

  // Embed multiple texts (batch processing)
  async embedBatch(texts: string[], normalize: boolean = true): Promise<number[][]> {
    await this.initialize();

    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each text
    texts.forEach((text, index) => {
      const cacheKey = this.getCacheKey(text);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        results[index] = cached;
        this.cacheHits++;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(index);
        this.cacheMisses++;
      }
    });

    // Process uncached texts in batches
    if (uncachedTexts.length > 0) {
      const batchSize = embeddingConfig.batchSize;

      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);

        try {
          if (!this.pipeline) {
            throw new Error('Embedding pipeline not initialized');
          }

          // Process batch
          const batchOutput = await this.pipeline(batch, {
            pooling: 'mean',
            normalize: normalize || embeddingConfig.normalize,
          });

          // Extract embeddings
          const batchEmbeddings = batchOutput.tolist() as number[][];

          // Store results and update cache
          batchEmbeddings.forEach((embedding, batchIndex) => {
            const originalIndex = uncachedIndices[i + batchIndex];
            results[originalIndex] = embedding;

            const cacheKey = this.getCacheKey(uncachedTexts[i + batchIndex]);
            this.setCache(cacheKey, embedding);
          });
        } catch (error) {
          console.error('Failed to embed batch:', error);
          throw new Error(`Batch embedding failed: ${error}`);
        }
      }
    }

    return results;
  }

  // Process embedding request
  async processRequest(request: EmbedRequest): Promise<EmbedResponse> {
    const startTime = Date.now();
    const id = this.generateId();

    try {
      let vectors: number[] | number[][];

      if (request.batch && request.texts) {
        // Batch embedding
        vectors = await this.embedBatch(
          request.texts,
          request.normalize
        );
      } else {
        // Single embedding
        vectors = await this.embed(
          request.text,
          request.normalize
        );
      }

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          id,
          vector: request.batch ? undefined : vectors as number[],
          vectors: request.batch ? vectors as number[][] : undefined,
          vector_length: embeddingConfig.dimensions,
          processing_time_ms: processingTime,
        },
        version: '1.0.0',
        model: embeddingConfig.modelRepo,
      };
    } catch (error) {
      return {
        success: false,
        data: {
          id,
          vector_length: 0,
          processing_time_ms: Date.now() - startTime,
        },
        version: '1.0.0',
        model: embeddingConfig.modelRepo,
      };
    }
  }

  // Get cache statistics
  getCacheStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
      size: this.cache.size,
    };
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  // Get model info
  getModelInfo(): {
    model: string;
    dimensions: number;
    maxSequenceLength: number;
    isInitialized: boolean;
  } {
    return {
      model: embeddingConfig.modelRepo,
      dimensions: embeddingConfig.dimensions,
      maxSequenceLength: embeddingConfig.maxSequenceLength,
      isInitialized: this.isInitialized,
    };
  }

  // Private helper methods
  private getCacheKey(text: string): string {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private setCache(key: string, value: number[]): void {
    // Implement LRU cache if cache size exceeds limit
    if (this.cache.size >= embeddingConfig.cacheSize) {
      // Remove oldest entry (simple FIFO for now)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Cleanup resources
  async dispose(): Promise<void> {
    if (this.pipeline) {
      await this.pipeline.dispose();
      this.pipeline = null;
    }
    this.isInitialized = false;
    this.clearCache();
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

// Get embedding service instance
export function getEmbeddingService(modelPath?: string): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(modelPath);
  }
  return embeddingService;
}

// Initialize embedding service
export async function initializeEmbeddingService(): Promise<void> {
  const service = getEmbeddingService();
  await service.initialize();
}

// Utility functions
export const embedUtils = {
  // Calculate cosine similarity between two vectors
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  },

  // Calculate Euclidean distance between two vectors
  euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  },

  // Normalize vector to unit length
  normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

    if (norm === 0) {
      return vector;
    }

    return vector.map(val => val / norm);
  },

  // Average multiple vectors
  averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      throw new Error('Cannot average empty vector list');
    }

    const dimension = vectors[0].length;
    const result = new Array(dimension).fill(0);

    for (const vector of vectors) {
      if (vector.length !== dimension) {
        throw new Error('All vectors must have the same dimension');
      }

      for (let i = 0; i < dimension; i++) {
        result[i] += vector[i];
      }
    }

    return result.map(val => val / vectors.length);
  },

  // Check if text is too long for embedding
  isTextTooLong(text: string): boolean {
    // Rough estimation: 1 token ≈ 4 characters
    const estimatedTokens = text.length / 4;
    return estimatedTokens > embeddingConfig.maxSequenceLength;
  },

  // Truncate text to fit within max sequence length
  truncateText(text: string, maxLength?: number): string {
    const maxTokens = maxLength || embeddingConfig.maxSequenceLength;
    const maxChars = maxTokens * 4; // Rough estimation

    if (text.length <= maxChars) {
      return text;
    }

    // Try to truncate at sentence boundary
    const truncated = text.substring(0, maxChars);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentenceEnd > maxChars * 0.8) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    return truncated;
  },
};