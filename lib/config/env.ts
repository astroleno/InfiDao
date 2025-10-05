import { z } from 'zod'

// Environment variable validation schema
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database Configuration
  LANCEDB_PATH: z.string().default('./data/lancedb'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),

  // Embedding Model Configuration
  BGE_MODEL_PATH: z.string().default('./models/bge-m3'),
  EMBEDDING_DIM: z.coerce.number().default(1024),
  EMBEDDING_MODEL: z.string().default('BAAI/bge-m3'),

  // LLM Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4-turbo-preview'),

  ZHIPU_API_KEY: z.string().optional(),
  ZHIPU_BASE_URL: z.string().url().default('https://open.bigmodel.cn/api/paas/v4'),
  ZHIPU_MODEL: z.string().default('glm-4.5'),

  DASHSCOPE_API_KEY: z.string().optional(),
  DASHSCOPE_MODEL: z.string().default('qwen-max'),

  CUSTOM_API_KEY: z.string().optional(),
  CUSTOM_BASE_URL: z.string().url().optional(),
  CUSTOM_MODEL: z.string().optional(),

  DEFAULT_LLM_PROVIDER: z.enum(['openai', 'zhipu', 'qwen', 'custom']).default('zhipu'),

  // Search Configuration
  HYBRID_SEARCH: z.coerce.boolean().default(true),
  DEFAULT_TOP_K: z.coerce.number().default(5),
  DEFAULT_THRESHOLD: z.coerce.number().default(0.7),
  VECTOR_WEIGHT: z.coerce.number().default(0.7),
  BM25_WEIGHT: z.coerce.number().default(0.3),

  // Caching Configuration
  KV_CACHE: z.coerce.boolean().default(true),
  SEARCH_CACHE_TTL: z.coerce.number().default(1800),
  EMBEDDING_CACHE_TTL: z.coerce.number().default(86400),
  L1_CACHE_MAX_SIZE: z.coerce.number().default(1000),
  L1_CACHE_DEFAULT_TTL: z.coerce.number().default(60),

  // Redis Configuration (optional)
  REDIS_URL: z.string().url().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),

  // Performance Configuration
  EMBED_TIMEOUT: z.coerce.number().default(30000),
  SEARCH_TIMEOUT: z.coerce.number().default(10000),
  ANNOTATE_TIMEOUT: z.coerce.number().default(60000),
  EMBED_BATCH_SIZE: z.coerce.number().default(32),
  IMPORT_BATCH_SIZE: z.coerce.number().default(100),
  DB_CONNECTION_POOL_SIZE: z.coerce.number().default(10),

  // Monitoring & Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  ENABLE_METRICS: z.coerce.boolean().default(true),
  LOG_REQUESTS: z.coerce.boolean().default(true),

  // Security Configuration
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
  SESSION_SECRET: z.string().min(32).default('default-secret-key-change-in-production'),
  SESSION_TTL: z.coerce.number().default(3600),

  // Development Options
  HOT_RELOAD: z.coerce.boolean().default(true),
  SHOW_SQL: z.coerce.boolean().default(false),

  // Legacy Configuration (for backward compatibility)
  ANNOTATE_MODEL: z.string().optional(),
  TIMEOUT_MS: z.coerce.number().optional(),
})

// Validate and parse environment variables
function validateEnv() {
  try {
    const env = envSchema.parse(process.env)
    return env
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      )
      console.error('❌ Invalid environment variables:')
      errorMessages.forEach((message) => console.error(`  - ${message}`))
      console.error('\nPlease check your .env.local file and fix the above errors.')
      process.exit(1)
    }
    throw error
  }
}

// Export validated environment variables
export const env = validateEnv()

// Export types for use in other modules
export type Env = z.infer<typeof envSchema>

// Helper functions to check LLM provider configuration
export function hasOpenAIConfig(): boolean {
  return !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim())
}

export function hasZhipuConfig(): boolean {
  return !!(env.ZHIPU_API_KEY && env.ZHIPU_API_KEY.trim())
}

export function hasDashscopeConfig(): boolean {
  return !!(env.DASHSCOPE_API_KEY && env.DASHSCOPE_API_KEY.trim())
}

export function hasCustomConfig(): boolean {
  return !!(
    env.CUSTOM_API_KEY &&
    env.CUSTOM_API_KEY.trim() &&
    env.CUSTOM_BASE_URL &&
    env.CUSTOM_MODEL
  )
}

export function hasValidLLMConfig(): boolean {
  switch (env.DEFAULT_LLM_PROVIDER) {
    case 'openai':
      return hasOpenAIConfig()
    case 'zhipu':
      return hasZhipuConfig()
    case 'qwen':
      return hasDashscopeConfig()
    case 'custom':
      return hasCustomConfig()
    default:
      return false
  }
}

export function hasRedisConfig(): boolean {
  return !!(env.REDIS_URL && env.REDIS_URL.trim())
}

export function hasSupabaseConfig(): boolean {
  return !!(
    env.SUPABASE_URL &&
    env.SUPABASE_ANON_KEY &&
    env.SUPABASE_SERVICE_KEY
  )
}

// Development/Production helpers
export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development'
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production'
}

export function isTest(): boolean {
  return env.NODE_ENV === 'test'
}

// Log configuration status (for debugging)
export function logConfigStatus(): void {
  console.log('🔧 Configuration Status:')
  console.log(`  Environment: ${env.NODE_ENV}`)
  console.log(`  LLM Provider: ${env.DEFAULT_LLM_PROVIDER}`)
  console.log(`  Has OpenAI Config: ${hasOpenAIConfig()}`)
  console.log(`  Has Zhipu Config: ${hasZhipuConfig()}`)
  console.log(`  Has Dashscope Config: ${hasDashscopeConfig()}`)
  console.log(`  Has Custom Config: ${hasCustomConfig()}`)
  console.log(`  Has Redis Config: ${hasRedisConfig()}`)
  console.log(`  Has Supabase Config: ${hasSupabaseConfig()}`)
  console.log(`  Hybrid Search: ${env.HYBRID_SEARCH}`)
  console.log(`  KV Cache: ${env.KV_CACHE}`)
  console.log(`  Log Level: ${env.LOG_LEVEL}`)

  if (!hasValidLLMConfig()) {
    console.warn('⚠️  Warning: No valid LLM configuration found')
    console.warn('   Please configure at least one LLM provider in your .env.local')
  }
}