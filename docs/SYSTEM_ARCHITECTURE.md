# InfiDao 六经注我 - Complete System Architecture

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Frontend Layer (Vercel)"
        UI[Next.js App Router]
        COMP[React Components]
        SWR[SWR/React Query]
    end

    subgraph "API Gateway (Vercel Edge/Serverless)"
        API_EMBED[/api/embed]
        API_SEARCH[/api/search]
        API_ANNOTATE[/api/annotate]
    end

    subgraph "Service Layer"
        EMBED[Embedding Service]
        SEARCH[Search Service]
        ANNOTATE[Annotation Service]
        CACHE[Redis Cache Layer]
    end

    subgraph "Model Layer"
        BGE[bge-m3 Model]
        LLM[LLM Adapter]
        GLM[GLM-4.5]
        QWEN[Qwen]
        OPENAI[OpenAI GPT]
    end

    subgraph "Data Layer"
        LANCEDB[(LanceDB)]
        VECTOR[Vector Store]
        METADATA[Metadata Store]
    end

    UI --> API_EMBED
    UI --> API_SEARCH
    UI --> API_ANNOTATE

    API_EMBED --> EMBED
    API_SEARCH --> SEARCH
    API_ANNOTATE --> ANNOTATE

    EMBED --> BGE
    SEARCH --> VECTOR
    SEARCH --> METADATA
    ANNOTATE --> LLM
    ANNOTATE --> CACHE

    LLM --> GLM
    LLM --> QWEN
    LLM --> OPENAI

    VECTOR --> LANCEDB
    METADATA --> LANCEDB

    CACHE -.-> SEARCH
    CACHE -.-> ANNOTATE
```

## 2. Detailed API Design

### 2.1 Embedding API - POST /api/embed

**Purpose**: Generate text embeddings for storage and search

```typescript
// Request Schema
interface EmbedRequest {
  text: string;
  metadata?: {
    source?: string;
    chapter?: string;
    section?: number;
    user_id?: string;
  };
  batch?: boolean; // for batch processing
}

// Response Schema
interface EmbedResponse {
  success: boolean;
  id: string;
  vector: number[]; // [1024] for bge-m3
  vector_length: number;
  model: string;
  version: string; // EMB_V1_BGE_M3
  processing_time_ms: number;
}

// Error Response
interface ErrorResponse {
  success: false;
  error: {
    code: "INVALID_TEXT" | "MODEL_ERROR" | "RATE_LIMIT" | "INTERNAL_ERROR";
    message: string;
    details?: any;
  };
}
```

**Implementation Details**:
- Uses bge-m3 model via @xenova/transformers
- Supports batching for bulk operations
- Automatic normalization of vectors
- Version tracking for model updates
- Rate limiting per user/IP

### 2.2 Search API - POST /api/search

**Purpose**: Semantic search across Six Classics passages

```typescript
// Request Schema
interface SearchRequest {
  query: string;
  top_k?: number; // default: 5, max: 20
  threshold?: number; // default: 0.7, range: 0-1
  hybrid?: boolean; // default: true
  filters?: {
    book?: string[]; // 论语, 孟子, 大学, 中庸, etc.
    chapter?: string[];
    section_range?: [number, number];
  };
  rerank?: boolean; // enable cross-encoder reranking
  include_metadata?: boolean; // default: true
}

// Response Schema
interface SearchResponse {
  success: boolean;
  query_id: string;
  results: SearchResult[];
  total_found: number;
  processing_time_ms: number;
  search_strategy: "vector" | "hybrid" | "keyword";
  cached?: boolean;
}

interface SearchResult {
  id: string;
  text: string;
  book: string;
  chapter: string;
  section: number;
  score: number;
  rank: number;
  highlights?: string[]; // highlighted matching terms
  metadata?: {
    tokens: number;
    created_at: string;
    embedding_version: string;
  };
}
```

**Implementation Details**:
- Hybrid search: BM25 + vector search with fusion
- Multi-level filtering support
- Result caching with TTL
- Search analytics and logging
- Automatic query expansion for classical Chinese

### 2.3 Annotation API - POST /api/annotate

**Purpose**: Generate bidirectional annotations with streaming

```typescript
// Request Schema
interface AnnotateRequest {
  query: string;
  passage: string;
  passage_id?: string;
  model?: "glm" | "qwen" | "gpt"; // default: glm
  temperature?: number; // default: 0.7
  max_tokens?: number; // default: 500
  include_links?: boolean; // default: true
  style?: "academic" | "poetic" | "simple"; // default: simple
}

// Streaming Response (JSON Lines)
// Chunk 1: Annotation start
{
  "type": "start",
  "data": {
    "request_id": "uuid-xxx",
    "model": "glm-4.5",
    "timestamp": "2025-01-10T10:00:00Z"
  }
}

// Chunk 2-N: Streaming annotation
{
  "type": "chunk",
  "data": {
    "section": "six_to_me" | "me_to_six",
    "content": "这段经文讲'克己复礼'...",
    "progress": 0.45 // optional progress indicator
  }
}

// Final Chunk: Metadata and links
{
  "type": "meta",
  "data": {
    "reason": "semantic",
    "confidence": 0.87,
    "links": [
      {
        "to_id": "LJ_041",
        "text": "君子求诸己",
        "reason": "semantic",
        "score": 0.72
      }
    ],
    "processing_time_ms": 2500,
    "tokens_used": {
      "input": 150,
      "output": 280
    }
  }
}

// End Chunk
{
  "type": "end",
  "data": {
    "complete": true,
    "total_chunks": 5
  }
}
```

**Implementation Details**:
- Server-sent events for real-time streaming
- Fallback to non-streaming if connection issues
- Token counting for cost tracking
- Automatic retry on failure
- Response caching for identical requests

## 3. Database Schema Design (LanceDB)

### 3.1 Primary Table: classics

```typescript
interface ClassicsSchema {
  // Primary fields
  id: string; // UUID
  text: string; // Original text (50-200 chars)

  // Metadata
  book: string; // 论语, 孟子, 大学, 中庸, 诗经, 尚书
  chapter: string; // Chapter name
  section: number; // Section number
  paragraph: number; // Paragraph within section

  // Vector embedding
  vector: FixedSizeArray<float, 1024>; // bge-m3 embedding

  // Search optimization
  tokens: number; // Token count for BM25
  keywords: string[]; // Extracted keywords

  // Annotations cache
  cached_annotations?: {
    [query_hash: string]: {
      six_to_me: string;
      me_to_six: string;
      links: Link[];
      created_at: string;
    };
  };

  // Timestamps
  created_at: string;
  updated_at: string;
  version: string; // EMB_V1_BGE_M3
}
```

### 3.2 Secondary Table: user_notes

```typescript
interface UserNotesSchema {
  // Primary fields
  id: string; // UUID
  user_id: string; // Anonymous user ID

  // Content
  original_text: string; // User's input
  annotation: {
    query: string;
    passage: string;
    passage_id: string;
    six_to_me: string;
    me_to_six: string;
    links: Link[];
  };

  // Feedback
  rating?: number; // 1-5 stars
  feedback?: string;

  // Timestamps
  created_at: string;
}
```

### 3.3 Index Strategy

```typescript
// Vector index for semantic search
const vectorIndex = {
  type: "IVF_PQ",
  metric: "cosine",
  nlist: 1000,
  nprobe: 10
};

// Full-text search index
const ftsIndex = {
  type: "inverted",
  fields: ["text", "keywords"],
  analyzer: "chinese"
};

// Metadata filter index
const metadataIndex = {
  type: "btree",
  fields: ["book", "chapter", "section"]
};
```

## 4. Frontend Component Architecture

### 4.1 Component Hierarchy

```typescript
// Page Components
app/
├── page.tsx                 // Main search interface
├── annotate/[id]/page.tsx   // Detailed annotation view
└── explore/page.tsx         // Graph exploration view

// Feature Components
components/
├── search/
│   ├── SearchInput.tsx      // Query input with suggestions
│   ├── SearchResults.tsx    // Results list with pagination
│   └── ResultCard.tsx       // Individual result card
├── annotation/
│   ├── StreamingAnnotation.tsx  // Streaming annotation display
│   ├── AnnotationSection.tsx    // Six-to-me / Me-to-six sections
│   └── LinkChips.tsx           // Exploration links
├── visualization/
│   ├── KnowledgeGraph.tsx   // D3/Cytoscape graph
│   └── NodeDetail.tsx       // Node detail panel
└── common/
    ├── LoadingSpinner.tsx   // Loading states
    ├── ErrorBoundary.tsx    // Error handling
    └── CacheIndicator.tsx   // Cache hit/miss indicator
```

### 4.2 State Management

```typescript
// Global State (Zustand)
interface AppState {
  // Search state
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;

  // Annotation state
  currentAnnotation: Annotation | null;
  annotationHistory: Annotation[];

  // UI state
  selectedTheme: "light" | "dark";
  language: "zh" | "en";

  // Cache state
  cacheStatus: Record<string, "hit" | "miss">;
}

// Local state with SWR for server state
const useSearchResults = (query: string) => {
  return useSWR(
    query ? `/api/search?q=${query}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000
    }
  );
};
```

## 5. LLM Integration Patterns

### 5.1 Adapter Pattern Implementation

```typescript
// lib/llm.ts
interface LLMProvider {
  name: string;
  generateAnnotation(
    prompt: string,
    options: GenerationOptions
  ): Promise<AsyncGenerator<AnnotationChunk>>;
  validateApiKey(): Promise<boolean>;
  estimateTokens(text: string): number;
}

class GLMProvider implements LLMProvider {
  name = "glm";

  async generateAnnotation(
    prompt: string,
    options: GenerationOptions
  ): Promise<AsyncGenerator<AnnotationChunk>> {
    // GLM-4.5 streaming implementation
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "glm-4.5",
        messages: [{ role: "user", content: prompt }],
        stream: true,
        temperature: options.temperature,
        max_tokens: options.maxTokens
      })
    });

    return this.parseStream(response);
  }
}

class LLMRouter {
  providers: Map<string, LLMProvider> = new Map();

  constructor() {
    this.providers.set("glm", new GLMProvider());
    this.providers.set("qwen", new QwenProvider());
    this.providers.set("openai", new OpenAIProvider());
  }

  async getProvider(model: string): Promise<LLMProvider> {
    const provider = this.providers.get(model);
    if (!provider || !(await provider.validateApiKey())) {
      // Fallback logic
      return this.getFallbackProvider();
    }
    return provider;
  }

  private async getFallbackProvider(): Promise<LLMProvider> {
    // Try providers in order of preference
    const fallbackOrder = ["glm", "qwen", "openai"];
    for (const model of fallbackOrder) {
      const provider = this.providers.get(model);
      if (provider && await provider.validateApiKey()) {
        return provider;
      }
    }
    throw new Error("No valid LLM provider available");
  }
}
```

### 5.2 Prompt Templates with Versioning

```typescript
// prompts/annotations/v1.ts
export const ANNOTATION_PROMPT_V1 = `
你是一位精通《六经》的AI注释者。

请为以下文本生成双向注释：

现代句子：{{query}}
经典段落：{{passage}}
出处：{{source}}

输出要求：
1. 【六经注我】从经典角度解释现代句子（80-120字）
2. 【我注六经】从现代角度反观经典（80-120字）
3. 生成1-3个延伸链接，包含：
   - to_id: 相关段落ID
   - reason: semantic|contrast|symbolic
   - score: 相关度分数

输出格式（JSON）：
{
  "six_to_me": "...",
  "me_to_six": "...",
  "links": [
    {"to_id": "LJ_023", "reason": "semantic", "score": 0.75}
  ]
}
`;

// prompts/search/v1.ts
export const QUERY_EXPANSION_PROMPT = `
输入查询：{{query}}

请生成用于检索《六经》的关键词：

输出要求：
1. 3-5个核心关键词（用于BM25）
2. 2-3个语义扩展词（用于向量检索）

输出格式（JSON）：
{
  "keywords": ["关键词1", "关键词2"],
  "semantic_terms": ["概念1", "概念2"]
}
`;
```

## 6. Deployment Architecture

### 6.1 Production Deployment (Vercel)

```yaml
# vercel.json
{
  "functions": {
    "app/api/embed/route.ts": {
      "maxDuration": 30,
      "memory": 1024
    },
    "app/api/search/route.ts": {
      "maxDuration": 30,
      "memory": 1024
    },
    "app/api/annotate/route.ts": {
      "maxDuration": 60,
      "memory": 2048
    }
  },
  "build": {
    "env": {
      "NEXT_PUBLIC_API_URL": "@api-url"
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "s-maxage=60, stale-while-revalidate"
        }
      ]
    }
  ]
}
```

### 6.2 Database Deployment Strategy

```typescript
// LanceDB on Vercel
const dbConfig = {
  // Local development
  local: {
    path: "./data/lancedb",
    useTls: false
  },

  // Production (Vercel KV for caching)
  production: {
    path: "/tmp/lancedb", // Vercel's writable directory
    cacheProvider: "vercel-kv",
    backupProvider: "aws-s3",
    syncInterval: 300000 // 5 minutes
  }
};

// Migration path for scaling
const migrationStrategy = {
  "< 10k records": "LanceDB",
  "10k-100k records": "LanceDB + S3 backup",
  "> 100k records": "Supabase + pgvector"
};
```

### 6.3 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test
      - run: npm run lint
      - run: npm run type-check

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

## 7. Error Handling & Caching Strategies

### 7.1 Error Handling

```typescript
// lib/errors.ts
export class InfiDaoError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

export const ErrorCodes = {
  // Embedding errors
  EMBEDDING_FAILED: "EMBEDDING_FAILED",
  MODEL_NOT_LOADED: "MODEL_NOT_LOADED",

  // Search errors
  SEARCH_FAILED: "SEARCH_FAILED",
  INVALID_QUERY: "INVALID_QUERY",
  NO_RESULTS: "NO_RESULTS",

  // Annotation errors
  ANNOTATION_FAILED: "ANNOTATION_FAILED",
  LLM_TIMEOUT: "LLM_TIMEOUT",
  TOKEN_LIMIT_EXCEEDED: "TOKEN_LIMIT_EXCEEDED",

  // System errors
  DATABASE_ERROR: "DATABASE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",
  RATE_LIMITED: "RATE_LIMITED"
};

// Error handling middleware
export const errorHandler = (error: Error) => {
  if (error instanceof InfiDaoError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    };
  }

  // Log unknown errors
  console.error("Unhandled error:", error);

  return {
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred"
    }
  };
};
```

### 7.2 Caching Strategy

```typescript
// lib/cache.ts
interface CacheConfig {
  // Embedding cache
  embeddings: {
    ttl: 86400000; // 24 hours
    maxSize: 10000; // entries
  },

  // Search cache
  search: {
    ttl: 300000; // 5 minutes
    maxSize: 5000;
  },

  // Annotation cache
  annotations: {
    ttl: 3600000; // 1 hour
    maxSize: 2000;
  }
}

// Multi-level cache implementation
class CacheManager {
  private memoryCache: Map<string, CacheEntry>;
  private redis: Redis; // Production

  async get(key: string, level: "memory" | "redis" | "all" = "all") {
    // Try memory first
    if (level === "memory" || level === "all") {
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && !this.isExpired(memoryEntry)) {
        return memoryEntry.value;
      }
    }

    // Try Redis
    if (level === "redis" || level === "all") {
      const redisValue = await this.redis.get(key);
      if (redisValue) {
        const parsed = JSON.parse(redisValue);
        // Backfill memory cache
        this.memoryCache.set(key, {
          value: parsed,
          timestamp: Date.now()
        });
        return parsed;
      }
    }

    return null;
  }

  async set(key: string, value: any, ttl: number) {
    // Set in memory
    this.memoryCache.set(key, {
      value,
      timestamp: Date.now()
    });

    // Set in Redis (production)
    if (this.redis) {
      await this.redis.setex(key, ttl / 1000, JSON.stringify(value));
    }
  }
}
```

### 7.3 Performance Monitoring

```typescript
// lib/monitoring.ts
export class PerformanceMonitor {
  private metrics: Map<string, Metric[]> = new Map();

  async trackOperation<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    const startMemory = process.memoryUsage();

    try {
      const result = await fn();

      const duration = performance.now() - start;
      const endMemory = process.memoryUsage();

      this.recordMetric(operation, {
        duration,
        memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
        success: true
      });

      return result;
    } catch (error) {
      this.recordMetric(operation, {
        duration: performance.now() - start,
        success: false,
        error: error.message
      });
      throw error;
    }
  }

  getMetrics(operation: string, period: number = 3600000) {
    const now = Date.now();
    return this.metrics
      .get(operation)
      ?.filter(m => now - m.timestamp < period) || [];
  }
}
```

## 8. Scaling Considerations

### 8.1 Horizontal Scaling

1. **API Layer**: Stateless functions on Vercel
2. **Database**:
   - LanceDB for <10k records
   - Supabase + pgvector for >100k records
3. **Cache Layer**: Vercel KV or Redis Cloud
4. **Model Serving**:
   - Local bge-m3 for MVP
   - API-based embeddings for scale

### 8.2 Bottleneck Mitigation

| Bottleneck | Solution | Implementation |
|------------|----------|----------------|
| Model Loading | Warmup & Persist | Preload models, keep in memory |
| Vector Search | Index Optimization | IVF_PQ, proper nlist/nprobe |
| LLM API Latency | Batching & Caching | Batch requests, KV cache |
| Database Size | Sharding | Horizontal sharding by book |

### 8.3 Cost Optimization

```typescript
// Cost tracking
const costTracker = {
  // Model costs per 1M tokens
  models: {
    "bge-m3": 0, // Local hosting
    "glm-4.5": 0.1, // $0.1 per 1M
    "qwen": 0.008, // $0.008 per 1M
    "gpt-4": 30, // $30 per 1M
  },

  // Track usage
  track(model: string, tokens: number) {
    const cost = (tokens / 1000000) * this.models[model];
    // Log to analytics
  }
};
```

This architecture provides a solid foundation for the InfiDao "六经注我" system that can scale from MVP to production while maintaining performance, reliability, and cost-effectiveness.