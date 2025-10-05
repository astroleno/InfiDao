# InfiDao - "六经注我" Infinite Wiki 技术规范文档

## 目录

1. [项目概述](#1-项目概述)
2. [核心概念](#2-核心概念)
3. [系统架构](#3-系统架构)
4. [数据模型设计](#4-数据模型设计)
5. [API接口规范](#5-api接口规范)
6. [核心算法设计](#6-核心算法设计)
7. [前端架构设计](#7-前端架构设计)
8. [用户界面设计](#8-用户界面设计)
9. [开发计划](#9-开发计划)
10. [性能优化策略](#10-性能优化策略)
11. [技术风险评估](#11-技术风险评估)
12. [部署与运维](#12-部署与运维)

---

## 1. 项目概述

### 1.1 项目愿景

InfiDao 是一个革命性的知识管理系统，旨在实现中国传统文化中"六经注我"的核心理念。系统通过AI技术，让用户可以创建一个动态的、无限扩展的知识网络，其中每个知识点都可以被注释、引用、关联和演化。

### 1.2 核心价值主张

- **双向注释系统**：不仅"我注六经"，更实现"六经注我"，知识与人相互成就
- **无限知识图谱**：构建动态演进的知识网络，支持多维度关联
- **AI原生设计**：深度融合AI能力，实现智能知识管理和生成
- **版本化知识演进**：追踪知识的演化路径，保留思考痕迹
- **多模态支持**：文本、图像、链接等多种知识载体统一管理

### 1.3 技术栈选择

- **前端框架**：Next.js 14 (App Router) + React 18 + TypeScript
- **状态管理**：Zustand + React Query
- **UI组件库**：Radix UI + Tailwind CSS
- **后端服务**：Next.js Route Handlers + Prisma ORM
- **数据库**：PostgreSQL + Pinecone/Weaviate (向量数据库)
- **AI服务**：多供应商支持 (OpenAI、Gemini、Claude)
- **部署平台**：Vercel

---

## 2. 核心概念

### 2.1 "六经注我"理念阐释

"六经注我"是中国哲学中的重要概念，强调通过经典来阐发自己的思想。在InfiDao系统中，这个理念被转化为：

1. **我注六经**：用户对知识点进行注释、解读、延伸
2. **六经注我**：知识网络反哺用户，启发新的思考和关联
3. **双向互动**：形成人与知识共同演进的闭环

### 2.2 系统核心概念

#### 2.2.1 知识节点 (Knowledge Node)

知识网络的基本单元，包含：
- 原始内容
- 元数据（标签、分类、来源等）
- 向量表示
- 关联关系
- 版本历史
- 注释集合

#### 2.2.2 注释系统 (Annotation System)

```typescript
interface Annotation {
  id: string
  type: 'comment' | 'question' | 'link' | 'extension' | 'critique'
  content: string
  author: string
  targetNode: string
  position?: {
    start: number
    end: number
    text: string
  }
  createdAt: Date
  updatedAt: Date
  reactions: Reaction[]
  replies: Annotation[]
  aiGenerated?: boolean
  confidence?: number
}
```

#### 2.2.3 知识图谱 (Knowledge Graph)

动态的知识关联网络，支持：
- 多维度关系类型
- 权重计算
- 路径发现
- 知识推理

#### 2.2.4 思想链 (Thought Chain)

记录知识演化路径：
- 思想的起源和发展
- 概念的演变历史
- 影响关系网络

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                           │
├─────────────────────────────────────────────────────────────┤
│  Web Client (Next.js)    │    Mobile App (React Native)     │
│  - React 18              │    - React Native               │
│  - TypeScript            │    - TypeScript                │
│  - Tailwind CSS          │    - NativeBase                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway                              │
├─────────────────────────────────────────────────────────────┤
│              Next.js Route Handlers                         │
│  - Authentication          │  - Rate Limiting              │
│  - Request Validation      │  - Caching                    │
│  - Error Handling          │  - Logging                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Service Layer                              │
├─────────────────────────────────────────────────────────────┤
│  Knowledge Service      │  Annotation Service              │
│  - CRUD Operations      │  - Thread Management            │
│  - Search & Filter      │  - Moderation                   │
│  - Version Control      │  - Notifications               │
│                         │                                 │
│  AI Integration         │  Graph Service                  │
│  - Embedding Generation │  - Relationship Management     │
│  - Content Generation   │  - Path Finding                │
│  - Semantic Search      │  - Analytics                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL (Primary)      │    Vector Database             │
│  - Users & Auth            │    - Embeddings               │
│  - Knowledge Nodes         │    - Semantic Search          │
│  - Annotations             │    - Similarity Matching      │
│  - Relations               │    (Pinecone/Weaviate)        │
│  - Audit Logs              │                                 │
│                            │    Cache Layer                 │
│                            │    - Redis/Memcached          │
│                            │    - Session Storage          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块设计

#### 3.2.1 知识管理模块

```typescript
// 知识节点管理器
class KnowledgeManager {
  async createNode(data: CreateNodeDto): Promise<KnowledgeNode>
  async updateNode(id: string, data: UpdateNodeDto): Promise<KnowledgeNode>
  async deleteNode(id: string): Promise<void>
  async getNode(id: string): Promise<KnowledgeNode>
  async searchNodes(query: SearchQuery): Promise<SearchResult[]>
  async getRelatedNodes(id: string, depth: number): Promise<RelatedNode[]>
}
```

#### 3.2.2 注释系统模块

```typescript
// 注释管理器
class AnnotationManager {
  async addAnnotation(data: CreateAnnotationDto): Promise<Annotation>
  async updateAnnotation(id: string, data: UpdateAnnotationDto): Promise<Annotation>
  async deleteAnnotation(id: string): Promise<void>
  async getAnnotations(nodeId: string): Promise<Annotation[]>
  async getThread(annotationId: string): Promise<Annotation[]>
}
```

#### 3.2.3 AI集成模块

```typescript
// AI服务管理器
class AIServiceManager {
  private providers: Map<string, AIProvider>

  async generateEmbedding(text: string): Promise<number[]>
  async semanticSearch(query: string, limit: number): Promise<SearchResult[]>
  async generateContent(prompt: string, context: Context): Promise<string>
  async extractKeywords(text: string): Promise<string[]>
  async summarizeContent(content: string): Promise<string>
}
```

---

## 4. 数据模型设计

### 4.1 核心数据模型

#### 4.1.1 用户模型

```typescript
interface User {
  id: string
  email: string
  username: string
  displayName: string
  avatar?: string
  bio?: string
  preferences: {
    theme: 'light' | 'dark' | 'auto'
    language: string
    aiProvider: string
    privacy: {
      publicProfile: boolean
      allowDataUsage: boolean
    }
  }
  stats: {
    nodesCreated: number
    annotationsMade: number
    connectionsFormed: number
  }
  createdAt: Date
  updatedAt: Date
}
```

#### 4.1.2 知识节点模型

```typescript
interface KnowledgeNode {
  id: string
  title: string
  content: string
  type: 'note' | 'article' | 'quote' | 'reference' | 'question' | 'idea'
  authorId: string
  status: 'draft' | 'published' | 'archived'

  // 元数据
  metadata: {
    tags: string[]
    categories: string[]
    source?: string
    language: string
    readingTime: number
    difficulty: 'beginner' | 'intermediate' | 'advanced'
  }

  // AI生成内容
  aiGenerated: {
    summary: string
    keywords: string[]
    embedding: number[]
    relatedTopics: string[]
  }

  // 关联信息
  relations: {
    inbound: Relation[]
    outbound: Relation[]
  }

  // 版本控制
  version: {
    current: number
    history: Version[]
  }

  // 统计信息
  stats: {
    views: number
    likes: number
    annotations: number
    shares: number
  }

  timestamps: {
    createdAt: Date
    updatedAt: Date
    publishedAt?: Date
    lastViewedAt?: Date
  }
}
```

#### 4.1.3 关系模型

```typescript
interface Relation {
  id: string
  fromNode: string
  toNode: string
  type: 'references' | 'extends' | 'contradicts' | 'questions' | 'supports' | 'example'
  weight: number // 0-1, 关系强度
  bidirectional: boolean
  createdBy: string
  description?: string
  createdAt: Date
}
```

#### 4.1.4 注释模型

```typescript
interface Annotation {
  id: string
  nodeId: string
  authorId: string
  type: 'comment' | 'question' | 'suggestion' | 'correction' | 'extension'
  content: string
  position?: {
    start: number
    end: number
    selectedText: string
  }

  // AI辅助信息
  aiData?: {
    sentiment: 'positive' | 'neutral' | 'negative'
    category: string
    suggestedReply?: string
  }

  // 互动数据
  interactions: {
    likes: number
    replies: number
    views: number
  }

  // 状态
  status: 'active' | 'hidden' | 'deleted'
  isPrivate: boolean

  timestamps: {
    createdAt: Date
    updatedAt: Date
    resolvedAt?: Date
  }
}
```

### 4.2 数据库表结构

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    preferences JSONB DEFAULT '{}',
    stats JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 知识节点表
CREATE TABLE knowledge_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(20) NOT NULL,
    author_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'draft',
    metadata JSONB DEFAULT '{}',
    ai_generated JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    stats JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP
);

-- 关系表
CREATE TABLE relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_node UUID REFERENCES knowledge_nodes(id),
    to_node UUID REFERENCES knowledge_nodes(id),
    type VARCHAR(20) NOT NULL,
    weight FLOAT DEFAULT 0.5,
    bidirectional BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(from_node, to_node, type)
);

-- 注释表
CREATE TABLE annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID REFERENCES knowledge_nodes(id),
    author_id UUID REFERENCES users(id),
    type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    position JSONB,
    ai_data JSONB,
    interactions JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    is_private BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

-- 版本历史表
CREATE TABLE node_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID REFERENCES knowledge_nodes(id),
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    changes_summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_nodes_author ON knowledge_nodes(author_id);
CREATE INDEX idx_nodes_type ON knowledge_nodes(type);
CREATE INDEX idx_nodes_status ON knowledge_nodes(status);
CREATE INDEX idx_nodes_created ON knowledge_nodes(created_at DESC);
CREATE INDEX idx_relations_from ON relations(from_node);
CREATE INDEX idx_relations_to ON relations(to_node);
CREATE INDEX idx_annotations_node ON annotations(node_id);
CREATE INDEX idx_annotations_author ON annotations(author_id);
```

### 4.3 向量数据结构

```typescript
// 向量数据库中的文档结构
interface VectorDocument {
  id: string // 对应知识节点ID
  values: number[] // 向量表示 (1536维 for OpenAI)
  metadata: {
    title: string
    type: string
    tags: string[]
    author: string
    created_at: number
    content_preview: string // 前500字符
  }
}
```

---

## 5. API接口规范

### 5.1 RESTful API 设计原则

- 使用标准HTTP方法 (GET, POST, PUT, DELETE, PATCH)
- 统一的响应格式
- 合理的HTTP状态码
- 版本控制 (/api/v1/)
- 请求限流和安全控制

### 5.2 通用响应格式

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    timestamp: string
    requestId: string
  }
}
```

### 5.3 认证与授权

```typescript
// POST /api/v1/auth/login
interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  user: User
  tokens: {
    accessToken: string
    refreshToken: string
    expiresIn: number
  }
}

// POST /api/v1/auth/register
interface RegisterRequest {
  email: string
  username: string
  password: string
  displayName: string
}

// POST /api/v1/auth/refresh
interface RefreshTokenRequest {
  refreshToken: string
}
```

### 5.4 知识节点 API

```typescript
// GET /api/v1/nodes
interface GetNodesQuery {
  page?: number
  limit?: number
  type?: string
  author?: string
  tags?: string[]
  search?: string
  sortBy?: 'created' | 'updated' | 'views' | 'likes'
  sortOrder?: 'asc' | 'desc'
}

// POST /api/v1/nodes
interface CreateNodeRequest {
  title: string
  content: string
  type: string
  metadata?: {
    tags?: string[]
    categories?: string[]
    source?: string
  }
}

// PUT /api/v1/nodes/:id
interface UpdateNodeRequest {
  title?: string
  content?: string
  metadata?: any
}

// GET /api/v1/nodes/:id
interface GetNodeResponse {
  node: KnowledgeNode
  relatedNodes: KnowledgeNode[]
  annotations: Annotation[]
}
```

### 5.5 搜索 API

```typescript
// GET /api/v1/search
interface SearchQuery {
  q: string
  type?: 'semantic' | 'keyword' | 'hybrid'
  filters?: {
    type?: string[]
    author?: string[]
    tags?: string[]
    dateRange?: {
      from: string
      to: string
    }
  }
  limit?: number
  offset?: number
}

interface SearchResult {
  node: KnowledgeNode
  score: number
  highlights: string[]
  relatedTerms: string[]
}
```

### 5.6 注释 API

```typescript
// POST /api/v1/nodes/:nodeId/annotations
interface CreateAnnotationRequest {
  type: string
  content: string
  position?: {
    start: number
    end: number
  }
  isPrivate?: boolean
}

// GET /api/v1/nodes/:nodeId/annotations
interface GetAnnotationsQuery {
  type?: string
  author?: string
  sort?: 'created' | 'updated' | 'likes'
}
```

### 5.7 AI 服务 API

```typescript
// POST /api/v1/ai/embed
interface EmbedRequest {
  text: string
  model?: string
}

// POST /api/v1/ai/generate
interface GenerateRequest {
  prompt: string
  context?: {
    nodeId?: string
    relatedNodes?: string[]
    conversationHistory?: Message[]
  }
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
}

// POST /api/v1/ai/suggest
interface SuggestRequest {
  nodeId: string
  type: 'related' | 'tags' | 'summary' | 'questions'
}
```

### 5.8 知识图谱 API

```typescript
// GET /api/v1/graph/nodes/:id/relations
interface GetRelationsQuery {
  type?: string
  depth?: number
  includeInbound?: boolean
  includeOutbound?: boolean
}

// POST /api/v1/graph/relations
interface CreateRelationRequest {
  fromNode: string
  toNode: string
  type: string
  weight?: number
  description?: string
}

// GET /api/v1/graph/paths
interface FindPathsQuery {
  from: string
  to: string
  maxDepth?: number
  relationTypes?: string[]
}
```

---

## 6. 核心算法设计

### 6.1 语义搜索算法

```typescript
class SemanticSearchEngine {
  private vectorDB: VectorDatabase
  private embeddingModel: EmbeddingModel

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // 1. 生成查询向量
    const queryVector = await this.embeddingModel.generate(query)

    // 2. 向量相似度搜索
    const vectorResults = await this.vectorDB.search(queryVector, {
      topK: options.limit * 2, // 获取更多结果用于重排
      filters: options.filters
    })

    // 3. 混合重排序
    const rerankedResults = await this.rerank(query, vectorResults)

    // 4. 返回结果
    return rerankedResults.slice(0, options.limit)
  }

  private async rerank(query: string, results: VectorResult[]): Promise<SearchResult[]> {
    // 结合语义相似度、文本匹配度、用户行为等因素进行重排序
    return results.map(result => ({
      ...result,
      score: this.calculateFinalScore(query, result)
    })).sort((a, b) => b.score - a.score)
  }

  private calculateFinalScore(query: string, result: VectorResult): number {
    // 语义相似度 (60%)
    const semanticScore = result.score * 0.6

    // 文本匹配度 (20%)
    const textScore = this.calculateTextSimilarity(query, result.content) * 0.2

    // 流行度分数 (20%)
    const popularityScore = this.calculatePopularityScore(result) * 0.2

    return semanticScore + textScore + popularityScore
  }
}
```

### 6.2 知识推荐算法

```typescript
class KnowledgeRecommender {
  async recommendNodes(userId: string, context: RecommendationContext): Promise<Recommendation[]> {
    // 1. 获取用户历史行为
    const userHistory = await this.getUserHistory(userId)

    // 2. 分析用户兴趣图谱
    const interestGraph = await this.buildInterestGraph(userHistory)

    // 3. 生成候选集
    const candidates = await this.generateCandidates(interestGraph, context)

    // 4. 评分和排序
    const scoredCandidates = await this.scoreCandidates(candidates, userHistory)

    // 5. 多样性处理
    const diversified = this.diversify(scoredCandidates)

    return diversified.slice(0, 10)
  }

  private async scoreCandidates(candidates: Node[], history: UserHistory): Promise<ScoredNode[]> {
    return Promise.all(candidates.map(async node => ({
      node,
      score: await this.calculateRecommendationScore(node, history)
    })))
  }

  private async calculateRecommendationScore(node: Node, history: UserHistory): Promise<number> {
    // 多因子评分模型
    const factors = {
      contentSimilarity: await this.getContentSimilarity(node, history),
      graphProximity: this.getGraphProximity(node, history),
      temporalRelevance: this.getTemporalRelevance(node),
      popularityBoost: this.getPopularityBoost(node),
      serendipity: this.calculateSerendipity(node, history)
    }

    // 加权求和
    return Object.entries(factors).reduce((score, [factor, value]) => {
      return score + value * this.getFactorWeight(factor)
    }, 0)
  }
}
```

### 6.3 知识图谱路径发现算法

```typescript
class GraphPathFinder {
  async findPaths(from: string, to: string, options: PathOptions): Promise<Path[]> {
    // 使用改进的A*算法进行路径发现
    const openSet = new PriorityQueue<PathNode>()
    const closedSet = new Set<string>()
    const cameFrom = new Map<string, PathNode>()

    // 初始化起始节点
    const startNode: PathNode = {
      id: from,
      gScore: 0,
      fScore: this.heuristic(from, to),
      path: [from]
    }

    openSet.enqueue(startNode, startNode.fScore)

    while (!openSet.isEmpty()) {
      const current = openSet.dequeue()

      if (current.id === to) {
        return this.reconstructPath(cameFrom, current)
      }

      closedSet.add(current.id)

      // 获取邻居节点
      const neighbors = await this.getNeighbors(current.id, options.relationTypes)

      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor.id)) continue

        const tentativeGScore = current.gScore + this.cost(current, neighbor)

        if (!cameFrom.has(neighbor.id) || tentativeGScore < cameFrom.get(neighbor.id)!.gScore) {
          cameFrom.set(neighbor.id, {
            ...neighbor,
            gScore: tentativeGScore,
            fScore: tentativeGScore + this.heuristic(neighbor.id, to),
            path: [...current.path, neighbor.id]
          })

          openSet.enqueue(cameFrom.get(neighbor.id)!, cameFrom.get(neighbor.id)!.fScore)
        }
      }
    }

    return [] // 未找到路径
  }

  private heuristic(from: string, to: string): number {
    // 使用向量相似度作为启发式函数
    return 1 - this.vectorSimilarity(from, to)
  }
}
```

### 6.4 注释情感分析算法

```typescript
class SentimentAnalyzer {
  async analyzeAnnotation(annotation: Annotation): Promise<SentimentResult> {
    // 使用预训练模型进行情感分析
    const sentiment = await this.model.predict(annotation.content)

    // 主题提取
    const topics = await this.extractTopics(annotation.content)

    // 意图识别
    const intent = await this.identifyIntent(annotation.content, annotation.type)

    return {
      sentiment: sentiment.label, // positive, neutral, negative
      confidence: sentiment.score,
      topics,
      intent,
      suggestedActions: this.generateSuggestedActions(sentiment, intent)
    }
  }

  private generateSuggestedActions(sentiment: any, intent: string): string[] {
    const actions: string[] = []

    if (sentiment.label === 'negative' && sentiment.score > 0.8) {
      actions.push('flag_for_review')
      actions.push('notify_moderator')
    }

    if (intent === 'question') {
      actions.push('suggest_expert_answer')
      actions.push('find_related_resources')
    }

    if (intent === 'suggestion') {
      actions.push('highlight_for_author')
      actions.push('create_poll')
    }

    return actions
  }
}
```

---

## 7. 前端架构设计

### 7.1 组件架构

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 认证相关页面
│   ├── dashboard/         # 仪表板
│   ├── nodes/             # 知识节点页面
│   ├── graph/             # 知识图谱可视化
│   └── layout.tsx         # 根布局
├── components/            # React组件
│   ├── ui/               # 基础UI组件
│   ├── forms/            # 表单组件
│   ├── editors/          # 编辑器组件
│   ├── visualizations/   # 可视化组件
│   └── features/         # 功能组件
├── hooks/                # 自定义Hooks
├── stores/               # 状态管理
├── services/             # API服务
├── utils/                # 工具函数
└── types/                # TypeScript类型定义
```

### 7.2 状态管理设计

```typescript
// stores/knowledgeStore.ts
interface KnowledgeState {
  // 状态
  nodes: Map<string, KnowledgeNode>
  currentNode: KnowledgeNode | null
  relatedNodes: KnowledgeNode[]
  searchResults: SearchResult[]
  isLoading: boolean

  // 操作
  fetchNode: (id: string) => Promise<void>
  createNode: (data: CreateNodeDto) => Promise<void>
  updateNode: (id: string, data: UpdateNodeDto) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  searchNodes: (query: SearchQuery) => Promise<void>
  createRelation: (data: CreateRelationDto) => Promise<void>
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  nodes: new Map(),
  currentNode: null,
  relatedNodes: [],
  searchResults: [],
  isLoading: false,

  fetchNode: async (id: string) => {
    set({ isLoading: true })
    try {
      const response = await api.get(`/nodes/${id}`)
      const node = response.data

      set(state => ({
        nodes: new Map(state.nodes).set(id, node),
        currentNode: node
      }))

      // 获取相关节点
      get().fetchRelatedNodes(id)
    } catch (error) {
      console.error('Failed to fetch node:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  // ... 其他方法
}))
```

### 7.3 核心组件设计

#### 7.3.1 知识节点编辑器

```typescript
// components/editors/NodeEditor.tsx
export const NodeEditor: React.FC<NodeEditorProps> = ({ node, onSave, onCancel }) => {
  const [content, setContent] = useState(node?.content || '')
  const [title, setTitle] = useState(node?.title || '')
  const [metadata, setMetadata] = useState(node?.metadata || {})
  const [isAIAssistOpen, setIsAIAssistOpen] = useState(false)

  const { generateSuggestions, generateSummary } = useAIAssist()

  const handleSave = async () => {
    const nodeData = {
      title,
      content,
      metadata
    }

    if (node) {
      await updateNode(node.id, nodeData)
    } else {
      await createNode(nodeData)
    }

    onSave?.()
  }

  const handleAIGenerate = async (type: 'summary' | 'tags' | 'extension') => {
    switch (type) {
      case 'summary':
        const summary = await generateSummary(content)
        setMetadata(prev => ({ ...prev, summary }))
        break
      case 'tags':
        const tags = await generateTags(content)
        setMetadata(prev => ({ ...prev, tags }))
        break
      case 'extension':
        const extension = await generateExtension(content)
        setContent(prev => prev + '\n\n' + extension)
        break
    }
  }

  return (
    <div className="node-editor">
      <div className="editor-header">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入标题..."
          className="title-input"
        />

        <div className="editor-actions">
          <Button onClick={() => setIsAIAssistOpen(!isAIAssistOpen)}>
            <SparklesIcon className="w-4 h-4 mr-2" />
            AI 助手
          </Button>
          <Button onClick={handleSave}>保存</Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </div>
      </div>

      <div className="editor-content">
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="开始写作..."
        />
      </div>

      {isAIAssistOpen && (
        <AIAssistPanel
          content={content}
          onGenerate={handleAIGenerate}
        />
      )}
    </div>
  )
}
```

#### 7.3.2 知识图谱可视化

```typescript
// components/visualizations/KnowledgeGraph.tsx
export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ centerNodeId }) => {
  const { nodes, relations } = useGraphData(centerNodeId)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [layout, setLayout] = useState<'force' | 'hierarchical' | 'circular'>('force')

  const graphRef = useRef<GraphRef>(null)

  useEffect(() => {
    if (graphRef.current && nodes.length > 0) {
      graphRef.current.zoomToFit()
    }
  }, [nodes])

  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId)
    // 加载节点详情
    router.push(`/nodes/${nodeId}`)
  }

  const handleRelationCreate = async (from: string, to: string, type: string) => {
    await createRelation({ fromNode: from, toNode: to, type })
    // 刷新图谱数据
  }

  return (
    <div className="knowledge-graph-container">
      <div className="graph-toolbar">
        <Select value={layout} onValueChange={setLayout}>
          <SelectItem value="force">力导向布局</SelectItem>
          <SelectItem value="hierarchical">层次布局</SelectItem>
          <SelectItem value="circular">环形布局</SelectItem>
        </Select>

        <Button onClick={() => graphRef.current?.center()}>
          <CenterIcon className="w-4 h-4" />
        </Button>

        <Button onClick={() => graphRef.current?.zoomIn()}>
          <ZoomInIcon className="w-4 h-4" />
        </Button>

        <Button onClick={() => graphRef.current?.zoomOut()}>
          <ZoomOutIcon className="w-4 h-4" />
        </Button>
      </div>

      <GraphCanvas
        ref={graphRef}
        nodes={nodes}
        relations={relations}
        layout={layout}
        onNodeClick={handleNodeClick}
        onRelationCreate={handleRelationCreate}
        selectedNode={selectedNode}
      />

      {selectedNode && (
        <NodePreviewPanel
          nodeId={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}
```

#### 7.3.3 注释系统组件

```typescript
// components/features/AnnotationSystem.tsx
export const AnnotationSystem: React.FC<AnnotationSystemProps> = ({ nodeId }) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [newAnnotation, setNewAnnotation] = useState('')
  const [selectedText, setSelectedText] = useState<Selection | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'comments' | 'questions' | 'suggestions'>('all')

  const { createAnnotation, replyToAnnotation } = useAnnotations()

  const handleTextSelection = () => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim()) {
      setSelectedText({
        text: selection.toString(),
        range: selection.getRangeAt(0)
      })
    }
  }

  const handleCreateAnnotation = async (type: AnnotationType) => {
    if (!newAnnotation.trim()) return

    const annotationData: CreateAnnotationDto = {
      nodeId,
      type,
      content: newAnnotation,
      position: selectedText ? {
        start: selectedText.range.startOffset,
        end: selectedText.range.endOffset,
        selectedText: selectedText.text
      } : undefined
    }

    await createAnnotation(annotationData)

    // 清空输入
    setNewAnnotation('')
    setSelectedText(null)
    window.getSelection()?.removeAllRanges()
  }

  const filteredAnnotations = annotations.filter(ann => {
    if (activeTab === 'all') return true
    return ann.type === activeTab.slice(0, -1) // 移除复数's'
  })

  return (
    <div className="annotation-system">
      <div className="annotation-tabs">
        {['all', 'comments', 'questions', 'suggestions'].map(tab => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab === 'all' ? '全部' :
             tab === 'comments' ? '评论' :
             tab === 'questions' ? '问题' : '建议'}
            <span className="count">
              {tab === 'all' ? annotations.length :
               annotations.filter(a => a.type === tab.slice(0, -1)).length}
            </span>
          </button>
        ))}
      </div>

      {selectedText && (
        <div className="selected-text-bar">
          <span>已选择: "{selectedText.text}"</span>
          <button onClick={() => setSelectedText(null)}>
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="annotation-input">
        <Textarea
          value={newAnnotation}
          onChange={(e) => setNewAnnotation(e.target.value)}
          placeholder={selectedText ? "对选中文本进行注释..." : "添加注释..."}
        />

        <div className="annotation-actions">
          <div className="annotation-types">
            <Button onClick={() => handleCreateAnnotation('comment')}>
              <MessageIcon className="w-4 h-4 mr-1" />
              评论
            </Button>
            <Button onClick={() => handleCreateAnnotation('question')}>
              <QuestionIcon className="w-4 h-4 mr-1" />
              提问
            </Button>
            <Button onClick={() => handleCreateAnnotation('suggestion')}>
              <LightbulbIcon className="w-4 h-4 mr-1" />
              建议
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={() => setNewAnnotation('')}
          >
            清空
          </Button>
        </div>
      </div>

      <div className="annotations-list">
        {filteredAnnotations.map(annotation => (
          <AnnotationItem
            key={annotation.id}
            annotation={annotation}
            onReply={replyToAnnotation}
          />
        ))}
      </div>
    </div>
  )
}
```

### 7.4 性能优化策略

#### 7.4.1 虚拟滚动

```typescript
// components/ui/VirtualList.tsx
export const VirtualList: React.FC<VirtualListProps> = ({
  items,
  itemHeight,
  containerHeight,
  renderItem
}) => {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const visibleStart = Math.floor(scrollTop / itemHeight)
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight) + 1,
    items.length - 1
  )

  const visibleItems = items.slice(visibleStart, visibleEnd + 1)

  return (
    <div
      ref={containerRef}
      className="virtual-list"
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {visibleItems.map((item, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: (visibleStart + index) * itemHeight,
              height: itemHeight,
              width: '100%'
            }}
          >
            {renderItem(item, visibleStart + index)}
          </div>
        ))}
      </div>
    </div>
  )
}
```

#### 7.4.2 图像懒加载

```typescript
// components/ui/LazyImage.tsx
export const LazyImage: React.FC<LazyImageProps> = ({ src, alt, ...props }) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={imgRef} className="lazy-image-container">
      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          style={{
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s'
          }}
          {...props}
        />
      )}
      {!isLoaded && <div className="image-placeholder" />}
    </div>
  )
}
```

---

## 8. 用户界面设计

### 8.1 设计原则

1. **简约而不简单**：界面清晰，功能完整
2. **渐进式披露**：根据用户需求逐步展示功能
3. **上下文感知**：根据当前场景提供相关操作
4. **响应式设计**：适配各种设备和屏幕尺寸
5. **无障碍访问**：支持键盘导航和屏幕阅读器

### 8.2 核心页面设计

#### 8.2.1 仪表板页面

```
┌─────────────────────────────────────────────────────────────┐
│  Header (导航栏)                                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │                 │  │                                  │  │
│  │   快速统计       │  │         最近活动                 │  │
│  │                 │  │                                  │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
│                                                            │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │                 │  │                                  │  │
│  │   推荐阅读       │  │         知识图谱预览             │  │
│  │                 │  │                                  │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
│                                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  AI 建议区域                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 8.2.2 知识节点详情页

```
┌─────────────────────────────────────────────────────────────┐
│  Header                                                     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │              │  │                                      │ │
│  │   侧边栏       │  │           主内容区                   │ │
│  │   - 元数据     │  │  - 标题                            │ │
│  │   - 标签       │  │  - 内容                            │ │
│  │   - 关联       │  │  - 内联注释                        │ │
│  │   - 版本       │  │  - AI摘要                          │ │
│  │              │  │                                      │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
│                                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    注释区域                             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### 8.2.3 知识图谱页面

```
┌─────────────────────────────────────────────────────────────┐
│  Header + 工具栏                                            │
├─────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │                  图谱画布                               │ │
│  │                                                        │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │              │  │                                      │ │
│  │   过滤器      │  │         节点详情面板                 │ │
│  │              │  │                                      │ │
│  └──────────────┘  └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 交互设计

#### 8.3.1 键盘快捷键

```typescript
// 快捷键配置
const shortcuts = {
  // 导航
  'Ctrl+K': '打开搜索',
  'Ctrl+G': '跳转到图谱',
  'Ctrl+N': '创建新节点',
  'Ctrl+/': '显示快捷键帮助',

  // 编辑
  'Ctrl+S': '保存',
  'Ctrl+B': '加粗',
  'Ctrl+I': '斜体',
  'Ctrl+K': '插入链接',
  'Ctrl+Shift+C': '插入代码块',

  // 视图
  'Ctrl+Shift+F': '全屏',
  'Ctrl+\\': '切换侧边栏',
  'Ctrl+Shift+T': '切换主题',

  // AI功能
  'Ctrl+Space': 'AI自动完成',
  'Ctrl+Shift+A': 'AI助手面板',
  'Ctrl+Shift+S': '生成摘要'
}
```

#### 8.3.2 手势支持

```typescript
// 触摸手势支持
const gestures = {
  // 双击创建注释
  onDoubleTap: (position) => {
    showAnnotationEditor(position)
  },

  // 长按显示上下文菜单
  onLongPress: (target) => {
    showContextMenu(target)
  },

  // 捏合缩放图谱
  onPinch: (scale) => {
    zoomGraph(scale)
  },

  // 滑动切换页面
  onSwipe: (direction) => {
    if (direction === 'left') navigateToNext()
    if (direction === 'right') navigateToPrevious()
  }
}
```

### 8.4 主题系统

```typescript
// styles/theme.ts
export const theme = {
  light: {
    primary: '#2563eb',
    secondary: '#64748b',
    background: '#ffffff',
    surface: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    shadow: '0 1px 3px rgba(0,0,0,0.12)'
  },
  dark: {
    primary: '#3b82f6',
    secondary: '#94a3b8',
    background: '#0f172a',
    surface: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
    shadow: '0 1px 3px rgba(0,0,0,0.3)'
  }
}
```

---

## 9. 开发计划

### 9.1 项目里程碑

#### Phase 1: 基础架构 (4周)

**目标**：建立项目基础架构和核心功能

**任务列表**：
- [ ] 项目初始化和环境配置
- [ ] 数据库设计和迁移脚本
- [ ] 基础API框架搭建
- [ ] 用户认证系统
- [ ] 基础UI组件库
- [ ] 知识节点CRUD功能

**交付物**：
- 可运行的基础版本
- 用户注册/登录功能
- 基本的知识节点创建和编辑

#### Phase 2: 核心功能 (6周)

**目标**：实现核心的"六经注我"功能

**任务列表**：
- [ ] 注释系统实现
- [ ] 向量搜索集成
- [ ] 知识图谱基础功能
- [ ] AI服务集成
- [ ] 富文本编辑器
- [ ] 版本控制系统

**交付物**：
- 完整的注释功能
- 基础的知识图谱可视化
- AI辅助功能

#### Phase 3: 高级功能 (4周)

**目标**：实现高级功能和优化体验

**任务列表**：
- [ ] 高级图谱可视化
- [ ] 智能推荐系统
- [ ] 协作功能
- [ ] 导入/导出功能
- [ ] 性能优化
- [ ] 移动端适配

**交付物**：
- 功能完整的Web应用
- 移动端响应式设计
- 性能优化报告

#### Phase 4: 完善与发布 (2周)

**目标**：完善细节，准备发布

**任务列表**：
- [ ] 全面测试
- [ ] 文档完善
- [ ] 部署配置
- [ ] 监控和日志
- [ ] 用户反馈收集
- [ ] 迭代优化

**交付物**：
- 生产环境部署
- 用户文档
- 运维手册

### 9.2 技术债务管理

```typescript
// 技术债务追踪
interface TechnicalDebt {
  id: string
  title: string
  description: string
  impact: 'low' | 'medium' | 'high' | 'critical'
  effort: 'small' | 'medium' | 'large'
  type: 'code' | 'architecture' | 'test' | 'documentation'
  createdAt: Date
  resolvedAt?: Date
}

// 技术债务示例
const technicalDebts: TechnicalDebt[] = [
  {
    id: 'TD-001',
    title: '数据库查询优化',
    description: '复杂查询存在N+1问题，需要优化',
    impact: 'high',
    effort: 'medium',
    type: 'code',
    createdAt: new Date('2024-01-01')
  },
  {
    id: 'TD-002',
    title: '组件库标准化',
    description: '需要建立统一的组件设计系统',
    impact: 'medium',
    effort: 'large',
    type: 'architecture',
    createdAt: new Date('2024-01-02')
  }
]
```

### 9.3 代码规范和质量

```typescript
// .eslintrc.js
module.exports = {
  extends: [
    'next/core-web-vitals',
    '@typescript-eslint/recommended',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error'
  }
}

// prettier.config.js
module.exports = {
  semi: false,
  trailingComma: 'es5',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2
}
```

### 9.4 测试策略

```typescript
// 测试覆盖率要求
const testCoverage = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80
}

// 测试类型
const testTypes = {
  unit: '单元测试 - Jest + React Testing Library',
  integration: '集成测试 - Jest + Supertest',
  e2e: '端到端测试 - Playwright',
  visual: '视觉回归测试 - Chromatic',
  performance: '性能测试 - Lighthouse CI'
}
```

---

## 10. 性能优化策略

### 10.1 前端性能优化

#### 10.1.1 代码分割

```typescript
// 动态导入组件
const GraphVisualization = dynamic(
  () => import('../components/visualizations/GraphVisualization'),
  {
    loading: () => <GraphSkeleton />,
    ssr: false // 仅客户端渲染
  }
)

// 路由级别代码分割
const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
    lazy: () => import('../pages/Home')
  },
  {
    path: '/graph',
    element: <GraphPage />,
    lazy: () => import('../pages/Graph')
  }
])
```

#### 10.1.2 缓存策略

```typescript
// React Query配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分钟
      cacheTime: 10 * 60 * 1000, // 10分钟
      retry: 3,
      refetchOnWindowFocus: false
    }
  }
})

// SWR配置
const useSWRConfig = {
  revalidateOnFocus: false,
  dedupingInterval: 10000,
  errorRetryCount: 3
}
```

### 10.2 后端性能优化

#### 10.2.1 数据库优化

```sql
-- 查询优化示例
-- 使用索引优化
CREATE INDEX CONCURRENTLY idx_nodes_fulltext ON knowledge_nodes
USING GIN (to_tsvector('chinese', title || ' ' || content));

-- 分区表优化
CREATE TABLE annotations_2024_01 PARTITION OF annotations
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- 查询优化
EXPLAIN (ANALYZE, BUFFERS)
SELECT n.*, a.count as annotation_count
FROM knowledge_nodes n
LEFT JOIN (
  SELECT node_id, COUNT(*) as count
  FROM annotations
  GROUP BY node_id
) a ON n.id = a.node_id
WHERE n.type = 'article'
ORDER BY n.created_at DESC
LIMIT 20;
```

#### 10.2.2 API缓存

```typescript
// Redis缓存实现
class CacheService {
  private redis: Redis

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key)
    return value ? JSON.parse(value) : null
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value))
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern)
    if (keys.length > 0) {
      await this.redis.del(...keys)
    }
  }
}

// API中间件
export const withCache = (ttl: number = 300) => {
  return async (req: NextRequest, res: NextResponse) => {
    const cacheKey = `cache:${req.url}`

    // 尝试从缓存获取
    const cached = await cacheService.get(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // 执行原始请求
    const response = await res.next()

    // 缓存响应
    if (response.status === 200) {
      const data = await response.json()
      await cacheService.set(cacheKey, data, ttl)
    }

    return response
  }
}
```

### 10.3 AI服务优化

#### 10.3.1 批量处理

```typescript
// 批量生成向量
class BatchEmbeddingService {
  private queue: EmbeddingJob[] = []
  private processing = false

  async addJob(job: EmbeddingJob): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ ...job, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return

    this.processing = true

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 10) // 批量处理10个

      try {
        const embeddings = await this.generateBatchEmbeddings(
          batch.map(job => job.text)
        )

        batch.forEach((job, index) => {
          job.resolve(embeddings[index])
        })
      } catch (error) {
        batch.forEach(job => job.reject(error))
      }
    }

    this.processing = false
  }
}
```

#### 10.3.2 智能缓存

```typescript
// 语义缓存
class SemanticCache {
  private cache: Map<string, CachedEmbedding> = new Map()
  private threshold = 0.95 // 相似度阈值

  async get(text: string): Promise<number[] | null> {
    const embedding = await this.generateEmbedding(text)

    for (const [key, cached] of this.cache.entries()) {
      const similarity = this.cosineSimilarity(embedding, cached.embedding)

      if (similarity > this.threshold) {
        cached.hits++
        cached.lastAccessed = Date.now()
        return cached.embedding
      }
    }

    return null
  }

  async set(text: string, embedding: number[]): Promise<void> {
    const hash = this.hashText(text)
    this.cache.set(hash, {
      text,
      embedding,
      hits: 0,
      createdAt: Date.now(),
      lastAccessed: Date.now()
    })
  }
}
```

---

## 11. 技术风险评估

### 11.1 风险矩阵

| 风险 | 概率 | 影响 | 严重性 | 缓解措施 |
|------|------|------|--------|----------|
| AI API限制和成本 | 高 | 中 | 高 | 多供应商策略，智能缓存，本地模型备选 |
| 向量数据库性能 | 中 | 高 | 高 | 分片策略，索引优化，缓存层 |
| 用户数据隐私 | 低 | 高 | 中 | 端到端加密，数据匿名化，GDPR合规 |
| 知识图谱复杂度 | 高 | 中 | 中 | 渐进式加载，虚拟化渲染，性能监控 |
| 实时协作难度 | 高 | 高 | 高 | OT算法，状态同步，冲突解决机制 |

### 11.2 具体风险应对策略

#### 11.2.1 AI服务依赖风险

```typescript
// AI服务降级策略
class AIServiceFallback {
  private providers: AIProvider[] = [
    new OpenAIProvider(),
    new GeminiProvider(),
    new ClaudeProvider()
  ]

  async generateEmbedding(text: string): Promise<number[]> {
    const errors: Error[] = []

    for (const provider of this.providers) {
      try {
        return await provider.generateEmbedding(text)
      } catch (error) {
        errors.push(error as Error)
        continue
      }
    }

    // 所有提供商都失败，使用本地模型
    return this.generateLocalEmbedding(text)
  }

  private async generateLocalEmbedding(text: string): Promise<number[]> {
    // 使用轻量级本地模型作为后备
    const model = await this.loadLocalModel()
    return model.embed(text)
  }
}
```

#### 11.2.2 数据一致性风险

```typescript
// 事务管理
class KnowledgeService {
  async createNodeWithRelations(
    nodeData: CreateNodeDto,
    relations: CreateRelationDto[]
  ): Promise<KnowledgeNode> {
    return await prisma.$transaction(async (tx) => {
      // 创建节点
      const node = await tx.knowledgeNode.create({
        data: nodeData
      })

      // 创建关系
      for (const relation of relations) {
        await tx.relation.create({
          data: {
            ...relation,
            fromNode: node.id
          }
        })
      }

      // 更新统计
      await tx.userStats.update({
        where: { userId: nodeData.authorId },
        data: {
          nodesCreated: { increment: 1 }
        }
      })

      return node
    })
  }
}
```

### 11.3 监控和告警

```typescript
// 性能监控
class PerformanceMonitor {
  private metrics: Map<string, Metric[]> = new Map()

  trackOperation(name: string, operation: () => Promise<any>): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const start = performance.now()

      try {
        const result = await operation()
        const duration = performance.now() - start

        this.recordMetric(name, duration, 'success')
        resolve(result)
      } catch (error) {
        const duration = performance.now() - start

        this.recordMetric(name, duration, 'error')
        reject(error)
      }
    })
  }

  private recordMetric(name: string, duration: number, status: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }

    const metrics = this.metrics.get(name)!
    metrics.push({ duration, status, timestamp: Date.now() })

    // 保留最近1000条记录
    if (metrics.length > 1000) {
      metrics.shift()
    }

    // 检查是否需要告警
    this.checkAlerts(name, duration, status)
  }

  private checkAlerts(name: string, duration: number, status: string): void {
    // P95延迟告警
    const p95 = this.calculateP95(name)
    if (duration > p95 * 2) {
      this.sendAlert({
        type: 'performance',
        message: `Operation ${name} took ${duration}ms (P95: ${p95}ms)`,
        severity: 'warning'
      })
    }

    // 错误率告警
    const errorRate = this.calculateErrorRate(name)
    if (errorRate > 0.05) {
      this.sendAlert({
        type: 'error_rate',
        message: `Error rate for ${name} is ${errorRate * 100}%`,
        severity: 'critical'
      })
    }
  }
}
```

---

## 12. 部署与运维

### 12.1 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                      CDN                                    │
│                   (CloudFlare)                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                           │
│                    (Vercel Edge)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Application Servers                       │
│                  (Vercel Functions)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Server 1  │  │   Server 2  │  │   Server 3  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Database Layer                          │
│  ┌─────────────┐           ┌─────────────┐                 │
│  │ PostgreSQL  │           │  Vector DB  │                 │
│  │  (Primary)  │           │ (Pinecone)  │                 │
│  └─────────────┘           └─────────────┘                 │
│         │                           │                       │
│         ▼                           ▼                       │
│  ┌─────────────┐           ┌─────────────┐                 │
│  │ PostgreSQL  │           │  Vector DB  │                 │
│  │ (Replica)   │           │ (Cache)     │                 │
│  └─────────────┘           └─────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 环境配置

```typescript
// next.config.js
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=60, stale-while-revalidate' }
        ]
      }
    ]
  },
  async rewrites() {
    return [
      {
        source: '/healthz',
        destination: '/api/health'
      }
    ]
  }
}

// vercel.json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "crons": [
    {
      "path": "/api/cron/daily-maintenance",
      "schedule": "0 2 * * *"
    }
  ],
  "build": {
    "env": {
      "PRISMA_GENERATE_DATAPROXY": "true"
    }
  }
}
```

### 12.3 监控配置

```typescript
// lib/monitoring.ts
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http'

// 配置OpenTelemetry
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'infi-dao',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version
  })
})

provider.addSpanProcessor(
  new BatchSpanProcessor(new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  }))
)

provider.register()

// 自定义指标
export const metrics = {
  nodeViews: new Counter({
    name: 'node_views_total',
    help: 'Total number of node views'
  }),
  annotationCreated: new Counter({
    name: 'annotations_created_total',
    help: 'Total number of annotations created'
  }),
  searchQueries: new Counter({
    name: 'search_queries_total',
    help: 'Total number of search queries'
  }),
  responseTime: new Histogram({
    name: 'http_request_duration_ms',
    help: 'Duration of HTTP requests in ms',
    buckets: [10, 50, 100, 500, 1000, 5000]
  })
}
```

### 12.4 备份策略

```typescript
// scripts/backup.ts
class BackupService {
  async performBackup(): Promise<void> {
    const timestamp = new Date().toISOString()

    // 1. 数据库备份
    await this.backupDatabase(timestamp)

    // 2. 向量数据备份
    await this.backupVectorData(timestamp)

    // 3. 文件存储备份
    await this.backupFiles(timestamp)

    // 4. 验证备份完整性
    await this.verifyBackup(timestamp)

    // 5. 清理旧备份
    await this.cleanupOldBackups()
  }

  private async backupDatabase(timestamp: string): Promise<void> {
    const command = `pg_dump ${process.env.DATABASE_URL} | gzip > backup-db-${timestamp}.sql.gz`
    await this.executeCommand(command)

    // 上传到云存储
    await this.uploadToS3(`backup-db-${timestamp}.sql.gz`)
  }

  private async backupVectorData(timestamp: string): Promise<void> {
    // 从向量数据库导出数据
    const data = await this.vectorDB.exportAll()

    // 压缩和上传
    const compressed = await this.compress(data)
    await this.uploadToS3(`backup-vectors-${timestamp}.bin.gz`)
  }
}
```

### 12.5 灾难恢复计划

```typescript
// 灾难恢复流程
class DisasterRecovery {
  async restoreFromBackup(backupId: string): Promise<void> {
    try {
      // 1. 停止应用服务
      await this.stopServices()

      // 2. 恢复数据库
      await this.restoreDatabase(backupId)

      // 3. 恢复向量数据
      await this.restoreVectorData(backupId)

      // 4. 验证数据完整性
      await this.verifyDataIntegrity()

      // 5. 重启服务
      await this.startServices()

      // 6. 健康检查
      await this.healthCheck()

      console.log('Disaster recovery completed successfully')
    } catch (error) {
      console.error('Disaster recovery failed:', error)
      // 回滚操作
      await this.rollback()
      throw error
    }
  }

  async healthCheck(): Promise<void> {
    const checks = [
      this.checkDatabase(),
      this.checkVectorDB(),
      this.checkRedis(),
      this.checkAPIEndpoints()
    ]

    const results = await Promise.allSettled(checks)
    const failed = results.filter(r => r.status === 'rejected')

    if (failed.length > 0) {
      throw new Error(`Health check failed: ${failed.length} services unhealthy`)
    }
  }
}
```

---

## 结语

本文档详细阐述了InfiDao项目的技术架构和实现方案。通过"六经注我"的核心理念，我们构建了一个创新的知识管理系统，将传统智慧与现代AI技术完美融合。

系统的成功实施需要：
1. 严格遵循技术规范和最佳实践
2. 持续的性能优化和迭代改进
3. 重视用户反馈和体验优化
4. 保持技术前瞻性和可扩展性

我们相信，InfiDao将成为知识管理领域的重要创新，为用户提供前所未有的知识探索和创造体验。

---

*文档版本：v1.0*
*最后更新：2024年1月*
*作者：InfiDao技术团队*