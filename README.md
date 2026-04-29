# InfiDao 六经注我

Interactive Knowledge Graph Platform with AI-Powered Search for Classical Chinese Texts

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2+-black)](https://nextjs.org/)

## 📖 Project Overview

InfiDao (六经注我) is an innovative interactive knowledge platform designed to explore and understand classical Chinese texts through modern AI technology. The platform focuses on the Six Classics (六经) of Chinese literature, providing an immersive learning experience with:

- **AI-Powered Search**: Advanced semantic search using BGE-M3 embeddings
- **Interactive Knowledge Graph**: Visual relationships between texts, concepts, and authors
- **Multi-LLM Support**: Integration with OpenAI, Zhipu AI, Qwen, and custom providers
- **Hybrid Search**: Combining vector search with traditional text search
- **Real-time Annotations**: AI-generated insights and explanations
- **Responsive Design**: Beautiful classical Chinese aesthetic with modern UI

## Current Reboot Status (2026-04-29)

The active product line is the reboot MVP path, not the older broad knowledge-graph implementation. Treat these files as the current source of truth:

- `docs/SUPERPOWERS_REBOOT_PLAN.md`
- `docs/plans/reboot-mvp-implementation-plan.md`
- `docs/plans/reboot-mvp-continuation-plan.md`
- `docs/qa/reboot-mvp-acceptance-checklist.md`
- `docs/qa/reboot-mvp-release-readiness.md`

Current state:

- The executable MVP path is `query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state`.
- Release candidate signoff was completed on 2026-04-29 for the reboot MVP path.
- Automated gates passed on 2026-04-29: search artifact generation, type-check, lint, Jest, production build, and release smoke.
- Browser review covered desktop and mobile headed sessions. Core path behavior works, including linked exploration, back navigation, and stack reset after selecting a new result.
- Selected result card copy now distinguishes annotation loading, completed annotation, and selected-only states.
- Next.js metadata and missing asset warnings were cleaned up; remaining build notices are dependency data freshness notices from Browserslist/baseline-browser-mapping.
- Accepted release exception: annotation provider tail latency can still hit the 5s timeout budget and raise `FALLBACK_RATE_HIGH` / `P95_LATENCY_HIGH`; the MVP accepts deterministic fallback because `/api/annotate` still returns annotation content and the telemetry signal remains visible.

Continue from `docs/plans/reboot-mvp-continuation-plan.md` if a conversation or agent session is interrupted.

### MVP Mode: JSON-first Search

To enable fast iteration with minimal ops cost, the MVP defaults to a lightweight "JSON embeddings + in-memory search" approach:

- No database required at start; passages and embeddings are stored as JSON/JSONL under `data/`
- In-memory cosine similarity Top-K search is sufficient for small-to-medium datasets
- Seamless migration: when the dataset grows, switch to LanceDB/pgvector without changing the public search API

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- Optional LLM provider credentials for live annotation generation. Without them,
  the MVP still returns deterministic annotation fallback copy.

### Reboot MVP Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/InfiDao/infidao.git
   cd infidao
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create local environment config**

   ```bash
   cp .env.example .env.local
   # Fill canonical annotation LLM slots if you want live provider annotations.
   ```

4. **Generate local search artifacts**

   ```bash
   npm run generate-search-artifacts
   ```

5. **Start the reboot MVP**

   ```bash
   npm run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) and try `如何面对困境`.

### Release Verification

Use these commands before release signoff:

```bash
npm run generate-search-artifacts
npm run type-check
npm run lint
npm test -- --runInBand
npm run build
```

For a standalone production smoke:

```bash
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then cp -R public .next/standalone/public; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
```

For dev telemetry validation:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:telemetry
```

### Legacy Setup Commands

The older LanceDB/model bootstrap scripts remain in the repository for
non-reboot experimentation, but they are not required for the active reboot MVP
path:

```bash
npm run health-check
npm run download-model
npm run init-db
npm run import-data
```

## 🛠️ Development

### Available Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start development server with hot reload |
| `npm run build`      | Build for production                     |
| `npm run start`      | Start production server                  |
| `npm run lint`       | Run ESLint                               |
| `npm run lint:fix`   | Fix ESLint issues automatically          |
| `npm run format`     | Format code with Prettier                |
| `npm run type-check` | Run TypeScript type checking             |
| `npm run test`       | Run tests                                |
| `npm run analyze`    | Analyze bundle size                      |
| `npm run clean`      | Clean build artifacts and cache          |

### Database & Models

| Command                  | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `npm run download-model` | Download BGE-M3 embedding model                |
| `npm run init-db`        | Initialize LanceDB database (optional for MVP) |
| `npm run import-data`    | Import Six Classics data (optional for MVP)    |
| `npm run setup`          | Complete setup (models + DB + data)            |
| `npm run db:reset`       | Reset database completely                      |
| `npm run cache:clear`    | Clear all cache directories                    |

### Project Structure

```
infidao/
├── app/                    # Next.js app router pages
├── components/             # React components
│   ├── ui/                # Reusable UI components
│   ├── knowledge-graph/   # Graph visualization components
│   └── search/            # Search interface components
├── lib/                   # Utility libraries
│   ├── config/           # Configuration and environment
│   ├── db/               # Database utilities
│   ├── llm/              # LLM provider adapters
│   └── utils/            # Helper functions
├── types/                 # TypeScript type definitions
├── hooks/                 # Custom React hooks
├── scripts/               # Build and setup scripts
├── data/                  # Data storage
├── models/                # AI model files
└── docs/                  # Documentation
```

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env.local` and configure the following:

#### Database Configuration

```env
DATABASE_PATH=./data/lancedb
EMBEDDINGS_TABLE=embeddings
PASSAGES_TABLE=passages
```

#### AI Model Configuration

```env
BGE_MODEL_PATH=./models/bge-m3
BGE_MODEL_REPO=BAAI/bge-m3
```

#### LLM Provider Configuration

Choose one of the following providers:

**OpenAI**

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
```

**Zhipu AI (GLM)**

```env
LLM_PROVIDER=glm
GLM_API_KEY=your_glm_api_key_here
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

**Alibaba Qwen**

```env
LLM_PROVIDER=qwen
QWEN_API_KEY=your_qwen_api_key_here
QWEN_BASE_URL=https://dashscope.aliyuncs.com/api/v1
```

#### Performance Configuration

```env
L1_CACHE_SIZE=1000
L2_CACHE_TTL=1800
DEFAULT_TOP_K=5
DEFAULT_THRESHOLD=0.7
```

### Model Setup

The platform uses the **BGE-M3** embedding model for semantic search. Models are automatically downloaded when you run:

```bash
npm run download-model
```

Model files are stored in `./models/bge-m3/` and include:

- `pytorch_model.bin` (2.2GB) - Main model weights
- `config.json` - Model configuration
- `tokenizer.json` - Tokenizer configuration
- `vocab.txt` - Vocabulary file

## 🎨 Features

### Knowledge Graph Visualization

- Interactive node-based exploration
- Relationship mapping between texts and concepts
- Real-time graph updates
- Customizable layouts and filters

### AI-Powered Search

- **Semantic Search**: Find texts by meaning, not just keywords
- **Hybrid Search**: Combine vector search with traditional text search
- **Multi-modal**: Support for text, concepts, and relationship queries
- **Real-time Results**: Instant search with streaming responses

### Classical Chinese Texts

Currently supports the Six Classics:

- **论语** (Analects of Confucius)
- **孟子** (Mencius)
- **大学** (Great Learning)
- **中庸** (Doctrine of the Mean)
- **诗经** (Book of Odes)
- **尚书** (Book of Documents)

### Annotations & Insights

- AI-generated explanations
- Historical context
- Cross-references between texts
- Modern translations

## 🔧 Technology Stack

### Frontend

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Smooth animations
- **Radix UI** - Accessible components
- **Zustand** - State management

### Backend & Database

- **LanceDB** - Vector database for embeddings
- **Redis** - Optional caching layer
- **Node.js** - Server runtime

### AI & ML

- **BGE-M3** - Multilingual embedding model
- **Transformers.js** - In-browser model inference
- **Multiple LLM Providers** - OpenAI, Zhipu AI, Qwen, Custom

### Development Tools

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **Jest** - Testing framework
- **TypeScript** - Static typing

## 📊 Architecture

### System Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│                 │    │                 │    │                 │
│ • React UI      │◄──►│ • Next.js API   │◄──►│ • LanceDB       │
│ • Search UI     │    │ • LLM Adapters  │    │ • Vector Store  │
│ • Graph Viz     │    │ • Embeddings    │    │ • Knowledge DB  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Cache  │    │   Server Cache  │    │   Models        │
│                 │    │                 │    │                 │
│ • Browser Store │    │ • Redis (L2)    │    │ • BGE-M3        │
│ • Memory (L1)   │    │ • In-Memory     │    │ • LLM APIs      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow

1. **Query Input** → User enters search query
2. **Embedding Generation** → Query converted to vector using BGE-M3
3. **Vector Search** → Find similar passages in LanceDB
4. **Hybrid Ranking** → Combine vector and keyword search results
5. **LLM Enhancement** → Generate insights and annotations
6. **Response Assembly** → Format and return results

## 🚀 Deployment

### Production Build

1. **Build the application**

   ```bash
   npm run build
   ```

2. **Start production server**
   ```bash
   npm start
   ```

### Docker Deployment

```bash
# Build Docker image
docker build -t infidao .

# Run container
docker run -p 3000:3000 -e NODE_ENV=production infidao
```

### Environment-Specific Configuration

**Development**

```env
NODE_ENV=development
LOG_LEVEL=debug
HOT_RELOAD=true
```

**Production**

```env
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_METRICS=true
KV_CACHE=true
```

## 🧪 Testing

```bash
# Regenerate local search artifacts
npm run generate-search-artifacts

# Run the release gate used for reboot MVP work
npm run type-check
npm run lint
npm test -- --runInBand
npm run build

# Run against a production build or deployed URL
npm run smoke:release
```

For standalone local smoke after `npm run build`:

```bash
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then cp -R public .next/standalone/public; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
```

Legacy test shortcuts still work:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Structure

- Unit tests for utilities and business logic
- Integration tests for API endpoints
- Component tests for UI interactions
- E2E tests for complete user workflows

## 📈 Performance

### Optimization Features

- **Code Splitting**: Automatic bundle optimization
- **Lazy Loading**: Components and models loaded on demand
- **Caching**: Multi-layer caching strategy
- **Streaming**: Real-time response streaming
- **CDN Ready**: Static asset optimization

### Monitoring

- Performance metrics collection
- Error tracking and reporting
- Search analytics
- User interaction tracking

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Standards

- Follow ESLint configuration
- Use Prettier for formatting
- Write TypeScript for new code
- Add tests for new features
- Document public APIs

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- **BGE-M3 Team** - For the excellent embedding model
- **LanceDB Team** - For the vector database
- **Classical Chinese Scholars** - For preserving the Six Classics
- **Open Source Community** - For making AI accessible to everyone

## 📞 Support

- **Documentation**: [./docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/InfiDao/infidao/issues)
- **Discussions**: [GitHub Discussions](https://github.com/InfiDao/infidao/discussions)
- **Email**: support@infidao.org

---

**InfiDao 六经注我** - Bridging Ancient Wisdom with Modern Technology 🏮✨
