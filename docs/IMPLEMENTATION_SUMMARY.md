# InfiDao Database Architecture Implementation Summary

> Status: superseded on 2026-04-24
> Legacy reference only for the pre-reboot implementation. For the current reboot MVP, use `docs/SUPERPOWERS_REBOOT_PLAN.md` and `docs/plans/reboot-mvp-implementation-plan.md`. If this file conflicts with them, those docs win.

## Overview

This document summarizes the complete database architecture and data management strategy implemented for the InfiDao "六经注我" project. The architecture is designed to scale from 5K to 100K+ passages with optimal performance.

## Implemented Components

### 1. Database Schema (`/lib/db/schema.ts`)

**Four main tables defined:**

1. **Passages Table** - Core Six Classics text chunks
   - ID, book, chapter, section, text, tokens
   - 1024-dimension vector embeddings (bge-m3)
   - Metadata: timestamps, version, checksum

2. **User Notes Table** - User inputs
   - UUID, user_id, text, cached embeddings
   - Session tracking and analytics fields

3. **Annotations Table** - Two-way interpretations
   - Links between notes and passages
   - Six-to-me and me-to-six annotations
   - Scoring and relationship metadata

4. **Search Cache Table** - KV store for query results
   - SHA-256 cache keys
   - JSON-serialized results
   - TTL and hit tracking

### 2. Database Connection (`/lib/db/connection.ts`)

**Features:**
- Automatic connection management
- Table creation and initialization
- CRUD operations with error handling
- Vector search support
- Health check functionality
- Connection pooling (for future scaling)

### 3. Hybrid Search Engine (`/lib/search/hybrid.ts`)

**Capabilities:**
- Combines vector similarity and BM25 text search
- Intelligent query expansion using LLM
- Result merging with configurable weights (default: 70% vector, 30% BM25)
- Multi-level caching (L1/L2)
- Filter support (by book, chapter)
- Performance monitoring

**Search Flow:**
1. Check cache → L1 → L2
2. Expand query with semantic terms
3. Parallel vector and BM25 search
4. Merge and rank results
5. Apply filters and thresholds
6. Cache results

### 4. Multi-Tier Caching (`/lib/cache/manager.ts`)

**Three caching layers:**

- **L1 Cache** - In-memory (Node.js)
  - LRU eviction
  - Default: 1000 entries, 1-minute TTL
  - Automatic cleanup of expired entries

- **L2 Cache** - Redis (optional)
  - Persistent cache
  - Default: 30-minute TTL
  - Async operations

- **L3 Cache** - Database buffer pool
  - Managed by LanceDB/pgvector

### 5. Embedding Service (`/lib/embeddings/bge.ts`)

**Features:**
- BGE-M3 model integration
- Batch processing (32 texts per batch)
- Automatic caching (1 hour L1, 24 hours L2)
- Similarity calculation utilities
- Health check endpoint

### 6. Data Import Pipeline (`/scripts/import-data.js`)

**Capabilities:**
- Batch processing of Six Classics texts
- Semantic chunking (50-200 characters)
- Embedding generation
- Checksum validation
- Progress tracking
- Sample data generation for testing

### 7. Migration Tool (`/scripts/migrate-to-supabase.ts`)

**Features:**
- LanceDB to Supabase/pgvector migration
- Batch processing with progress tracking
- Schema creation
- Index creation (IVF-PQ for vectors)
- Data validation
- Dry-run mode

## API Implementation

### Search API (`/app/api/search/route.ts`)

**Endpoints:**
- `POST /api/search` - Semantic search
- `GET /api/search` - Health check

**Features:**
- Request validation with Zod
- Hybrid search support
- Configurable parameters
- Performance metrics
- Error handling
- Cache hit tracking

## Configuration

### Environment Variables (`.env.example`)

Complete configuration covering:
- Database paths and credentials
- LLM provider settings (OpenAI, Zhipu, Qwen)
- Search parameters and weights
- Cache TTL and sizes
- Performance tuning
- Security settings

## Performance Optimizations

### 1. Query Optimization
- Parallel vector and BM25 search
- Result caching at multiple levels
- Query expansion for better recall
- Efficient filtering

### 2. Batch Processing
- 32-text batches for embeddings
- 100-record batches for database operations
- Configurable batch sizes

### 3. Indexing Strategy
- IVF-PQ vector index (100 lists, 10 probes)
- Composite indexes on book/chapter
- BM25 full-text search index

### 4. Memory Management
- LRU eviction in L1 cache
- Automatic cleanup routines
- Connection pooling

## Scaling Strategy

### Phase 1: MVP (0-5K passages)
- LanceDB local storage
- L1 caching only
- Single instance

### Phase 2: Growth (5K-20K passages)
- Add Redis L2 cache
- Optimize indexes
- Monitor performance

### Phase 3: Production (20K-100K+ passages)
- Migrate to Supabase/pgvector
- Read replicas
- Horizontal scaling
- Auto-scaling configuration

## Security Considerations

1. **Data Protection**
   - Environment variable configuration
   - API key management
   - Rate limiting
   - Input validation

2. **Privacy**
   - Session-based user tracking
   - IP hash for analytics
   - Optional data persistence

## Monitoring & Maintenance

### Metrics to Track
- Query latency (P50, P95, P99)
- Cache hit rates
- Database connection usage
- Error rates
- Storage growth

### Maintenance Tasks
- Automated backups
- Cache cleanup
- Index optimization
- Data validation

## Usage Examples

### Basic Search
```javascript
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '什么是君子',
    top_k: 5,
    threshold: 0.7,
    hybrid: true
  })
});
```

### Advanced Search with Filters
```javascript
const response = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '修身齐家',
    top_k: 10,
    filters: {
      book: ['论语', '大学'],
      chapter: ['学而篇']
    },
    weights: {
      vector: 0.8,
      bm25: 0.2
    }
  })
});
```

## Next Steps

### Immediate (MVP)
1. Complete API implementations for `/api/embed` and `/api/annotate`
2. Implement frontend UI components
3. Add comprehensive tests
4. Deploy to Vercel

### Short Term (Scale to 20K)
1. Set up Redis for L2 caching
2. Implement performance monitoring
3. Add more Six Classics data
4. Optimize query performance

### Long Term (100K+)
1. Migrate to Supabase
2. Implement sharding
3. Add personalization features
4. Build analytics dashboard

## File Structure Summary

```
InfiDao/
├── lib/
│   ├── db/
│   │   ├── schema.ts         # Database schemas
│   │   └── connection.ts     # Connection manager
│   ├── search/
│   │   └── hybrid.ts         # Hybrid search engine
│   ├── cache/
│   │   └── manager.ts        # Multi-tier caching
│   ├── embeddings/
│   │   └── bge.ts            # Embedding service
│   └── llm/                  # LLM adapters (to implement)
├── app/api/
│   ├── search/route.ts       # Search API
│   ├── embed/route.ts        # Embedding API (to implement)
│   └── annotate/route.ts     # Annotation API (to implement)
├── scripts/
│   ├── import-data.js        # Data import pipeline
│   └── migrate-to-supabase.ts # Migration tool
├── data/
│   ├── lancedb/              # Local database
│   ├── sixclassics/          # Text data
│   └── models/               # BGE-M3 model
├── docs/
│   ├── DATABASE_ARCHITECTURE.md
│   └── IMPLEMENTATION_SUMMARY.md
└── .env.example              # Configuration template
```

## Conclusion

The implemented database architecture provides a robust, scalable foundation for the InfiDao project. It supports the MVP requirements while being ready for production scaling. The modular design allows for easy maintenance and enhancement as the project grows.

Key strengths:
- **Performance**: Multi-tier caching and hybrid search
- **Scalability**: Clear migration path to cloud solutions
- **Maintainability**: Well-structured, documented code
- **Flexibility**: Configurable parameters and provider options
- **Reliability**: Error handling and health checks

The architecture successfully addresses all requirements:
1. ✅ LanceDB schema for all data types
2. ✅ Indexing strategy for semantic search
3. ✅ Migration path to Supabase/pgvector
4. ✅ Hybrid search implementation
5. ✅ Multi-tier caching strategy
6. ✅ Data import pipeline
7. ✅ Backup and maintenance considerations

The system is ready for development and can scale from 5K to 100K+ passages with minimal changes.
