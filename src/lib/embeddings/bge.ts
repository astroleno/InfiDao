/**
 * BGE-M3 Embedding Service
 *
 * Handles text embedding generation using the BGE-M3 model
 * with caching and batch processing support.
 */

import { pipeline } from '@xenova/transformers';
import { L1Cache, L2Cache } from '../cache/manager';
import crypto from 'crypto';

export interface EmbeddingOptions {
  normalize?: boolean;
  pooling?: 'mean' | 'cls' | 'max';
  batchSize?: number;
  useCache?: boolean;
}

export interface EmbeddingResult {
  embedding: Float32Array;
  dimension: number;
  model: string;
  version: string;
  cached: boolean;
  processingTime: number;
}

export class BGEEmbeddingService {
  private embedder: any;
  private modelPath: string;
  private dimension: number;
  private l1Cache: L1Cache;
  private l2Cache?: L2Cache;

  constructor(
    modelPath: string = './models/bge-m3',
    l1Cache: L1Cache,
    l2Cache?: L2Cache
  ) {
    this.modelPath = modelPath;
    this.dimension = 1024; // BGE-M3 default
    this.l1Cache = l1Cache;
    this.l2Cache = l2Cache;
  }

  async initialize(): Promise<void> {
    if (!this.embedder) {
      console.log('🧠 Loading BGE-M3 model...');
      this.embedder = await pipeline('feature-extraction', this.modelPath);
      console.log('✅ BGE-M3 model loaded');
    }
  }

  async getEmbedding(
    text: string,
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();
    const normalizedOptions = {
      normalize: options.normalize ?? true,
      pooling: options.pooling ?? 'mean',
      useCache: options.useCache ?? true,
    };

    // Check cache first
    if (normalizedOptions.useCache) {
      const cached = await this.getCachedEmbedding(text);
      if (cached) {
        return {
          ...cached,
          cached: true,
          processingTime: Date.now() - startTime,
        };
      }
    }

    // Generate embedding
    const embedding = await this.generateEmbedding(text, normalizedOptions);

    const result: EmbeddingResult = {
      embedding,
      dimension: this.dimension,
      model: 'BAAI/bge-m3',
      version: 'EMB_V1_BGE_M3',
      cached: false,
      processingTime: Date.now() - startTime,
    };

    // Cache the result
    if (normalizedOptions.useCache) {
      await this.cacheEmbedding(text, result);
    }

    return result;
  }

  async getBatchEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult[]> {
    const startTime = Date.now();
    const batchSize = options.batchSize || 32;
    const normalizedOptions = {
      normalize: options.normalize ?? true,
      pooling: options.pooling ?? 'mean',
      useCache: options.useCache ?? true,
    };

    const results: EmbeddingResult[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each text
    if (normalizedOptions.useCache) {
      for (let i = 0; i < texts.length; i++) {
        const cached = await this.getCachedEmbedding(texts[i]);
        if (cached) {
          results[i] = {
            ...cached,
            cached: true,
            processingTime: 0,
          };
        } else {
          uncachedTexts.push(texts[i]);
          uncachedIndices.push(i);
        }
      }
    } else {
      uncachedTexts.push(...texts);
      uncachedIndices.push(...texts.map((_, i) => i));
    }

    // Generate embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const batchResults = await this.generateBatchEmbeddings(
        uncachedTexts,
        normalizedOptions
      );

      // Place results in correct positions
      for (let i = 0; i < uncachedIndices.length; i++) {
        const result: EmbeddingResult = {
          embedding: batchResults[i],
          dimension: this.dimension,
          model: 'BAAI/bge-m3',
          version: 'EMB_V1_BGE_M3',
          cached: false,
          processingTime: 0,
        };

        results[uncachedIndices[i]] = result;

        // Cache the result
        if (normalizedOptions.useCache) {
          await this.cacheEmbedding(uncachedTexts[i], result);
        }
      }
    }

    // Set processing time
    const processingTime = Date.now() - startTime;
    results.forEach(r => r.processingTime = processingTime);

    return results;
  }

  private async generateEmbedding(
    text: string,
    options: { normalize: boolean; pooling: string }
  ): Promise<Float32Array> {
    await this.initialize();

    const output = await this.embedder(text, {
      pooling: options.pooling,
      normalize: options.normalize,
    });

    // Handle different output formats
    let embedding: number[];
    if (output.data) {
      embedding = Array.from(output.data);
    } else if (output[0]?.data) {
      embedding = Array.from(output[0].data);
    } else {
      throw new Error('Unexpected embedding output format');
    }

    if (embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`
      );
    }

    return new Float32Array(embedding);
  }

  private async generateBatchEmbeddings(
    texts: string[],
    options: { normalize: boolean; pooling: string }
  ): Promise<Float32Array[]> {
    await this.initialize();

    const embeddings: Float32Array[] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += 32) {
      const batch = texts.slice(i, i + 32);

      // Process batch
      const outputs = await Promise.all(
        batch.map(text =>
          this.embedder(text, {
            pooling: options.pooling,
            normalize: options.normalize,
          })
        )
      );

      // Convert to Float32Array
      for (const output of outputs) {
        let embedding: number[];
        if (output.data) {
          embedding = Array.from(output.data);
        } else if (output[0]?.data) {
          embedding = Array.from(output[0].data);
        } else {
          console.warn('Invalid embedding format, using zeros');
          embedding = new Array(this.dimension).fill(0);
        }

        if (embedding.length === this.dimension) {
          embeddings.push(new Float32Array(embedding));
        } else {
          console.warn(
            `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`
          );
          embeddings.push(new Float32Array(this.dimension).fill(0));
        }
      }
    }

    return embeddings;
  }

  private async getCachedEmbedding(text: string): Promise<EmbeddingResult | null> {
    const cacheKey = this.generateCacheKey(text);

    // Try L1 cache
    let cached = this.l1Cache.get(cacheKey);
    if (cached) return cached;

    // Try L2 cache
    if (this.l2Cache) {
      cached = await this.l2Cache.get(cacheKey);
      if (cached) {
        // Promote to L1
        this.l1Cache.set(cacheKey, cached);
        return cached;
      }
    }

    return null;
  }

  private async cacheEmbedding(text: string, result: EmbeddingResult): Promise<void> {
    const cacheKey = this.generateCacheKey(text);

    // Cache in L1
    this.l1Cache.set(cacheKey, result, { ttl: 3600 }); // 1 hour

    // Cache in L2
    if (this.l2Cache) {
      await this.l2Cache.set(cacheKey, result, { ttl: 86400 }); // 24 hours
    }
  }

  private generateCacheKey(text: string): string {
    return `emb:${crypto.createHash('md5').update(text).digest('hex')}`;
  }

  // Utility methods
  calculateSimilarity(
    embedding1: Float32Array,
    embedding2: Float32Array
  ): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  findMostSimilar(
    queryEmbedding: Float32Array,
    candidateEmbeddings: Float32Array[],
    threshold: number = 0.7
  ): Array<{ index: number; score: number }> {
    const results: Array<{ index: number; score: number }> = [];

    for (let i = 0; i < candidateEmbeddings.length; i++) {
      const score = this.calculateSimilarity(queryEmbedding, candidateEmbeddings[i]);
      if (score >= threshold) {
        results.push({ index: i, score });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize();
      const testEmbedding = await this.getEmbedding('test');
      return testEmbedding.embedding.length === this.dimension;
    } catch (error) {
      console.error('BGE embedding service health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
let embeddingService: BGEEmbeddingService | null = null;

export function getEmbeddingService(
  modelPath?: string,
  l1Cache?: L1Cache,
  l2Cache?: L2Cache
): BGEEmbeddingService {
  if (!embeddingService) {
    if (!l1Cache) {
      throw new Error('L1Cache is required for embedding service');
    }
    embeddingService = new BGEEmbeddingService(modelPath, l1Cache, l2Cache);
  }
  return embeddingService;
}