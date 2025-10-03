// AI Service Types

export interface LLMProvider {
  generateText(prompt: string): Promise<string>;
  generateStream(prompt: string): AsyncGenerator<string, void, undefined>;
  generateEmbedding(text: string): Promise<number[]>;
}

export interface AIServiceConfig {
  provider: 'gemini' | 'openai' | 'claude';
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIGenerationOptions {
  prompt: string;
  context?: string[];
  stream?: boolean;
  cache?: boolean;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}
