# Database Design & Schema

## 1. LanceDB Schema Definition

### 1.1 Primary Table: classics

```typescript
// lib/db/schema.ts
export const CLASSICS_SCHEMA = {
  // Primary identification
  id: "string",                    // UUID v4
  text: "string",                  // Original text (50-200 chars)

  // Hierarchical metadata
  book: "string",                  // 六经分类: 论语|孟子|大学|中庸|诗经|尚书
  chapter: "string",               // 章节名: 学而|为政|颜渊等
  section: "int32",                // 节序号
  paragraph: "int32",              // 段落序号

  // Vector embedding (bge-m3: 1024 dimensions)
  vector: "fixed_size_list[1024]:float",

  // Search optimization fields
  tokens: "int32",                 // Token count for BM25
  keywords: "list<string>",        // Extracted keywords
  ngrams: "list<string>",          // N-grams for exact match

  // Pre-computed annotations cache
  cached_annotations: "struct<query_hash:string,six_to_me:string,me_to_six:string,links:json,created_at:string>[]",

  // Analytics
  search_count: "int32",           // How many times this passage appears in results
  annotation_count: "int32",       // How many times annotated

  // Timestamps
  created_at: "string",            // ISO 8601
  updated_at: "string",            // ISO 8601
  version: "string",               // EMB_V1_BGE_M3
};

// Index configuration
export const CLASSICS_INDEXES = {
  // Vector index for similarity search
  vector: {
    type: "IVF_PQ",
    metric: "cosine",
    nlist: 1000,                   // Number of clusters
    nprobe: 10,                    // Search clusters
    training_sample_size: 10000    // Samples for index training
  },

  // Full-text search
  fts: {
    fields: ["text", "keywords", "ngrams"],
    tokenizer: "chinese",
    analyzer: "ik_max_word"
  },

  // Metadata filters
  metadata: {
    type: "btree",
    fields: ["book", "chapter", "section"]
  }
};
```

### 1.2 Secondary Table: user_interactions

```typescript
export const USER_INTERACTIONS_SCHEMA = {
  // Identification
  id: "string",                    // UUID v4
  session_id: "string",            // Anonymous session ID
  user_fingerprint: "string",      // Browser fingerprint

  // Interaction data
  interaction_type: "string",      // search|annotate|explore|feedback
  query: "string",                 // User's query
  selected_passage_id: "string",   // Passage clicked/annotated
  passage_ids_viewed: "list<string>", // All passages in results

  // Annotation data
  annotation_request: "json",      // Full annotation request
  annotation_response: "json",     // Full annotation response
  generation_time_ms: "int32",     // Time to generate

  // User feedback
  rating: "float32",               // 1-5 stars
  feedback_text: "string",         // Optional text feedback
  helpful: "bool",                 // Was this helpful?

  // Context
  referrer: "string",              // Previous page/context
  device_info: "json",             // Device/browser info
  location: "string",              // Geographic (if available)

  // Timestamps
  created_at: "string",
  session_start: "string",
  time_on_page_ms: "int32"
};
```

### 1.3 Tertiary Table: semantic_links

```typescript
export const SEMANTIC_LINKS_SCHEMA = {
  // Link identification
  id: "string",                    // UUID v4
  source_id: "string",             // From passage
  target_id: "string",             // To passage

  // Link properties
  link_type: "string",             // semantic|contrast|symbolic|historical
  strength: "float32",             // 0-1 confidence score
  bidirectional: "bool",           // Is link symmetric?

  // Link context
  context_queries: "list<string>", // Queries that trigger this link
  user_validations: "int32",       // How many users confirmed
  user_invalidations: "int32",     // How many users rejected

  // Computed properties
  path_count: "int32",             // Times in exploration paths
  cluster_id: "string",            // Semantic cluster ID

  // Timestamps
  created_at: "string",
  last_validated: "string",
  version: "string"
};
```

## 2. Data Import Pipeline

### 2.1 Data Structure Definition

```typescript
// data/types.ts
export interface SixClassicsPassage {
  text: string;                    // 原文
  book: string;                    // 书名
  chapter: string;                 // 篇名
  section: number;                 // 章节号
  paragraph?: number;              // 段落号
  commentary?: string;             // 注释（可选）
  translation?: string;            // 白话翻译（可选）
  tags?: string[];                 // 标签（可选）
}

// Sample data format
const sampleData: SixClassicsPassage[] = [
  {
    text: "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？",
    book: "论语",
    chapter: "学而",
    section: 1,
    paragraph: 1,
    tags: ["学习", "友谊", "快乐"]
  },
  {
    text: "大学之道，在明明德，在亲民，在止于至善。",
    book: "大学",
    chapter: "经一章",
    section: 1,
    paragraph: 1,
    translation: "大学的宗旨，在于彰显光明的德行，在于更新民风，在于达到至善的境界。",
    tags: ["修身", "德行", "至善"]
  }
];
```

### 2.2 Batch Import Script

```typescript
// scripts/import-classics.ts
import lancedb from "@lancedb/lancedb";
import { pipeline } from "@xenova/transformers";
import { CLASSICS_SCHEMA } from "../lib/db/schema.js";
import { SixClassicsPassage } from "../data/types.js";

class ClassicsImporter {
  private db: any;
  private embedder: any;
  private batchSize = 100;

  async initialize() {
    // Connect to LanceDB
    this.db = await lancedb.connect(process.env.LANCEDB_PATH || "./data/lancedb");

    // Initialize embedding model
    this.embedder = await pipeline(
      "feature-extraction",
      "BAAI/bge-m3",
      {
        device: "auto",
        model_file_name: "pytorch_model.bin"
      }
    );
  }

  async importData(data: SixClassicsPassage[]) {
    try {
      // Create or open table
      let table;
      try {
        table = await this.db.createTable("classics", CLASSICS_SCHEMA);
      } catch {
        table = await this.db.openTable("classics");
      }

      console.log(`Starting import of ${data.length} passages...`);

      // Process in batches
      for (let i = 0; i < data.length; i += this.batchSize) {
        const batch = data.slice(i, i + this.batchSize);
        const rows = await this.processBatch(batch);

        if (rows.length > 0) {
          await table.add(rows);
          console.log(`Imported batch ${Math.floor(i / this.batchSize) + 1}, rows: ${rows.length}`);
        }
      }

      // Create indexes
      await this.createIndexes(table);

      console.log("Import completed successfully!");

    } catch (error) {
      console.error("Import failed:", error);
      throw error;
    }
  }

  private async processBatch(batch: SixClassicsPassage[]) {
    const rows = [];

    for (const item of batch) {
      try {
        // Generate embedding
        const output = await this.embedder(item.text, {
          pooling: "mean",
          normalize: true
        });

        // Extract vector
        const vector = Array.from(output.data || output[0]?.data || []);

        // Validate dimensions
        if (vector.length !== 1024) {
          console.warn(`Skipping item due to embedding dimension mismatch: ${item.text.substring(0, 50)}...`);
          continue;
        }

        // Extract keywords (simple implementation)
        const keywords = this.extractKeywords(item.text);
        const ngrams = this.extractNGrams(item.text, 2);

        // Create row
        rows.push({
          id: crypto.randomUUID(),
          text: item.text,
          book: item.book,
          chapter: item.chapter,
          section: item.section || 1,
          paragraph: item.paragraph || 1,
          vector,
          tokens: this.countTokens(item.text),
          keywords,
          ngrams,
          search_count: 0,
          annotation_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: "EMB_V1_BGE_M3"
        });

      } catch (error) {
        console.error(`Error processing item:`, item, error);
      }
    }

    return rows;
  }

  private async createIndexes(table: any) {
    // Vector index
    await table.createIndex({
      name: "vector_index",
      type: "IVF_PQ",
      metric: "cosine",
      column: "vector"
    });

    // Full-text search index
    await table.createIndex({
      name: "fts_index",
      type: "fts",
      columns: ["text", "keywords"]
    });

    // Metadata indexes
    await table.createIndex({
      name: "book_index",
      type: "btree",
      column: "book"
    });

    await table.createIndex({
      name: "chapter_index",
      type: "btree",
      column: "chapter"
    });
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    // In production, use jieba or similar
    const keywords = [];
    const patterns = [
      /仁|义|礼|智|信|忠|孝|悌|廉|耻/g, // 核心价值观
      /君子|小人|圣人|贤者/g,          // 人物
      /学|教|道|德|政|国|家|天下/g    // 概念
    ];

    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) keywords.push(...matches);
    });

    return [...new Set(keywords)];
  }

  private extractNGrams(text: string, n: number): string[] {
    const ngrams = [];
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.push(text.substring(i, i + n));
    }
    return ngrams;
  }

  private countTokens(text: string): number {
    // Rough token estimation
    return Math.ceil(text.length / 1.5);
  }
}

// Usage
async function main() {
  const importer = new ClassicsImporter();
  await importer.initialize();

  // Load data from file
  const data = await loadJSONL("./data/sixclassics.jsonl");
  await importer.importData(data);
}

main().catch(console.error);
```

## 3. Query Optimization Strategies

### 3.1 Hybrid Search Implementation

```typescript
// lib/search/hybrid.ts
export class HybridSearchEngine {
  private vectorWeight = 0.7;      // Weight for vector search
  private keywordWeight = 0.3;     // Weight for keyword search

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Parallel execution
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, options),
      this.keywordSearch(query, options)
    ]);

    // Merge and rank
    const merged = this.mergeResults(
      vectorResults,
      keywordResults,
      options
    );

    // Apply filters
    const filtered = this.applyFilters(merged, options.filters);

    // Return top-k
    return filtered.slice(0, options.top_k || 5);
  }

  private mergeResults(
    vectorResults: SearchResult[],
    keywordResults: SearchResult[],
    options: SearchOptions
  ): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    // Process vector results
    vectorResults.forEach(result => {
      result.score = result.score * this.vectorWeight;
      merged.set(result.id, result);
    });

    // Process keyword results
    keywordResults.forEach(result => {
      if (merged.has(result.id)) {
        // Combine scores
        const existing = merged.get(result.id)!;
        existing.score = Math.max(
          existing.score,
          result.score * this.keywordWeight
        );
        existing.rank = Math.min(existing.rank, result.rank);
      } else {
        result.score = result.score * this.keywordWeight;
        merged.set(result.id, result);
      }
    });

    // Sort by combined score
    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .map((result, index) => ({
        ...result,
        rank: index + 1
      }));
  }
}
```

### 3.2 Query Caching Strategy

```typescript
// lib/cache/query-cache.ts
export class QueryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl = 5 * 60 * 1000; // 5 minutes

  generateKey(query: string, options: SearchOptions): string {
    const keyData = {
      query: query.toLowerCase().trim(),
      top_k: options.top_k || 5,
      threshold: options.threshold || 0.7,
      filters: options.filters || {},
      hybrid: options.hybrid !== false
    };
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(keyData))
      .digest("hex");
  }

  async get(key: string): Promise<SearchResponse | null> {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access time
    entry.lastAccessed = Date.now();
    entry.accessCount++;

    return entry.data;
  }

  async set(key: string, data: SearchResponse): Promise<void> {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1
    });

    // Cleanup old entries
    this.cleanup();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      // Remove old entries
      if (now - entry.timestamp > this.ttl * 2) {
        this.cache.delete(key);
      }
      // Remove least used if cache is full
      else if (this.cache.size > 1000) {
        const oldest = Array.from(this.cache.entries())
          .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)[0];
        if (oldest) this.cache.delete(oldest[0]);
      }
    }
  }
}
```

## 4. Migration Strategy

### 4.1 LanceDB to Supabase Migration

```typescript
// scripts/migrate-to-supabase.ts
export class DatabaseMigrator {
  async migrateFromLanceDBToSupabase() {
    // 1. Export from LanceDB
    const lancedb = await lancedb.connect("./data/lancedb");
    const table = await lancedb.openTable("classics");
    const data = await table.toArrow();

    // 2. Transform for Supabase
    const rows = [];
    for (let i = 0; i < data.numRows; i++) {
      rows.push({
        id: data.getChild("id").get(i),
        text: data.getChild("text").get(i),
        book: data.getChild("book").get(i),
        chapter: data.getChild("chapter").get(i),
        section: data.getChild("section").get(i),
        embedding: data.getChild("vector").get(i),
        metadata: {
          keywords: data.getChild("keywords").get(i),
          tokens: data.getChild("tokens").get(i)
        }
      });
    }

    // 3. Batch insert to Supabase
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    for (let i = 0; i < rows.length; i += 1000) {
      const batch = rows.slice(i, i + 1000);
      await supabase.from("classics").insert(batch);
      console.log(`Migrated batch ${Math.floor(i / 1000) + 1}`);
    }

    // 4. Create vector index in Supabase
    await supabase.rpc("create_vector_index", {
      table_name: "classics",
      column_name: "embedding",
      distance_metric: "cosine"
    });
  }
}
```

### 4.2 Schema Versioning

```typescript
// lib/db/migrations.ts
export const MIGRATIONS = {
  // Version 1: Initial schema
  "v1.0.0": {
    up: `
      CREATE TABLE IF NOT EXISTS classics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        text TEXT NOT NULL,
        book TEXT NOT NULL,
        chapter TEXT NOT NULL,
        section INTEGER NOT NULL,
        embedding vector(1024),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `,
    down: `
      DROP TABLE IF EXISTS classics;
    `
  },

  // Version 2: Add annotations cache
  "v1.1.0": {
    up: `
      ALTER TABLE classics
      ADD COLUMN IF NOT EXISTS cached_annotations JSONB,
      ADD COLUMN IF NOT EXISTS search_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS annotation_count INTEGER DEFAULT 0;

      CREATE INDEX IF NOT EXISTS idx_classics_book ON classics(book);
      CREATE INDEX IF NOT EXISTS idx_classics_chapter ON classics(chapter);
    `,
    down: `
      ALTER TABLE classics
      DROP COLUMN IF EXISTS cached_annotations,
      DROP COLUMN IF EXISTS search_count,
      DROP COLUMN IF EXISTS annotation_count;
    `
  },

  // Version 3: Add semantic links
  "v1.2.0": {
    up: `
      CREATE TABLE IF NOT EXISTS semantic_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_id UUID REFERENCES classics(id),
        target_id UUID REFERENCES classics(id),
        link_type TEXT NOT NULL,
        strength FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_links_source ON semantic_links(source_id);
      CREATE INDEX IF NOT EXISTS idx_links_target ON semantic_links(target_id);
      CREATE INDEX IF NOT EXISTS idx_links_type ON semantic_links(link_type);
    `,
    down: `
      DROP TABLE IF EXISTS semantic_links;
    `
  }
};
```

## 5. Performance Monitoring

### 5.1 Database Metrics

```typescript
// lib/db/monitoring.ts
export class DatabaseMonitor {
  private metrics: {
    queryCount: number;
    avgQueryTime: number;
    cacheHitRate: number;
    indexUsage: Map<string, number>;
  } = {
    queryCount: 0,
    avgQueryTime: 0,
    cacheHitRate: 0,
    indexUsage: new Map()
  };

  async trackQuery<T>(
    operation: () => Promise<T>,
    queryType: string
  ): Promise<T> {
    const start = performance.now();

    try {
      const result = await operation();

      // Update metrics
      const duration = performance.now() - start;
      this.updateMetrics(queryType, duration, true);

      return result;
    } catch (error) {
      this.updateMetrics(queryType, performance.now() - start, false);
      throw error;
    }
  }

  private updateMetrics(
    queryType: string,
    duration: number,
    success: boolean
  ) {
    this.metrics.queryCount++;

    // Update average time
    this.metrics.avgQueryTime =
      (this.metrics.avgQueryTime * (this.metrics.queryCount - 1) + duration) /
      this.metrics.queryCount;

    // Update index usage
    const current = this.metrics.indexUsage.get(queryType) || 0;
    this.metrics.indexUsage.set(queryType, current + 1);

    // Log slow queries
    if (duration > 1000) {
      console.warn(`Slow query detected: ${queryType} took ${duration}ms`);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      indexUsage: Object.fromEntries(this.metrics.indexUsage)
    };
  }
}
```

This database design provides a solid foundation for the InfiDao system, with careful consideration for performance, scalability, and future migration needs.