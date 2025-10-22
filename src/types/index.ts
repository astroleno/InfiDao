// Core domain types for the InfiDao "六经注我" project

// ============= Data Types =============

// 经文段落类型
export interface Passage {
  id: string;
  text: string;
  source: string;
  chapter: string;
  section: number;
  vector?: number[];
  created_at?: string;
  metadata?: {
    tags?: string[];
    difficulty?: number;
    importance?: number;
    translations?: { [lang: string]: string };
  };
}

// 用户输入类型
export interface Note {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  metadata?: {
    context?: string;
    tags?: string[];
    private?: boolean;
  };
}

// 关联结果类型
export interface Annotation {
  id: string;
  note_id: string;
  passage_id: string;
  score: number;
  reason: 'semantic' | 'contrast' | 'symbolic' | 'historical' | 'philosophical';
  six_to_me: string;
  me_to_six: string;
  links: Array<{
    to_passage: string;
    score: number;
    relation_type: string;
  }>;
  metadata?: {
    confidence?: number;
    alternative_interpretations?: string[];
  };
}

// ============= API Types =============

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    request_id: string;
    version: string;
  };
}

// API 错误类型
export interface ApiError {
  code: string;
  message: string;
  status: number;
  details?: any;
}

// 搜索请求类型
export interface SearchRequest {
  query: string;
  top_k?: number;
  threshold?: number;
  hybrid?: boolean;
  filters?: {
    book?: string[];
    chapter?: string[];
    section_range?: [number, number];
    tags?: string[];
  };
  weights?: {
    vector?: number;
    bm25?: number;
    semantic?: number;
  };
  rerank?: boolean;
  expand_query?: boolean;
}

// 搜索结果类型
export interface SearchResult {
  id: string;
  text: string;
  source: string;
  chapter: string;
  section: number;
  score: number;
  similarity_score?: number;
  bm25_score?: number;
  metadata?: {
    tags?: string[];
    difficulty?: number;
    importance?: number;
    highlighted_text?: string;
    context_before?: string;
    context_after?: string;
  };
}

// Embedding 请求类型
export interface EmbedRequest {
  text: string;
  batch?: boolean;
  texts?: string[];
  normalize?: boolean;
  precision?: 'float16' | 'float32' | 'uint8';
}

// Embedding 响应类型
export interface EmbedResponse {
  success: boolean;
  data: {
    id: string;
    vector?: number[];
    vectors?: number[][];
    vector_length: number;
    processing_time_ms: number;
  };
  version: string;
  model: string;
}

// 注解请求类型
export interface AnnotateRequest {
  note: string;
  context?: string;
  options?: {
    max_passages?: number;
    threshold?: number;
    include_links?: boolean;
    style?: 'academic' | 'poetic' | 'modern' | 'classical';
  };
}

// 注解流式响应类型
export interface StreamChunk {
  type: 'chunk' | 'meta' | 'annotation' | 'error' | 'end';
  data: any;
  chunk_id?: string;
  sequence?: number;
}

// Health Check 响应类型
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  services: {
    database: ServiceStatus;
    embedding: ServiceStatus;
    llm: ServiceStatus;
    cache: ServiceStatus;
  };
  version: string;
  uptime: number;
  timestamp: string;
}

export interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  response_time_ms?: number;
  error?: string;
  last_check: string;
}

// ============= Configuration Types =============

// LLM Provider 类型
export type LLMProvider = 'glm' | 'qwen' | 'gpt' | 'claude' | 'openai';

// Embedding Model 类型
export type EmbeddingModel = 'bge-m3' | 'text2vec' | 'openai' | 'custom';

// 缓存配置类型
export interface CacheConfig {
  l1: {
    maxSize: number;
    defaultTTL: number;
  };
  l2?: {
    redis: {
      host?: string;
      port?: number;
      url?: string;
      password?: string;
      db?: number;
    };
    keyPrefix: string;
    defaultTTL: number;
  };
}

// 数据库配置类型
export interface DatabaseConfig {
  type: 'lancedb';
  path: string;
  embeddingsTable: string;
  passagesTable: string;
  cacheSize?: number;
}

// ============= Internal Service Types =============

// 数据库 Schema
export interface DatabaseSchema {
  id: string;
  text: string;
  source: string;
  chapter: string;
  section: number;
  vector: number[];
  created_at: string;
  metadata?: any;
}

// 搜索引擎选项
export interface SearchOptions {
  query: string;
  topK: number;
  threshold: number;
  hybrid: boolean;
  filters?: SearchFilters;
  weights?: SearchWeights;
  rerank: boolean;
  expandQuery: boolean;
}

export interface SearchFilters {
  book?: string[];
  chapter?: string[];
  section_range?: [number, number];
  tags?: string[];
}

export interface SearchWeights {
  vector: number;
  bm25: number;
  semantic: number;
}

// LLM 响应类型
export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
  finish_reason?: string;
}

// 向量相似度结果
export interface VectorSimilarityResult {
  id: string;
  score: number;
  distance: number;
  passage: Passage;
}

// BM25 搜索结果
export interface BM25Result {
  id: string;
  score: number;
  matched_terms: string[];
  passage: Passage;
}

// ============= Utility Types =============

// 异步结果类型
export interface AsyncResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  loading?: boolean;
}

// 分页类型
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

// 统计信息类型
export interface SearchStats {
  total_queries: number;
  avg_response_time: number;
  cache_hit_rate: number;
  popular_queries: Array<{
    query: string;
    count: number;
  }>;
}

// 性能指标类型
export interface PerformanceMetrics {
  query_time_ms: number;
  embedding_time_ms?: number;
  search_time_ms?: number;
  llm_time_ms?: number;
  cache_hit?: boolean;
  database_queries?: number;
  memory_usage_mb?: number;
}

// ============= Event Types =============

// 搜索事件
export interface SearchEvent {
  type: 'search';
  query: string;
  results_count: number;
  response_time: number;
  user_id?: string;
  session_id?: string;
}

// 注解事件
export interface AnnotationEvent {
  type: 'annotation';
  note_id: string;
  passages_found: number;
  generation_time: number;
  user_id?: string;
  session_id?: string;
}

// 错误事件
export interface ErrorEvent {
  type: 'error';
  error_code: string;
  error_message: string;
  context?: any;
  user_id?: string;
  session_id?: string;
}