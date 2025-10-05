# InfiDao Database Architecture & Data Management Strategy

> Complete database design for the "六经注我" project supporting scalable semantic search and annotations
> Version: 1.0 | Updated: 2025-10-06

## Table of Contents
1. [Overview](#overview)
2. [LanceDB Schema Design](#lancedb-schema-design)
3. [Indexing Strategy](#indexing-strategy)
4. [Migration Path to Supabase/pgvector](#migration-path)
5. [Hybrid Search Architecture](#hybrid-search-architecture)
6. [Multi-Tier Caching Strategy](#multi-tier-caching-strategy)
7. [Data Import Pipeline](#data-import-pipeline)
8. [Backup & Maintenance](#backup--maintenance)
9. [Performance Optimization](#performance-optimization)
10. [Scaling Considerations](#scaling-considerations)

## Overview

### System Requirements
- **Primary Storage**: LanceDB (local) → Supabase/pgvector (cloud)
- **Vector Dimensions**: 1024 (bge-m3 model)
- **Data Volume**: 5K → 100K+ passages
- **Query Types**: Semantic search, Hybrid search, Annotations
- **Performance**: P99 < 3s, Cache hit < 1.2s

### Data Entities
1. **Passages**: Six Classics text chunks with embeddings
2. **User Notes**: User inputs and annotations
3. **Annotations**: Two-way interpretations (六经注我/我注六经)
4. **Embeddings**: Vector representations (cached)
5. **Search Cache**: KV store for query results

## LanceDB Schema Design

### 1. Core Passages Table

```typescript
// lib/db/schema.ts
export const PassageSchema = {
  // Primary identifiers
  id: "string",                    // UUID: "LJ_015", "DS_103", etc.
  book: "string",                  // 六经: 论语, 孟子, 大学, 中庸, 诗经, 尚书
  chapter: "string",               // Chapter name: "学而", "颜渊篇"
  section: "uint32",               // Section number within chapter

  // Content
  text: "string",                  // Original text (50-200 chars)
  tokens: "uint16",                // Token count for performance monitoring

  // Vector representation
  vector: "float[1024]",           // bge-m3 embedding, normalized

  // Metadata
  created_at: "timestamp",         // Import timestamp
  updated_at: "timestamp",         // Last update
  version: "string",               // EMB_V1_BGE_M3
  checksum: "string",              // SHA-256 for integrity
} as const;
```

### 2. User Notes Table

```typescript
export const NoteSchema = {
  // Primary identifiers
  id: "string",                    // UUID v4
  user_id: "string",               // User identifier (session-based initially)

  // Content
  text: "string",                  // User input text
  original_embedding: "float[1024]", // Cached embedding

  // Metadata
  created_at: "timestamp",
  ip_hash: "string",               // For basic analytics
  session_id: "string",            // Session tracking
} as const;
```

### 3. Annotations Table

```typescript
export const AnnotationSchema = {
  // Primary identifiers
  id: "string",                    // UUID v4
  note_id: "string",               // Foreign key to notes
  passage_id: "string",            // Foreign key to passages

  // Scoring
  similarity_score: "float32",     // 0.0 - 1.0
  relevance_score: "float32",      // Weighted score

  // Two-way annotations
  six_to_me: "string",             // 六经注我 (80-120 chars)
  me_to_six: "string",             // 我注六经 (80-120 chars)

  // Relationships
  reason_type: "string",           // semantic | contrast | symbolic
  links: "string",                 // JSON array of related passages

  // Generation metadata
  model_used: "string",            // glm-4.5 | qwen | gpt-4
  generation_time_ms: "uint32",    // Performance metric
  created_at: "timestamp",
} as const;
```

### 4. Search Cache Table (KV Store)

```typescript
export const SearchCacheSchema = {
  // Cache key
  cache_key: "string",             // SHA-256 of query+params

  // Cached data
  query: "string",                 // Original query
  results: "string",               // JSON array of search results
  count: "uint16",                 // Number of results

  // Cache metadata
  hit_count: "uint32",             // Usage statistics
  created_at: "timestamp",
  expires_at: "timestamp",         // TTL: 5-30 minutes
  version: "string",               // Cache version for invalidation
} as const;
```

## Indexing Strategy

### 1. Vector Index (IVF-PQ)

```typescript
// lib/db/indexes.ts
export const VectorIndexConfig = {
  type: "IVF_PQ",
  params: {
    nlist: 100,                    // Number of clusters
    nprobe: 10,                    // Clusters to search
    m: 8,                          // PQ sub-vectors
    nbits: 8,                      // Bits per sub-vector
  },
  metric: "cosine",                // Cosine similarity
} as const;
```

### 2. Full-Text Search Index (BM25)

```typescript
export const FTSIndexConfig = {
  analyzer: "chinese",             // Chinese analyzer
  fields: ["text", "book", "chapter"],
  ngram: [1, 2],                  // Unigrams and bigrams
  stopwords: false,               // Keep all terms for classical Chinese
} as const;
```

### 3. Composite Indexes

```typescript
// For filtering and sorting
export const CompositeIndexes = [
  {
    name: "idx_book_chapter",
    columns: ["book", "chapter"],
  },
  {
    name: "idx_created_at",
    columns: ["created_at"],
  },
  {
    name: "idx_similarity_score",
    columns: ["similarity_score"],
  },
];
```

## Migration Path to Supabase/pgvector

### Phase 1: Schema Mapping

```sql
-- Supabase PostgreSQL schema
-- 1. Passages table
CREATE TABLE passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book TEXT NOT NULL,
  chapter TEXT NOT NULL,
  section INTEGER NOT NULL,
  text TEXT NOT NULL,
  tokens INTEGER,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version TEXT DEFAULT 'EMB_V1_BGE_M3',
  checksum TEXT,

  -- Constraints
  CONSTRAINT passages_book_chapter_section_unique
    UNIQUE (book, chapter, section)
);

-- Vector index
CREATE INDEX passages_embedding_idx ON passages
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 2. User notes
CREATE TABLE user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  original_embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_hash TEXT,
  session_id TEXT
);

-- 3. Annotations
CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID REFERENCES user_notes(id),
  passage_id UUID REFERENCES passages(id),
  similarity_score FLOAT,
  relevance_score FLOAT,
  six_to_me TEXT,
  me_to_six TEXT,
  reason_type TEXT CHECK (reason_type IN ('semantic', 'contrast', 'symbolic')),
  links JSONB,
  model_used TEXT,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for performance
  INDEX idx_annotations_note_id (note_id),
  INDEX idx_annotations_passage_id (passage_id),
  INDEX idx_annotations_similarity (similarity_score DESC)
);

-- 4. Search cache (using Redis instead in production)
-- For Supabase, use a separate Redis instance
```

### Phase 2: Migration Script

```typescript
// scripts/migrate-to-supabase.ts
import { createClient } from '@supabase/supabase-js';
import lancedb from '@lancedb/lancedb';

export class MigrationManager {
  private supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
  private lancedb = await lancedb.connect('./data/lancedb');

  async migratePassages() {
    const lancedbTable = await this.lancedb.openTable('classics');
    const passages = await lancedbTable.search().limit(10000).execute();

    // Batch insert to Supabase
    for (const batch of this.chunk(passages, 100)) {
      await this.supabase.from('passages').insert(
        batch.map(p => ({
          id: p.id,
          book: p.book,
          chapter: p.chapter,
          section: p.section,
          text: p.text,
          tokens: p.tokens,
          embedding: p.vector,
          checksum: p.checksum,
        }))
      );
    }
  }

  async validateMigration() {
    const lancedbCount = await this.lancedbTable.countRows();
    const supabaseCount = await this.supabase
      .from('passages')
      .select('*', { count: 'exact', head: true });

    console.log(`LanceDB: ${lancedbCount}, Supabase: ${supabaseCount}`);
    return lancedbCount === supabaseCount;
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

## Hybrid Search Architecture

### 1. Search Pipeline

```typescript
// lib/search/hybrid.ts
export interface HybridSearchOptions {
  query: string;
  topK: number;
  threshold: number;
  hybrid: boolean;
  filters?: {
    book?: string[];
    chapter?: string[];
  };
  weights?: {
    vector: number;    // Default: 0.7
    bm25: number;      // Default: 0.3
  };
}

export class HybridSearchEngine {
  constructor(
    private vectorDB: VectorDatabase,
    private ftsIndex: FullTextIndex,
    private cache: SearchCache
  ) {}

  async search(options: HybridSearchOptions): Promise<SearchResult[]> {
    // 1. Check cache first
    const cacheKey = this.generateCacheKey(options);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    // 2. Parallel search
    const [vectorResults, bm25Results] = await Promise.all([
      this.vectorSearch(options),
      this.bm25Search(options)
    ]);

    // 3. Merge and rerank
    const merged = this.mergeResults(
      vectorResults,
      bm25Results,
      options.weights || { vector: 0.7, bm25: 0.3 }
    );

    // 4. Apply filters
    const filtered = this.applyFilters(merged, options.filters);

    // 5. Cache results
    await this.cache.set(cacheKey, filtered, { ttl: 300 }); // 5 min

    return filtered;
  }

  private async vectorSearch(options: HybridSearchOptions): Promise<ScoredResult[]> {
    const embedding = await this.generateEmbedding(options.query);
    return await this.vectorDB.search(embedding, {
      topK: options.topK * 2, // Get more for reranking
      threshold: options.threshold * 0.8, // Lower threshold for recall
    });
  }

  private async bm25Search(options: HybridSearchOptions): Promise<ScoredResult[]> {
    const keywords = await this.extractKeywords(options.query);
    return await this.ftsIndex.search(keywords, {
      topK: options.topK * 2,
      fields: ['text', 'book', 'chapter'],
    });
  }

  private mergeResults(
    vector: ScoredResult[],
    bm25: ScoredResult[],
    weights: { vector: number; bm25: number }
  ): ScoredResult[] {
    const scoreMap = new Map<string, ScoredResult>();

    // Add vector scores
    vector.forEach(r => {
      scoreMap.set(r.id, { ...r, score: r.score * weights.vector });
    });

    // Add BM25 scores
    bm25.forEach(r => {
      const existing = scoreMap.get(r.id);
      if (existing) {
        existing.score += r.score * weights.bm25;
      } else {
        scoreMap.set(r.id, { ...r, score: r.score * weights.bm25 });
      }
    });

    // Sort by final score
    return Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score);
  }
}
```

### 2. Query Expansion

```typescript
// lib/search/expansion.ts
export class QueryExpander {
  async expandQuery(query: string): Promise<ExpandedQuery> {
    // Use LLM to expand query with semantic terms
    const prompt = `
      扩展搜索查询，提供相关关键词和概念：
      原查询：${query}

      返回格式：
      {
        "original": "${query}",
        "keywords": ["关键词1", "关键词2"],
        "semantic_terms": ["概念1", "概念2"],
        "synonyms": ["同义词1", "同义词2"]
      }
    `;

    const result = await this.llm.complete(prompt);
    return JSON.parse(result);
  }
}
```

## Multi-Tier Caching Strategy

### 1. L1 Cache: In-Memory (Node.js)

```typescript
// lib/cache/l1.ts
export class L1Cache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000;
  private ttl = 60000; // 1 minute

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // LRU: move to end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: any, ttl?: number): void {
    // Evict if necessary
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttl || this.ttl),
    });
  }
}
```

### 2. L2 Cache: Redis (Embeddings & Search Results)

```typescript
// lib/cache/l2.ts
export class L2Cache {
  private redis: Redis;

  async getEmbedding(text: string): Promise<Float32Array | null> {
    const key = `emb:${this.hash(text)}`;
    const data = await this.redis.get(key);
    return data ? new Float32Array(JSON.parse(data)) : null;
  }

  async setEmbedding(text: string, embedding: Float32Array): Promise<void> {
    const key = `emb:${this.hash(text)}`;
    await this.redis.setex(key, 86400, JSON.stringify(Array.from(embedding))); // 24h
  }

  async getSearchResults(query: string, params: any): Promise<SearchResult[] | null> {
    const key = `search:${this.hash(JSON.stringify({ query, params }))}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async setSearchResults(query: string, params: any, results: SearchResult[]): Promise<void> {
    const key = `search:${this.hash(JSON.stringify({ query, params }))}`;
    await this.redis.setex(key, 1800, JSON.stringify(results)); // 30 min
  }

  private hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').substring(0, 16);
  }
}
```

### 3. L3 Cache: Database Buffer Pool

```typescript
// LanceDB automatically manages buffer pool
// For pgvector, configure shared_buffers = 256MB
```

### 4. Cache Hierarchy Manager

```typescript
// lib/cache/manager.ts
export class CacheManager {
  constructor(
    private l1: L1Cache,
    private l2: L2Cache,
    private l3: Database
  ) {}

  async get(key: string): Promise<any> {
    // Try L1
    let result = await this.l1.get(key);
    if (result) {
      this.updateMetrics('L1_HIT');
      return result;
    }

    // Try L2
    result = await this.l2.get(key);
    if (result) {
      await this.l1.set(key, result);
      this.updateMetrics('L2_HIT');
      return result;
    }

    // Try L3
    result = await this.l3.get(key);
    if (result) {
      await this.l2.set(key, result);
      await this.l1.set(key, result);
      this.updateMetrics('L3_HIT');
      return result;
    }

    this.updateMetrics('MISS');
    return null;
  }
}
```

## Data Import Pipeline

### 1. Text Preprocessing

```typescript
// scripts/preprocess.ts
export class TextPreprocessor {
  async chunkText(text: string, source: string): Promise<TextChunk[]> {
    // Use LLM for semantic chunking
    const prompt = `
      将以下古籍文本按语义切分为合适的段落（每段50-200字）：
      ${text}

      要求：
      1. 保持语义完整性
      2. 按JSON数组格式返回
      3. 每段包含原文、出处、章节信息

      格式：
      [
        {
          "text": "原文内容",
          "source": "${source}",
          "chapter": "章节名",
          "section": 1
        }
      ]
    `;

    const result = await this.llm.complete(prompt);
    const chunks = JSON.parse(result);

    // Post-process chunks
    return chunks.map((chunk, index) => ({
      ...chunk,
      id: this.generateId(source, chunk.chapter, index),
      section: chunk.section || index + 1,
      tokens: this.countTokens(chunk.text),
      checksum: this.checksum(chunk.text),
    }));
  }

  private generateId(source: string, chapter: string, index: number): string {
    const abbrev = this.getAbbreviation(source);
    const chapterAbbr = this.getChapterAbbreviation(chapter);
    return `${abbrev}_${chapterAbbr}_${String(index).padStart(3, '0')}`;
  }
}
```

### 2. Batch Embedding Generator

```typescript
// scripts/embeddings.ts
export class EmbeddingGenerator {
  private batchSize = 32;
  private modelPath = './models/bge-m3';
  private pipeline: any;

  async initialize(): Promise<void> {
    this.pipeline = await pipeline('feature-extraction', this.modelPath);
  }

  async generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);

      // Process batch
      const outputs = await Promise.all(
        batch.map(text => this.pipeline(text, {
          pooling: 'mean',
          normalize: true
        }))
      );

      // Convert to Float32Array
      batch.forEach((_, idx) => {
        const output = outputs[idx];
        const vector = Array.from(output.data || output[0]?.data || []);
        if (vector.length === 1024) {
          embeddings.push(new Float32Array(vector));
        } else {
          console.warn(`Invalid embedding dimension for text ${i + idx}`);
          embeddings.push(new Float32Array(1024)); // Placeholder
        }
      });

      // Progress update
      console.log(`Processed ${Math.min(i + this.batchSize, texts.length)}/${texts.length} texts`);
    }

    return embeddings;
  }
}
```

### 3. Complete Import Pipeline

```typescript
// scripts/import-pipeline.ts
export class ImportPipeline {
  constructor(
    private preprocessor: TextPreprocessor,
    private embedder: EmbeddingGenerator,
    private db: Database
  ) {}

  async importFromFiles(filePaths: string[]): Promise<ImportStats> {
    const stats: ImportStats = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    for (const filePath of filePaths) {
      console.log(`\nProcessing: ${filePath}`);

      // 1. Load raw text
      const rawText = await fs.readFile(filePath, 'utf-8');
      const source = path.basename(filePath, path.extname(filePath));

      // 2. Preprocess into chunks
      const chunks = await this.preprocessor.chunkText(rawText, source);
      stats.total += chunks.length;

      // 3. Generate embeddings
      const texts = chunks.map(c => c.text);
      const embeddings = await this.embedder.generateEmbeddings(texts);

      // 4. Prepare records
      const records = chunks.map((chunk, idx) => ({
        id: chunk.id,
        book: source,
        chapter: chunk.chapter,
        section: chunk.section,
        text: chunk.text,
        tokens: chunk.tokens,
        vector: Array.from(embeddings[idx]),
        created_at: new Date().toISOString(),
        version: 'EMB_V1_BGE_M3',
        checksum: chunk.checksum,
      }));

      // 5. Batch insert
      try {
        await this.db.batchInsert('passages', records, { batchSize: 100 });
        stats.success += records.length;
        console.log(`✓ Imported ${records.length} records from ${source}`);
      } catch (error) {
        stats.failed += records.length;
        console.error(`✗ Failed to import ${source}:`, error);
      }
    }

    // 6. Create indexes
    await this.db.createIndexes();

    return stats;
  }
}
```

### 4. Six Classics Data Format

```typescript
// data/six-classics/
export const SixClassicsStructure = {
  "论语": {
    "学而篇": {
      sections: 16,
      file: "lunyu/xue-er.txt",
    },
    "为政篇": {
      sections: 24,
      file: "lunyu/wei-zheng.txt",
    },
    // ... 20 chapters total
  },
  "孟子": {
    "梁惠王上": {
      sections: 7,
      file: "mengzi/liang-hui-wang-shang.txt",
    },
    // ... 7 books total
  },
  "大学": {
    "经一章": {
      sections: 1,
      file: "daxue/jing.txt",
    },
    "传十章": {
      sections: 10,
      file: "daxue/zhuan.txt",
    },
  },
  "中庸": {
    "第一章": {
      sections: 33,
      file: "zhongyong/chapter-1.txt",
    },
    // ... Total 33 sections
  },
  "诗经": {
    "国风": {
      "周南": 11,
      "召南": 14,
      // ... 15 sections total
    },
    "小雅": {
      // ... 74 poems
    },
    "大雅": {
      // ... 31 poems
    },
    "颂": {
      // ... 40 poems
    },
  },
  "尚书": {
    "虞书": 5,
    "夏书": 4,
    "商书": 17,
    "周书": 32,
  },
};
```

## Backup & Maintenance

### 1. Automated Backup Strategy

```typescript
// scripts/backup.ts
export class BackupManager {
  async createBackup(type: 'full' | 'incremental' = 'full'): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `./backups/${timestamp}`;

    await fs.ensureDir(backupDir);

    if (type === 'full') {
      // 1. Export LanceDB data
      await this.exportLanceDB(`${backupDir}/lancedb`);

      // 2. Export configuration
      await this.exportConfig(`${backupDir}/config`);

      // 3. Create checksum manifest
      await this.createManifest(`${backupDir}/manifest.json`);
    } else {
      // Incremental backup
      await this.exportChanges(`${backupDir}/changes`);
    }

    // 4. Compress
    await this.compress(backupDir);

    // 5. Upload to cloud (optional)
    if (process.env.BACKUP_S3_BUCKET) {
      await this.uploadToS3(`${backupDir}.tar.gz`);
    }

    return {
      path: `${backupDir}.tar.gz`,
      size: await fs.getSize(`${backupDir}.tar.gz`),
      type,
      timestamp: new Date(),
    };
  }

  async restoreBackup(backupPath: string): Promise<void> {
    // 1. Decompress
    const tempDir = await this.decompress(backupPath);

    // 2. Validate integrity
    await this.validateBackup(tempDir);

    // 3. Restore data
    await this.restoreLanceDB(`${tempDir}/lancedb`);

    // 4. Restore configuration
    await this.restoreConfig(`${tempDir}/config`);

    console.log('✓ Backup restored successfully');
  }
}
```

### 2. Data Validation & Integrity

```typescript
// scripts/validate.ts
export class DataValidator {
  async validateDatabase(): Promise<ValidationReport> {
    const report: ValidationReport = {
      totalRecords: 0,
      validRecords: 0,
      invalidRecords: [],
      checksumErrors: [],
      embeddingErrors: [],
    };

    // Scan all records
    const cursor = this.db.scan('passages');
    for await (const record of cursor) {
      report.totalRecords++;

      // Validate checksum
      const expectedChecksum = this.calculateChecksum(record.text);
      if (record.checksum !== expectedChecksum) {
        report.checksumErrors.push({
          id: record.id,
          expected: expectedChecksum,
          actual: record.checksum,
        });
      }

      // Validate embedding
      if (!record.vector || record.vector.length !== 1024) {
        report.embeddingErrors.push({
          id: record.id,
          actualLength: record.vector?.length || 0,
        });
      }

      // Check required fields
      if (record.text && record.book && record.chapter) {
        report.validRecords++;
      } else {
        report.invalidRecords.push({
          id: record.id,
          missing: this.getMissingFields(record),
        });
      }
    }

    return report;
  }

  async repairDatabase(report: ValidationReport): Promise<RepairResult> {
    const result: RepairResult = {
      fixed: 0,
      failed: 0,
    };

    // Fix checksums
    for (const error of report.checksumErrors) {
      try {
        await this.db.update('passages', error.id, {
          checksum: error.expected,
        });
        result.fixed++;
      } catch (e) {
        result.failed++;
      }
    }

    // Regenerate embeddings
    for (const error of report.embeddingErrors) {
      try {
        const record = await this.db.get('passages', error.id);
        const embedding = await this.generateEmbedding(record.text);
        await this.db.update('passages', error.id, {
          vector: Array.from(embedding),
        });
        result.fixed++;
      } catch (e) {
        result.failed++;
      }
    }

    return result;
  }
}
```

### 3. Performance Monitoring

```typescript
// lib/monitoring.ts
export class DatabaseMonitor {
  async collectMetrics(): Promise<DatabaseMetrics> {
    const metrics: DatabaseMetrics = {
      timestamp: new Date(),

      // Query performance
      queryLatency: await this.getQueryLatency(),
      queryThroughput: await this.getQueryThroughput(),

      // Cache performance
      cacheHitRates: await this.getCacheHitRates(),

      // Storage metrics
      storageUsage: await this.getStorageUsage(),
      indexSize: await this.getIndexSize(),

      // Vector search metrics
      vectorSearchLatency: await this.getVectorSearchLatency(),
      indexingProgress: await this.getIndexingProgress(),
    };

    // Alert if thresholds exceeded
    this.checkThresholds(metrics);

    return metrics;
  }

  private checkThresholds(metrics: DatabaseMetrics): void {
    if (metrics.queryLatency.p95 > 3000) {
      this.alert('Query latency P95 exceeded 3s');
    }

    if (metrics.cacheHitRates.l1 < 0.6) {
      this.alert('L1 cache hit rate below 60%');
    }

    if (metrics.storageUsage > 0.9) {
      this.alert('Storage usage above 90%');
    }
  }
}
```

## Performance Optimization

### 1. Query Optimization

```typescript
// lib/optimizations/query.ts
export class QueryOptimizer {
  async optimizeQuery(query: string): Promise<OptimizedQuery> {
    // 1. Analyze query complexity
    const complexity = this.analyzeComplexity(query);

    // 2. Select optimal strategy
    const strategy = this.selectStrategy(complexity);

    // 3. Precompute if beneficial
    if (strategy.shouldCache) {
      const cached = await this.getPrecomputed(query);
      if (cached) return cached;
    }

    // 4. Optimize search parameters
    const params = this.optimizeParams(strategy, query);

    return {
      query,
      params,
      strategy,
      estimatedLatency: this.estimateLatency(strategy),
    };
  }

  private optimizeParams(strategy: SearchStrategy, query: string): SearchParams {
    return {
      topK: strategy.topK || 5,
      threshold: strategy.threshold || 0.7,
      hybrid: strategy.hybrid !== false,
      useCache: strategy.useCache !== false,
      batch: strategy.batch || false,
    };
  }
}
```

### 2. Batch Processing

```typescript
// lib/optimizations/batch.ts
export class BatchProcessor {
  async processBatch<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    options: BatchOptions = {}
  ): Promise<R[]> {
    const {
      batchSize = 32,
      concurrency = 4,
      progressCallback,
    } = options;

    const results: R[] = [];
    const batches = this.createBatches(items, batchSize);

    // Process batches with concurrency control
    const semaphore = new Semaphore(concurrency);

    const promises = batches.map(async (batch, idx) => {
      await semaphore.acquire();

      try {
        const batchResults = await processor(batch);
        results.push(...batchResults);

        progressCallback?.({
          completed: idx + 1,
          total: batches.length,
          items: results.length,
        });

        return batchResults;
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);
    return results;
  }
}
```

### 3. Connection Pooling

```typescript
// lib/optimizations/pool.ts
export class ConnectionPool {
  private pool: DatabaseConnection[] = [];
  private maxConnections = 10;
  private activeConnections = 0;

  async acquire(): Promise<DatabaseConnection> {
    // Reuse existing connection
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    // Create new connection if under limit
    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      return await this.createConnection();
    }

    // Wait for available connection
    return new Promise((resolve) => {
      this.waitingQueue.push(resolve);
    });
  }

  release(connection: DatabaseConnection): void {
    if (this.waitingQueue.length > 0) {
      const resolve = this.waitingQueue.shift()!;
      resolve(connection);
    } else {
      this.pool.push(connection);
    }
  }
}
```

## Scaling Considerations

### 1. Horizontal Scaling Strategy

```typescript
// lib/scaling/horizontal.ts
export class HorizontalScaler {
  async scaleOut(readReplicas: number): Promise<void> {
    // 1. Provision read replicas
    for (let i = 0; i < readReplicas; i++) {
      const replica = await this.provisionReplica();
      await this.configureReplica(replica);
    }

    // 2. Update load balancer
    await this.updateLoadBalancer();

    // 3. Test failover
    await this.testFailover();
  }

  async distributeQuery(query: SearchQuery): Promise<SearchResult> {
    // Route to least loaded replica
    const replica = await this.selectReplica('least-loaded');

    // Execute query with fallback
    try {
      return await replica.execute(query);
    } catch (error) {
      // Fallback to primary
      console.warn('Replica failed, falling back to primary');
      return await this.primary.execute(query);
    }
  }
}
```

### 2. Sharding Strategy

```typescript
// lib/scaling/sharding.ts
export class ShardManager {
  private shards: Map<string, DatabaseShard> = new Map();

  async initializeShards(): Promise<void> {
    // Shard by book for optimal query patterns
    const books = ['论语', '孟子', '大学', '中庸', '诗经', '尚书'];

    for (const book of books) {
      const shard = await this.createShard(book);
      this.shards.set(book, shard);
    }
  }

  async query(shardKey: string, query: SearchQuery): Promise<SearchResult> {
    // Single shard query
    if (this.shards.has(shardKey)) {
      const shard = this.shards.get(shardKey)!;
      return await shard.query(query);
    }

    // Multi-shard query
    const promises = Array.from(this.shards.values())
      .map(shard => shard.query(query));

    const results = await Promise.all(promises);
    return this.mergeResults(results);
  }

  private mergeResults(results: SearchResult[]): SearchResult {
    // Merge results from multiple shards
    const allResults = results.flatMap(r => r.items);

    // Deduplicate and sort
    const unique = this.deduplicate(allResults);
    const sorted = unique.sort((a, b) => b.score - a.score);

    return {
      items: sorted.slice(0, 20), // Top 20
      total: unique.length,
      shards: results.length,
    };
  }
}
```

### 3. Auto-scaling Configuration

```yaml
# k8s/autoscaler.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: infidao-search-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: infidao-search
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: search_query_latency
      target:
        type: AverageValue
        averageValue: "2s"
```

## Implementation Roadmap

### Phase 1: MVP (5K passages)
- [x] LanceDB setup with basic schema
- [x] Embedding generation pipeline
- [x] Basic semantic search
- [x] Simple L1 caching
- [ ] Data import for all six classics
- [ ] Basic backup/restore

### Phase 2: Scale (20K passages)
- [ ] Hybrid search implementation
- [ ] L2 Redis caching
- [ ] Performance monitoring
- [ ] Query optimization
- [ ] Batch processing improvements

### Phase 3: Production (100K+ passages)
- [ ] Migration to Supabase/pgvector
- [ ] Read replicas setup
- [ ] Sharding implementation
- [ ] Advanced caching strategies
- [ ] Auto-scaling configuration

## Monitoring & Alerts

### Key Metrics to Track
1. **Query Performance**
   - P50, P95, P99 latency
   - QPS (queries per second)
   - Error rate

2. **Cache Performance**
   - Hit rates for L1/L2/L3
   - Eviction rates
   - Memory usage

3. **Database Health**
   - Connection pool usage
   - Index efficiency
   - Storage growth

4. **Vector Search**
   - Index build time
   - Search accuracy
   - Dimension reduction impact

### Alert Thresholds
- Query latency P95 > 3s
- Cache hit rate < 60%
- Error rate > 1%
- Storage usage > 80%
- Memory usage > 85%

## Security Considerations

1. **Data Encryption**
   - Encrypt embeddings at rest
   - TLS for data in transit
   - API key rotation

2. **Access Control**
   - Rate limiting per IP
   - API key authentication
   - Request size limits

3. **Privacy**
   - No user data persistence initially
   - Hash IP addresses
   - Optional session tracking

## Conclusion

This database architecture provides a robust foundation for the InfiDao project that can scale from MVP to production. The key design principles are:

1. **Progressive Enhancement**: Start simple, add complexity as needed
2. **Performance First**: Multi-tier caching for sub-second response times
3. **Scalability Ready**: Clear migration path to cloud solutions
4. **Reliability**: Automated backups, validation, and monitoring
5. **Cost Effective**: Use appropriate technology for each scale tier

The implementation should focus on the MVP first while keeping the scalability options open for future growth.