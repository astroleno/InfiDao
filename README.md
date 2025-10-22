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

### MVP Mode: JSON-first Search

To enable fast iteration with minimal ops cost, the MVP defaults to a lightweight "JSON embeddings + in-memory search" approach:
- No database required at start; passages and embeddings are stored as JSON/JSONL under `data/`
- In-memory cosine similarity Top-K search is sufficient for small-to-medium datasets
- Seamless migration: when the dataset grows, switch to LanceDB/pgvector without changing the public search API

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **Python** >= 3.8 (for model dependencies)
- **At least 8GB RAM** (for embedding models)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/InfiDao/infidao.git
   cd infidao
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Run health check**
   ```bash
   npm run health-check
   ```

5. **Download AI models**
   ```bash
   npm run download-model
   ```

6. **Initialize database**
   ```bash
   npm run init-db
   ```

7. **Import sample data**
   ```bash
   npm run import-data
   ```

8. **Start development server**
   ```bash
   npm run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to explore the platform!

### MVP Quick Start (JSON Mode)

1. Data: use the built-in sample `data/sixclassics-sample.jsonl`
2. Embeddings:
   - Quick try: generate on the fly via API on first run (slower)
   - Recommended: run an offline script to create `data/embeddings.json` (script to be provided)
3. Search & Explain: UI sends query → in-memory Top-K over JSON embeddings → use `explantation_prompt.md` to produce three-layer explanation (translation/terms/background)
4. Migration: keep the same search interface and swap the backend to LanceDB when needed

## 🛠️ Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues automatically |
| `npm run format` | Format code with Prettier |
| `npm run type-check` | Run TypeScript type checking |
| `npm run test` | Run tests |
| `npm run analyze` | Analyze bundle size |
| `npm run clean` | Clean build artifacts and cache |

### Database & Models

| Command | Description |
|---------|-------------|
| `npm run download-model` | Download BGE-M3 embedding model |
| `npm run init-db` | Initialize LanceDB database (optional for MVP) |
| `npm run import-data` | Import Six Classics data (optional for MVP) |
| `npm run setup` | Complete setup (models + DB + data) |
| `npm run db:reset` | Reset database completely |
| `npm run cache:clear` | Clear all cache directories |

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