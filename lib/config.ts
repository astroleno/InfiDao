/**
 * Configuration Management
 *
 * Centralized configuration for all services including
 * database, embeddings, LLM providers, and caching.
 */

import { z } from 'zod';
import type {
  DatabaseConfig,
  CacheConfig,
  LLMProvider,
  EmbeddingModel
} from '@/types';

// Environment schema validation
const envSchema = z.object({
  // Database Configuration
  DATABASE_PATH: z.string().default('./data/lancedb'),
  EMBEDDINGS_TABLE: z.string().default('embeddings'),
  PASSAGES_TABLE: z.string().default('passages'),

  // Model Configuration
  BGE_MODEL_PATH: z.string().default('./models/bge-m3'),
  BGE_MODEL_REPO: z.string().default('BAAI/bge-m3'),

  // LLM Configuration
  LLM_PROVIDER: z.enum(['glm', 'qwen', 'gpt', 'claude', 'openai']).default('glm'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  GLM_API_KEY: z.string().optional(),
  GLM_BASE_URL: z.string().url().optional(),
  QWEN_API_KEY: z.string().optional(),
  QWEN_BASE_URL: z.string().url().optional(),

  // Cache Configuration
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).default('0'),

  // Performance Configuration
  L1_CACHE_SIZE: z.string().transform(Number).default('1000'),
  L1_CACHE_TTL: z.string().transform(Number).default('60'),
  L2_CACHE_TTL: z.string().transform(Number).default('1800'),

  // Search Configuration
  DEFAULT_TOP_K: z.string().transform(Number).default('5'),
  DEFAULT_THRESHOLD: z.string().transform(Number).default('0.7'),
  MAX_QUERY_LENGTH: z.string().transform(Number).default('500'),

  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  API_VERSION: z.string().default('v1'),
  PORT: z.string().transform(Number).default('3000'),

  // Feature Flags
  ENABLE_STREAMING: z.string().transform(Boolean).default('true'),
  ENABLE_QUERY_EXPANSION: z.string().transform(Boolean).default('true'),
  ENABLE_RERANKING: z.string().transform(Boolean).default('true'),
  ENABLE_ANALYTICS: z.string().transform(Boolean).default('false'),
});

// Parse and validate environment variables
export const env = envSchema.parse(process.env);

// Export configuration objects
export const databaseConfig: DatabaseConfig = {
  type: 'lancedb',
  path: env.DATABASE_PATH,
  embeddingsTable: env.EMBEDDINGS_TABLE,
  passagesTable: env.PASSAGES_TABLE,
  cacheSize: env.L1_CACHE_SIZE,
};

export const cacheConfig: CacheConfig = {
  l1: {
    maxSize: env.L1_CACHE_SIZE,
    defaultTTL: env.L1_CACHE_TTL,
  },
  l2: env.REDIS_URL || env.REDIS_HOST ? {
    redis: env.REDIS_URL
      ? { url: env.REDIS_URL }
      : {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
          db: env.REDIS_DB,
        },
    keyPrefix: 'infidao:',
    defaultTTL: env.L2_CACHE_TTL,
  } : undefined,
};

export const embeddingConfig = {
  modelPath: env.BGE_MODEL_PATH,
  modelRepo: env.BGE_MODEL_REPO,
  modelType: 'bge-m3' as EmbeddingModel,
  dimensions: 1024,
  maxSequenceLength: 8192,
  device: 'auto', // 'cpu', 'cuda', 'auto'
  precision: 'float32',
  normalize: true,
  batchSize: 32,
  cacheEnabled: true,
};

export const llmConfig = {
  defaultProvider: env.LLM_PROVIDER as LLMProvider,
  providers: {
    openai: {
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: 'gpt-4-turbo-preview',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 30000,
    },
    glm: {
      apiKey: env.GLM_API_KEY,
      baseURL: env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 30000,
    },
    qwen: {
      apiKey: env.QWEN_API_KEY,
      baseURL: env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1',
      model: 'qwen-max',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 30000,
    },
  },
};

export const searchConfig = {
  defaultTopK: env.DEFAULT_TOP_K,
  defaultThreshold: env.DEFAULT_THRESHOLD,
  maxQueryLength: env.MAX_QUERY_LENGTH,
  weights: {
    vector: 0.7,
    bm25: 0.3,
    semantic: 0.5,
  },
  queryExpansion: {
    enabled: env.ENABLE_QUERY_EXPANSION,
    maxExpansions: 3,
    similarityThreshold: 0.8,
  },
  reranking: {
    enabled: env.ENABLE_RERANKING,
    model: 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    topK: 10,
  },
};

export const apiConfig = {
  version: env.API_VERSION,
  port: env.PORT,
  streaming: {
    enabled: env.ENABLE_STREAMING,
    chunkSize: 1024,
    maxDuration: 30000, // 30 seconds
  },
  rateLimiting: {
    enabled: true,
    requestsPerMinute: 60,
    requestsPerHour: 1000,
  },
  cors: {
    origins: env.NODE_ENV === 'production'
      ? ['https://infidao.com']
      : ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization'],
  },
};

export const loggingConfig = {
  level: env.LOG_LEVEL,
  format: env.NODE_ENV === 'production' ? 'json' : 'pretty',
  colors: env.NODE_ENV === 'development',
  timestamp: true,
  requestId: true,
};

// Helper functions
export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return env.NODE_ENV === 'test';
}

export function getLLMProviderConfig(provider: LLMProvider) {
  return llmConfig.providers[provider];
}

export function hasValidLLMConfig(provider: LLMProvider): boolean {
  const config = getLLMProviderConfig(provider);
  return !!(config && config.apiKey);
}

export function getActiveLLMProvider(): LLMProvider {
  // Return the first configured provider with valid API key
  for (const provider of Object.keys(llmConfig.providers) as LLMProvider[]) {
    if (hasValidLLMConfig(provider)) {
      return provider;
    }
  }

  // Fallback to default provider (might not have valid config)
  return llmConfig.defaultProvider;
}

// Export all environment variables for debugging
export const debugEnv = {
  ...env,
  // Mask sensitive values
  OPENAI_API_KEY: env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]',
  GLM_API_KEY: env.GLM_API_KEY ? '[SET]' : '[NOT SET]',
  QWEN_API_KEY: env.QWEN_API_KEY ? '[SET]' : '[NOT SET]',
  REDIS_PASSWORD: env.REDIS_PASSWORD ? '[SET]' : '[NOT SET]',
};