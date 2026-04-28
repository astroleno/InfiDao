# InfiDao 六经注我 - Quick Start Guide

> Status: superseded on 2026-04-24
> Legacy reference only for the pre-reboot implementation. For the current reboot MVP, use `docs/SUPERPOWERS_REBOOT_PLAN.md` and `docs/plans/reboot-mvp-implementation-plan.md`. If this file conflicts with them, those docs win.

## 🎯 Project Overview

InfiDao is an AI-native semantic annotation system for Chinese classics. Users can input modern text and receive semantically related passages from the Six Classics (六经) with bidirectional annotations.

**Core Features:**
- Semantic search across Six Classics using bge-m3 embeddings
- Bidirectional annotations: 六经注我 + 我注六经
- Streaming response with real-time generation
- Extensible semantic links for continuous exploration
- Multi-LLM support (GLM-4.5, Qwen, OpenAI)

## 🚀 10-Minute Setup

### 1. Prerequisites

```bash
# Node.js 18+ required
node --version

# Git
git --version

# Optional: Docker for containerized deployment
docker --version
```

### 2. Clone & Install

```bash
# Clone repository
git clone https://github.com/your-org/infi-dao.git
cd infi-dao

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

### 3. Configure Environment

Edit `.env.local`:

```bash
# LLM Provider (choose one)
OPENAI_API_KEY=sk-your-key
# OR
ZHIPU_API_KEY=your-zhipu-key
# OR
DASHSCOPE_API_KEY=your-dashscope-key

# Database path (will be created automatically)
LANCEDB_PATH=./data/lancedb

# Feature flags
HYBRID_SEARCH=true
KV_CACHE=true

# Model configuration
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIM=1024
```

### 4. Initialize Database

```bash
# Download embedding model (one-time)
npm run download-model

# Initialize database
npm run init-db

# Import sample data
npm run import-data
```

### 5. Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## 📁 Project Structure

```
infi-dao/
├── app/                     # Next.js App Router
│   ├── api/                # API routes
│   │   ├── embed/          # Text embedding
│   │   ├── search/         # Semantic search
│   │   └── annotate/       # Annotation generation
│   ├── page.tsx            # Main interface
│   └── globals.css         # Global styles
├── lib/                    # Core services
│   ├── db.ts              # Database wrapper
│   ├── embed.ts           # Embedding service
│   ├── llm.ts             # LLM adapter
│   └── search.ts          # Search engine
├── components/             # React components
│   ├── search/            # Search components
│   ├── annotation/        # Annotation components
│   └── common/            # Shared components
├── data/                  # Data files
│   └── sixclassics.jsonl  # Sample corpus
├── scripts/               # Utility scripts
│   ├── import-data.js     # Data import
│   └── download-model.js  # Model download
└── docs/                  # Documentation
    ├── SYSTEM_ARCHITECTURE.md
    ├── DATABASE_DESIGN.md
    ├── DEPLOYMENT_GUIDE.md
    └── COMPONENT_ARCHITECTURE.md
```

## 🎮 Basic Usage

### 1. Semantic Search

```typescript
// Example API call
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

const { results } = await response.json();
console.log(results);
```

### 2. Generate Annotations

```typescript
// Streaming annotation
const response = await fetch('/api/annotate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '自律很重要',
    passage: '克己复礼为仁',
    model: 'glm'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    const chunk = JSON.parse(line);
    console.log(chunk.type, chunk.data);
  }
}
```

## 🏗️ Development Workflow

### 1. Add New Features

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
# ...

# Run tests
npm run test

# Commit changes
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

### 2. Test Changes

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Type checking
npm run type-check

# Linting
npm run lint
```

### 3. Build for Production

```bash
# Build application
npm run build

# Test production build locally
npm start

# Or use Docker
docker build -t infi-dao .
docker run -p 3000:3000 infi-dao
```

## 📊 Adding New Data

### 1. Prepare Data

Create `data/my-texts.jsonl`:

```json
{"text": "新文本内容", "book": "新书名", "chapter": "章节名", "section": 1}
{"text": "更多内容", "book": "新书名", "chapter": "章节名", "section": 2}
```

### 2. Import Data

```bash
# Import custom data
node -e "
import { ClassicsImporter } from './scripts/import-classics.js';
const data = await loadJSONL('./data/my-texts.jsonl');
const importer = new ClassicsImporter();
await importer.importData(data);
"
```

## 🔧 Common Operations

### Reset Database

```bash
# Remove all data
rm -rf ./data/lancedb

# Reinitialize
npm run init-db
npm run import-data
```

### Update Model

```bash
# Download new model version
npm run download-model bge-m3-v1.5

# Update embeddings
npm run re-embed-all
```

### Check System Health

```bash
# Health check
curl http://localhost:3000/api/health

# View metrics
curl http://localhost:3000/api/metrics
```

## 🐛 Troubleshooting

### Model Loading Issues

```bash
# Clear model cache
rm -rf ./models/.cache

# Re-download
npm run download-model
```

### Database Connection Errors

```bash
# Check permissions
ls -la ./data/

# Create directory
mkdir -p ./data/lancedb
chmod 755 ./data/lancedb
```

### LLM API Errors

1. Check API key validity
2. Verify rate limits
3. Check network connectivity
4. Try alternative provider

## 📚 API Reference

### /api/embed

- **Method**: POST
- **Body**: `{ text: string, metadata?: object }`
- **Response**: `{ success: true, vector: number[], id: string }`

### /api/search

- **Method**: POST
- **Body**: `{ query: string, top_k?: number, threshold?: number }`
- **Response**: `{ success: true, results: SearchResult[] }`

### /api/annotate

- **Method**: POST
- **Body**: `{ query: string, passage: string, model?: string }`
- **Response**: Streaming JSON lines

## 🚀 Production Deployment

### Quick Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Environment Variables for Production

```bash
# Required
OPENAI_API_KEY=xxx
DATABASE_URL=xxx

# Optional
REDIS_URL=xxx
SENTRY_DSN=xxx
```

## 📈 Performance Tips

1. **Enable caching**: Set `KV_CACHE=true`
2. **Batch operations**: Use batch embedding for bulk imports
3. **Optimize queries**: Adjust `top_k` and `threshold`
4. **Monitor metrics**: Check `/api/metrics` regularly
5. **Use CDN**: Enable CDN for static assets

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit PR

## 📞 Support

- Documentation: `/docs`
- Issues: GitHub Issues
- Discussions: GitHub Discussions
- Email: support@infi-dao.com

## 🗺️ Roadmap

- [ ] v0.2: Graph visualization
- [ ] v0.3: User accounts & personal annotations
- [ ] v0.4: Collaboration features
- [ ] v1.0: Mobile app
- [ ] v1.1: Multi-language support
- [ ] v2.0: Advanced AI reasoning

---

For more detailed information, see:
- [System Architecture](./SYSTEM_ARCHITECTURE.md)
- [Database Design](./DATABASE_DESIGN.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Component Architecture](./COMPONENT_ARCHITECTURE.md)
