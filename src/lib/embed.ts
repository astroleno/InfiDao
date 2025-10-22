import { Pipeline } from '@xenova/transformers';
import { EmbedResponse } from '@/types';

export class EmbeddingService {
  private pipeline: Pipeline | null = null;
  private modelPath: string;
  private dimensions: number;
  private version = 'EMB_V1_BGE_M3';

  constructor() {
    this.modelPath = process.env.BGE_MODEL_PATH || './models/bge-m3';
    this.dimensions = parseInt(process.env.EMBEDDING_DIM || '1024');
  }

  async initialize() {
    try {
      console.log(`[Embed] Initializing embedding model: ${this.modelPath}`);
      this.pipeline = await Pipeline('feature-extraction', 'BAAI/bge-m3', {
        quantized: true,
        progress_callback: (progress: any) => {
          if (progress.status === 'downloading') {
            console.log(`[Embed] Downloading model: ${progress.file} (${progress.progress}%)`);
          }
        }
      });
      console.log('[Embed] Model initialized successfully');
      return true;
    } catch (error) {
      console.error('[Embed] Failed to initialize model:', error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.pipeline) {
      await this.initialize();
    }

    try {
      const output = await this.pipeline!(text, {
        pooling: 'mean',
        normalize: true
      });

      // 处理不同的输出格式
      let vector: number[];
      if (output.data) {
        vector = Array.from(output.data);
      } else if (output[0]?.data) {
        vector = Array.from(output[0].data);
      } else {
        throw new Error('Invalid embedding output format');
      }

      // 验证维度
      if (vector.length !== this.dimensions) {
        console.warn(`[Embed] Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
      }

      return vector;
    } catch (error) {
      console.error('[Embed] Failed to embed text:', error);
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.pipeline) {
      await this.initialize();
    }

    const results: number[][] = [];
    const batchSize = 8; // 批处理大小

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.embed(text));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  async embedWithMetadata(text: string, metadata?: any): Promise<EmbedResponse> {
    const vector = await this.embed(text);

    return {
      success: true,
      id: crypto.randomUUID(),
      vector_length: vector.length,
      version: this.version
    };
  }

  getVersion(): string {
    return this.version;
  }

  getDimensions(): number {
    return this.dimensions;
  }
}

// 导出单例实例
export const embeddingService = new EmbeddingService();