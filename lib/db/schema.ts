/**
 * Database Schema Definitions for InfiDao
 *
 * This file defines all schemas used in the project for both
 * LanceDB (local) and Supabase/pgvector (cloud) implementations.
 */

export const PASSAGE_TABLE = 'passages';
export const USER_NOTES_TABLE = 'user_notes';
export const ANNOTATIONS_TABLE = 'annotations';
export const SEARCH_CACHE_TABLE = 'search_cache';

// Core schemas for LanceDB
export const PassageSchema = {
  // Primary identifiers
  id: 'string',                    // UUID: "LJ_015", "DS_103", etc.
  book: 'string',                  // 六经: 论语, 孟子, 大学, 中庸, 诗经, 尚书
  chapter: 'string',               // Chapter name: "学而", "颜渊篇"
  section: 'uint32',               // Section number within chapter

  // Content
  text: 'string',                  // Original text (50-200 chars)
  tokens: 'uint16',                // Token count for performance monitoring

  // Vector representation
  vector: 'float[1024]',           // bge-m3 embedding, normalized

  // Metadata
  created_at: 'timestamp',         // Import timestamp
  updated_at: 'timestamp',         // Last update
  version: 'string',               // EMB_V1_BGE_M3
  checksum: 'string',              // SHA-256 for integrity
} as const;

export const UserNotesSchema = {
  // Primary identifiers
  id: 'string',                    // UUID v4
  user_id: 'string',               // User identifier (session-based initially)

  // Content
  text: 'string',                  // User input text
  original_embedding: 'float[1024]', // Cached embedding

  // Metadata
  created_at: 'timestamp',
  ip_hash: 'string',               // For basic analytics
  session_id: 'string',            // Session tracking
} as const;

export const AnnotationsSchema = {
  // Primary identifiers
  id: 'string',                    // UUID v4
  note_id: 'string',               // Foreign key to notes
  passage_id: 'string',            // Foreign key to passages

  // Scoring
  similarity_score: 'float32',     // 0.0 - 1.0
  relevance_score: 'float32',      // Weighted score

  // Two-way annotations
  six_to_me: 'string',             // 六经注我 (80-120 chars)
  me_to_six: 'string',             // 我注六经 (80-120 chars)

  // Relationships
  reason_type: 'string',           // semantic | contrast | symbolic
  links: 'string',                 // JSON array of related passages

  // Generation metadata
  model_used: 'string',            // glm-4.5 | qwen | gpt-4
  generation_time_ms: 'uint32',    // Performance metric
  created_at: 'timestamp',
} as const;

export const SearchCacheSchema = {
  // Cache key
  cache_key: 'string',             // SHA-256 of query+params

  // Cached data
  query: 'string',                 // Original query
  results: 'string',               // JSON array of search results
  count: 'uint16',                 // Number of results

  // Cache metadata
  hit_count: 'uint32',             // Usage statistics
  created_at: 'timestamp',
  expires_at: 'timestamp',         // TTL: 5-30 minutes
  version: 'string',               // Cache version for invalidation
} as const;

// TypeScript interfaces
export interface Passage {
  id: string;
  book: string;
  chapter: string;
  section: number;
  text: string;
  tokens: number;
  vector: Float32Array | number[];
  created_at: Date;
  updated_at: Date;
  version: string;
  checksum: string;
}

export interface UserNote {
  id: string;
  user_id: string;
  text: string;
  original_embedding?: Float32Array | number[];
  created_at: Date;
  ip_hash?: string;
  session_id?: string;
}

export interface Annotation {
  id: string;
  note_id: string;
  passage_id: string;
  similarity_score: number;
  relevance_score: number;
  six_to_me: string;
  me_to_six: string;
  reason_type: 'semantic' | 'contrast' | 'symbolic';
  links: AnnotationLink[];
  model_used: string;
  generation_time_ms: number;
  created_at: Date;
}

export interface AnnotationLink {
  to_passage: string;
  reason: 'semantic' | 'contrast' | 'symbolic';
  score: number;
}

export interface SearchCache {
  cache_key: string;
  query: string;
  results: string; // JSON string
  count: number;
  hit_count: number;
  created_at: Date;
  expires_at: Date;
  version: string;
}

// Database configuration
export const DatabaseConfig = {
  // LanceDB config
  lancedb: {
    path: process.env.LANCEDB_PATH || './data/lancedb',
    defaultTable: PASSAGE_TABLE,
    readOnly: false,
  },

  // Vector config
  vector: {
    dimension: parseInt(process.env.EMBEDDING_DIM || '1024'),
    model: process.env.EMBEDDING_MODEL || 'BAAI/bge-m3',
    normalize: true,
  },

  // Index config
  index: {
    type: 'IVF_PQ',
    nlist: 100,
    nprobe: 10,
    metric: 'cosine',
  },

  // Cache config
  cache: {
    defaultTTL: 1800, // 30 minutes
    maxEntries: 10000,
    batchSize: 100,
  },
} as const;

// Book abbreviations for ID generation
export const BOOK_ABBREVIATIONS: Record<string, string> = {
  '论语': 'LJ',
  '孟子': 'MZ',
  '大学': 'DX',
  '中庸': 'ZY',
  '诗经': 'SJ',
  '尚书': 'SS',
} as const;

// Chapter abbreviations
export const CHAPTER_ABBREVIATIONS: Record<string, Record<string, string>> = {
  '论语': {
    '学而篇': 'XE',
    '为政篇': 'WZ',
    '八佾篇': 'BY',
    '里仁篇': 'LR',
    '公冶长篇': 'GYC',
    '雍也篇': 'YY',
    '述而篇': 'SE',
    '泰伯篇': 'TB',
    '子罕篇': 'ZH',
    '乡党篇': 'XD',
    '先进篇': 'XJ',
    '颜渊篇': 'YY',
    '子路篇': 'ZL',
    '宪问篇': 'XW',
    '卫灵公篇': 'WL',
    '季氏篇': 'JS',
    '阳货篇': 'YG',
    '微子篇': 'WZ',
    '子张篇': 'ZZ',
    '尧曰篇': 'YY',
  },
  // Add more abbreviations as needed
} as const;