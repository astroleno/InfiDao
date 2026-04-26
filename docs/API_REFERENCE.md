# InfiDao API Reference

> Status: superseded on 2026-04-24
> Legacy reference only for the pre-reboot implementation. For the current reboot MVP, use `docs/SUPERPOWERS_REBOOT_PLAN.md` and `docs/plans/reboot-mvp-implementation-plan.md`. If this file conflicts with them, those docs win.

## Overview

The InfiDao API provides semantic search, embedding generation, and annotation services for the "六经注我" project. The API is built with Next.js App Router and follows RESTful principles.

## Base URL

```
https://your-domain.com/api
```

## Authentication

Currently, the API does not require authentication. In production, API key authentication will be implemented.

## Common Response Format

All API responses follow a consistent format:

```json
{
  "success": boolean,
  "data": any,
  "error": {
    "code": string,
    "message": string,
    "details": any
  },
  "meta": {
    "timestamp": string,
    "request_id": string,
    "version": string,
    "performance": {
      "query_time_ms": number,
      "cache_hit": boolean
    }
  }
}
```

## API Endpoints

### 1. Search API

#### POST /api/search

Perform semantic search against the Six Classics database.

**Request Body:**
```json
{
  "query": "string (required, 1-500 chars)",
  "top_k": "number (optional, default: 5, max: 20)",
  "threshold": "number (optional, default: 0.7, range: 0-1)",
  "hybrid": "boolean (optional, default: true)",
  "filters": {
    "book": ["string"],
    "chapter": ["string"],
    "section_range": [number, number],
    "tags": ["string"]
  },
  "weights": {
    "vector": "number (default: 0.7)",
    "bm25": "number (default: 0.3)",
    "semantic": "number (default: 0.5)"
  },
  "rerank": "boolean (default: true)",
  "expand_query": "boolean (default: true)"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "text": "string",
      "source": "string",
      "chapter": "string",
      "section": "number",
      "score": "number",
      "similarity_score": "number",
      "bm25_score": "number",
      "metadata": {
        "highlighted_text": "string",
        "context_before": "string",
        "context_after": "string"
      }
    }
  ]
}
```

**Example:**
```bash
curl -X POST https://your-domain.com/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "仁义礼智信",
    "top_k": 5,
    "threshold": 0.7
  }'
```

#### GET /api/search

Get search suggestions, health check, or similar passages.

**Query Parameters:**
- `action`: `health` | `suggestions` | `similar`
- `q`: Query string (for suggestions)
- `id`: Passage ID (for similar passages)
- `limit`: Number of results (default: 5)

**Examples:**
```bash
# Health check
curl "https://your-domain.com/api/search?action=health"

# Get suggestions
curl "https://your-domain.com/api/search?action=suggestions&q=仁"

# Get similar passages
curl "https://your-domain.com/api/search?action=similar&id=passage_123&limit=5"
```

### 2. Embedding API

#### POST /api/embed

Generate embeddings for text using BGE-M3 model.

**Request Body:**
```json
{
  "text": "string (required for single embedding)",
  "texts": ["string"] (required for batch embedding),
  "batch": "boolean (default: false)",
  "normalize": "boolean (default: true)",
  "precision": "float16 | float32 | uint8 (default: float32)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "vector": [number] (for single embedding),
    "vectors": [[number]] (for batch embedding),
    "vector_length": 1024,
    "processing_time_ms": number
  },
  "model": "BAAI/bge-m3"
}
```

**Example:**
```bash
# Single embedding
curl -X POST https://your-domain.com/api/embed \
  -H "Content-Type: application/json" \
  -d '{
    "text": "学而时习之，不亦说乎",
    "normalize": true
  }'

# Batch embedding
curl -X POST https://your-domain.com/api/embed \
  -H "Content-Type: application/json" \
  -d '{
    "batch": true,
    "texts": [
      "学而时习之",
      "温故知新",
      "教学相长"
    ]
  }'
```

#### GET /api/embed

Get model information, statistics, or health status.

**Query Parameters:**
- `action`: `model` | `stats` | `health` | `clear-cache`

**Examples:**
```bash
# Model info
curl "https://your-domain.com/api/embed?action=model"

# Statistics
curl "https://your-domain.com/api/embed?action=stats"

# Health check
curl "https://your-domain.com/api/embed?action=health"

# Clear cache
curl "https://your-domain.com/api/embed?action=clear-cache"
```

### 3. Annotation API

#### POST /api/annotate

Generate annotations for user notes using LLM.

**Request Body:**
```json
{
  "note": "string (required, 1-2000 chars)",
  "context": "string (optional, max 1000 chars)",
  "options": {
    "max_passages": "number (default: 5, max: 10)",
    "threshold": "number (default: 0.7)",
    "include_links": "boolean (default: true)",
    "style": "academic | poetic | modern | classical (default: modern)"
  }
}
```

**Response (Non-streaming):**
```json
{
  "success": true,
  "data": {
    "summary": "string",
    "related_passages": [
      {
        "source": "string",
        "chapter": "string",
        "text": "string",
        "relevance": "string",
        "score": "number"
      }
    ],
    "six_to_me": "string",
    "me_to_six": "string",
    "links": [
      {
        "from_passage": "string",
        "to_passage": "string",
        "relationship": "string"
      }
    ]
  }
}
```

**Streaming Response:**
For streaming responses, set `Accept: text/event-stream` header.

**Example:**
```bash
# Non-streaming
curl -X POST https://your-domain.com/api/annotate \
  -H "Content-Type: application/json" \
  -d '{
    "note": "我想学习如何做到内心平静",
    "context": "最近工作压力大，想要找到平衡",
    "options": {
      "style": "modern",
      "max_passages": 3
    }
  }'

# Streaming
curl -X POST https://your-domain.com/api/annotate \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "note": "如何做到知行合一"
  }'
```

#### GET /api/annotate

Get API info, health status, or available LLM providers.

**Query Parameters:**
- `action`: `health` | `providers`

**Examples:**
```bash
# Health check
curl "https://your-domain.com/api/annotate?action=health"

# List providers
curl "https://your-domain.com/api/annotate?action=providers"
```

### 4. Health Check API

#### GET /api/health

Comprehensive health check for all services.

**Response:**
```json
{
  "status": "healthy | unhealthy | degraded",
  "services": {
    "database": {
      "status": "up | down | degraded",
      "response_time_ms": number,
      "error": "string",
      "last_check": "string"
    },
    "embedding": {
      "status": "up | down | degraded",
      "response_time_ms": number
    },
    "llm": {
      "status": "up | down | degraded",
      "response_time_ms": number
    },
    "cache": {
      "status": "up | down | degraded",
      "response_time_ms": number
    }
  },
  "version": "v1",
  "uptime": number,
  "timestamp": "string"
}
```

**Query Parameters:**
- `detailed`: `true` (optional) - Include detailed system information

**Examples:**
```bash
# Basic health check
curl "https://your-domain.com/api/health"

# Detailed health check
curl "https://your-domain.com/api/health?detailed=true"

# Simple liveness check
curl -I "https://your-domain.com/api/health"
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Invalid request parameters | 400 |
| `UNAUTHORIZED` | Authentication required | 401 |
| `FORBIDDEN` | Access denied | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `RATE_LIMIT` | Rate limit exceeded | 429 |
| `TIMEOUT_ERROR` | Request timed out | 408 |
| `CONNECTION_ERROR` | Service unavailable | 503 |
| `EMBEDDING_ERROR` | Embedding generation failed | 500 |
| `LLM_ERROR` | LLM operation failed | 500 |
| `DATABASE_ERROR` | Database operation failed | 500 |
| `CACHE_ERROR` | Cache operation failed | 500 |
| `CONFIGURATION_ERROR` | Configuration error | 500 |
| `INTERNAL_ERROR` | Internal server error | 500 |
| `UNKNOWN_ERROR` | Unknown error | 500 |

## Rate Limiting

- Requests per minute: 60
- Requests per hour: 1000

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1640995200
```

## Caching

The API implements multi-level caching:
- L1 Cache: In-memory cache with 60-second TTL
- L2 Cache: Redis cache with 30-minute TTL (if configured)

Cache-Control headers are included in responses:
```
Cache-Control: public, max-age=300
ETag: "abc123"
```

## SDK Examples

### JavaScript/TypeScript

```typescript
// Search
const searchResponse = await fetch('/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '仁义礼智信',
    top_k: 5,
    threshold: 0.7
  })
});
const searchResults = await searchResponse.json();

// Embedding
const embedResponse = await fetch('/api/embed', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: '学而时习之',
    normalize: true
  })
});
const embedding = await embedResponse.json();

// Annotation (streaming)
const annotationResponse = await fetch('/api/annotate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'
  },
  body: JSON.stringify({
    note: '如何做到内心平静',
    style: 'modern'
  })
});

const reader = annotationResponse.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  console.log(chunk);
}
```

### Python

```python
import requests
import json

# Search
search_response = requests.post(
    'https://your-domain.com/api/search',
    json={
        'query': '仁义礼智信',
        'top_k': 5,
        'threshold': 0.7
    }
)
search_results = search_response.json()

# Embedding
embed_response = requests.post(
    'https://your-domain.com/api/embed',
    json={
        'text': '学而时习之',
        'normalize': True
    }
)
embedding = embed_response.json()

# Annotation
annotation_response = requests.post(
    'https://your-domain.com/api/annotate',
    json={
        'note': '如何做到内心平静',
        'style': 'modern'
    }
)
annotation = annotation_response.json()
```

## WebSocket Support

Coming soon: Real-time search updates and collaborative annotations.

## Webhooks

Coming soon: Subscribe to search and annotation events.

## Support

For API support, please:
1. Check the health status: `GET /api/health`
2. Review error messages and codes
3. Contact support at support@infidao.com

## Changelog

### v1.0.0 (2024-01-01)
- Initial API release
- Search endpoint with hybrid search
- Embedding generation with BGE-M3
- Annotation generation with streaming
- Multi-level caching
- Comprehensive health checks
