# 儒释道技能树 + Infinite Wiki 架构设计文档

**项目名称**: InfiDao
**版本**: v1.0
**最后更新**: 2025-10-04
**文档类型**: 技术架构设计

---

## 📑 目录

1. [项目概述](#项目概述)
2. [产品愿景](#产品愿景)
3. [架构设计](#架构设计)
4. [技术选型](#技术选型)
5. [数据模型](#数据模型)
6. [核心功能模块](#核心功能模块)
7. [实施路线图](#实施路线图)
8. [技术决策记录](#技术决策记录)
9. [风险管理](#风险管理)
10. [性能指标](#性能指标)

---

## 项目概述

### 背景
融合"技能树可视化"与"Infinite Wiki式AI探索"，创造一个结构化与自由探索并存的儒释道经典学习平台。

### 核心理念
**"有根的发散"** - 技能树提供结构化学习骨架，Wiki模式提供无限探索自由度

### 目标用户
- 对传统文化感兴趣的现代学习者
- 希望系统化学习经典的初学者
- 追求深度探索的文化爱好者

---

## 产品愿景

### MVP核心体验闭环

```
用户进入 → 看到技能树全景（45个概念节点）
    ↓
点击节点"仁" → 节点点亮 + 展示经典原文和AI释义
    ↓
查看推荐节点 → [义] [礼] [忠] (继续点亮技能树)
    ↓
点击释义中的词汇"尊重" → 切换到Wiki探索模式
    ↓
无限探索或返回 → 回到技能树主线继续学习
```

### 产品差异化

| 特性 | 传统学习应用 | 本产品 |
|------|------------|--------|
| **学习路径** | 线性课程 | 可视化技能树 + 自由探索 |
| **内容生成** | 静态内容 | AI动态生成释义 |
| **知识关联** | 章节目录 | 知识图谱关系 |
| **成长反馈** | 进度条 | 游戏化节点点亮 |

---

## 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                   前端层 (Presentation)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 技能树画布    │  │ 内容展示面板  │  │ 进度追踪面板  │  │
│  │SkillTreeView │  │ContentPanel  │  │ProgressPanel │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                          ↓                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │        状态管理层 (State Management)             │   │
│  │  Zustand (全局) + React Query (服务端)          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  服务层 (Service Layer)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │知识图谱服务  │  │  AI 服务     │  │  用户服务    │     │
│  │GraphService │  │ AIService   │  │UserService  │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   数据层 (Data Layer)                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │知识图谱    │  │ 向量索引   │  │用户数据库   │        │
│  │  (JSON)    │  │(Embedding) │  │(LocalDB)   │        │
│  └────────────┘  └────────────┘  └────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 架构模式

**Clean Architecture + Feature-Sliced Design (FSD)**

```
/src
├── app/                 # 应用初始化、路由、全局配置
├── pages/               # 页面组件
├── widgets/             # 复合业务组件（技能树、内容面板）
├── features/            # 用户功能（节点点击、推荐、进度）
├── entities/            # 业务实体（Node、Concept、Scripture）
├── shared/              # 共享基础（UI组件、工具、API客户端）
└── services/            # 业务服务（AI、图谱、用户）
```

### 组件层次结构

```typescript
App (根组件)
├─ LayoutManager (布局控制)
│   ├─ SkillTreeCanvas (技能树画布 - 新增)
│   │   ├─ GraphVisualization (React Flow 图形渲染)
│   │   ├─ NodeTooltip (节点悬停提示)
│   │   └─ MiniMap (缩略导航)
│   │
│   ├─ ContentPanel (内容面板 - 双模式)
│   │   ├─ NodeDetailView (节点详情模式 - 新增)
│   │   │   ├─ ClassicTextDisplay (经典原文)
│   │   │   ├─ AIInterpretation (AI释义)
│   │   │   └─ RecommendedNodes (推荐节点)
│   │   │
│   │   └─ WikiExploreView (Wiki探索模式 - 复用)
│   │       ├─ ContentDisplay (可点击文本)
│   │       └─ LoadingSkeleton (流式加载)
│   │
│   └─ SidePanel (侧边栏)
│       ├─ SearchBar (搜索 - 复用)
│       ├─ ProgressTracker (进度追踪 - 新增)
│       └─ HistoryBreadcrumb (浏览路径 - 新增)
│
└─ StateProvider (状态管理)
```

---

## 技术选型

### 前端技术栈

| 类别 | 技术选型 | 版本 | 选择理由 |
|------|---------|------|---------|
| **框架** | Vite + React | 6.x + 19.x | 快速构建、已有基础 |
| **语言** | TypeScript | 5.8+ | 类型安全、开发体验 |
| **状态管理** | Zustand | 4.x | 轻量级、易于集成 |
| **服务端状态** | React Query | 5.x | 自动缓存、错误处理 |
| **图形可视化** | React Flow | 11.x | React友好、高性能 |
| **辅助可视化** | D3.js | 7.x | 力导向布局、动画 |
| **动画** | Framer Motion | 11.x | 流畅交互动画 |
| **AI服务** | @google/genai | 1.7+ | 已验证稳定方案 |

### 数据存储方案

#### MVP阶段（简化）
```json
{
  "知识图谱": "静态JSON文件（45节点）",
  "向量检索": "预计算embedding存JSON",
  "用户进度": "LocalStorage",
  "内容缓存": "IndexedDB"
}
```

#### V2演进方案
```yaml
图数据库: Neo4j / Amazon Neptune
向量数据库: Pinecone / Weaviate / Qdrant
关系数据库: PostgreSQL
缓存层: Redis
```

### API设计

**推荐方案**: GraphQL (主) + REST (辅) + SSE (实时)

```graphql
# GraphQL - 数据查询
type Query {
  node(id: ID!): Node
  recommendations(nodeId: ID!, limit: Int): [Recommendation]
  userProgress: Progress
}

type Node {
  id: ID!
  name: String!
  category: Category!
  originalText: String!
  reference: String!
  interpretation: String
  relations: [NodeRelation!]!
}

type Recommendation {
  node: Node!
  score: Float!
  reason: String!
}
```

```typescript
// REST - 命令操作
POST /api/v1/progress/mark-complete
POST /api/v1/ai/generate-explanation
GET  /api/v1/export/learning-path

// SSE - 流式推送
GET  /api/v1/ai/stream/:topic
```

---

## 数据模型

### 知识图谱数据结构

```json
{
  "metadata": {
    "version": "1.0",
    "classics": ["论语", "道德经", "心经"],
    "totalNodes": 45,
    "lastUpdated": "2025-10-04"
  },
  "nodes": [
    {
      "id": "ren-仁",
      "label": "仁",
      "category": "儒家",
      "classic": "论语",
      "originalText": "仁者爱人",
      "reference": "论语·颜渊",
      "interpretation": "仁的核心是对他人的关爱和尊重...",
      "embedding": [0.123, -0.456, ...],
      "position": { "x": 100, "y": 200 },
      "layer": 1,
      "unlocked": false
    }
  ],
  "edges": [
    {
      "source": "ren-仁",
      "target": "yi-义",
      "relationship": "相辅相成",
      "weight": 0.9,
      "description": "仁义相辅，共同构成儒家道德核心"
    }
  ],
  "recommendations": {
    "ren-仁": ["yi-义", "li-礼", "zhong-忠"]
  }
}
```

### 状态管理数据结构

```typescript
interface AppState {
  // 技能树状态
  skillTree: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    unlocked: Set<string>;
    currentNode: string | null;
  };

  // 内容展示状态
  content: {
    mode: 'node-detail' | 'wiki-explore';
    nodeData: NodeContent | null;
    wikiTopic: string | null;
    streamingText: string;
    isLoading: boolean;
  };

  // 用户交互状态
  user: {
    history: NavigationHistory[];
    preferences: UserPreferences;
  };

  // 推荐系统状态
  recommendations: {
    structuredNodes: string[];
    semanticTopics: string[];
  };
}
```

### 用户数据模型

```typescript
interface UserProgress {
  userId: string;
  unlockedNodes: string[];
  learningPath: {
    nodeId: string;
    timestamp: number;
    mode: 'skill-tree' | 'wiki';
  }[];
  achievements: {
    id: string;
    name: string;
    unlockedAt: number;
  }[];
  statistics: {
    totalNodesUnlocked: number;
    totalWikiExplorations: number;
    longestStreak: number;
    lastActiveDate: string;
  };
}
```

---

## 核心功能模块

### 1. 技能树可视化模块

**职责**: 渲染交互式知识图谱

**技术实现**:
```typescript
// 使用 React Flow
import ForceGraph2D from 'react-flow-renderer';

<ForceGraph2D
  nodes={skillTreeData.nodes.map(n => ({
    id: n.id,
    data: { label: n.label },
    position: n.position,
    style: {
      background: unlockedNodes.has(n.id) ? '#d4af37' : '#cccccc'
    }
  }))}
  edges={skillTreeData.edges}
  onNodeClick={handleNodeClick}
  onNodeHover={handleNodeHover}
/>
```

**关键特性**:
- 力导向自动布局
- 节点点击/悬停交互
- 点亮动画效果
- 缩放/拖拽支持

---

### 2. 双模式内容展示模块

**模式A: 节点详情视图**
```
┌──────────────────────────────┐
│ 📜 原文: "仁者爱人"           │
│ 📖 出处: 论语·颜渊            │
│ ─────────────────────────────│
│ 🤖 AI释义:                   │
│ 仁的核心是对他人的关爱和尊重， │
│ 体现在日常行为中...           │
│ [释义中每个词汇可点击]         │
│ ─────────────────────────────│
│ 🔗 延伸推荐:                 │
│ [义] [礼] [忠]               │
└──────────────────────────────┘
```

**模式B: Wiki探索视图**
```
┌──────────────────────────────┐
│ 🌀 "尊重" 的定义              │
│ ─────────────────────────────│
│ [AI流式生成内容...]           │
│ 尊重是指认可他人的价值和权利， │
│ 体现为平等对待...             │
│ [每个词汇可继续点击探索]       │
└──────────────────────────────┘
```

**模式切换逻辑**:
```typescript
const handleWordClick = (word: string) => {
  if (content.mode === 'node-detail') {
    // 在节点释义中点击词汇 → 切换到Wiki模式
    setContent({
      mode: 'wiki-explore',
      wikiTopic: word
    });
  } else {
    // 在Wiki模式中继续点击 → 跳转到新词汇
    setContent({
      ...content,
      wikiTopic: word
    });
  }
};
```

---

### 3. AI服务模块

**双轨AI策略**:

```typescript
// 轨道1: 结构化内容生成（节点释义）
async function generateNodeInterpretation(
  nodeId: string,
  context: string[]
): Promise<string> {
  const node = getNodeById(nodeId);
  const prompt = `
    基于以下经典原文，生成简洁的现代释义（2-3句话）。
    考虑用户已学习的概念：${context.join(', ')}

    原文："${node.originalText}"
    出处：${node.reference}
  `;

  return await aiService.generate(prompt);
}

// 轨道2: 开放式内容生成（Wiki探索）
async function* streamWikiDefinition(
  topic: string
): AsyncGenerator<string> {
  const prompt = `
    提供"${topic}"的简明定义（单段落）。
    信息准确、语言通俗、不使用markdown格式。
  `;

  for await (const chunk of aiService.generateStream(prompt)) {
    yield chunk;
  }
}
```

**AI服务抽象层**:
```typescript
// 接口定义（避免供应商锁定）
interface LLMProvider {
  generate(prompt: string): Promise<string>;
  generateStream(prompt: string): AsyncGenerator<string>;
  generateEmbedding(text: string): Promise<number[]>;
}

// 实现适配器
class GeminiAdapter implements LLMProvider {
  private client: GoogleGenAI;

  async generate(prompt: string): Promise<string> {
    const response = await this.client.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
    });
    return response.text;
  }

  async *generateStream(prompt: string): AsyncGenerator<string> {
    const response = await this.client.models.generateContentStream({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
    });
    for await (const chunk of response) {
      yield chunk.text;
    }
  }
}

// 工厂模式
class AIServiceFactory {
  static create(provider: 'gemini' | 'openai' | 'claude'): LLMProvider {
    switch (provider) {
      case 'gemini': return new GeminiAdapter();
      case 'openai': return new OpenAIAdapter();
      case 'claude': return new ClaudeAdapter();
    }
  }
}
```

---

### 4. 推荐系统模块

**三层推荐机制**:

```typescript
class RecommendationEngine {
  // 层级1: 基于预设图谱的直接关联
  getGraphBasedRecommendations(nodeId: string): string[] {
    return graphData.edges
      .filter(e => e.source === nodeId)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map(e => e.target);
  }

  // 层级2: 基于向量的语义相似
  getSemanticSimilarNodes(nodeId: string, topK: number = 5): string[] {
    const targetVec = nodeEmbeddings.get(nodeId);
    const similarities = Array.from(nodeEmbeddings.entries())
      .filter(([id]) => id !== nodeId)
      .map(([id, vec]) => ({
        id,
        score: cosineSimilarity(targetVec, vec)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return similarities.map(s => s.id);
  }

  // 层级3: 基于用户行为的协同过滤（V2）
  getPersonalizedRecommendations(
    nodeId: string,
    userHistory: string[]
  ): string[] {
    // 分析用户学习路径，推荐下一个可能感兴趣的节点
    // TODO: 实现协同过滤算法
  }

  // 综合推荐（MVP使用）
  getRecommendations(nodeId: string): Recommendation[] {
    const graphBased = this.getGraphBasedRecommendations(nodeId);
    const semantic = this.getSemanticSimilarNodes(nodeId, 3);

    // 合并去重，优先直接关联
    const combined = [
      ...graphBased.map(id => ({ id, reason: '相关概念', score: 1.0 })),
      ...semantic
        .filter(id => !graphBased.includes(id))
        .map(id => ({ id, reason: '语义相近', score: 0.8 }))
    ];

    return combined.slice(0, 3);
  }
}
```

**向量相似度计算**:
```typescript
// 余弦相似度
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// 性能优化：使用Web Worker处理大量计算
const worker = new Worker('./semantic-search.worker.ts');
worker.postMessage({ targetVec, allVecs });
worker.onmessage = (e) => {
  const recommendations = e.data;
  displayRecommendations(recommendations);
};
```

---

### 5. 进度追踪模块

**功能特性**:
- 显示已点亮节点数量（12/45）
- 可视化学习路径时间线
- 成就徽章系统
- 学习统计分析

**实现示例**:
```typescript
interface ProgressTracker {
  totalNodes: number;
  unlockedNodes: number;
  progress: number; // 0-1
  achievements: Achievement[];
  learningStreak: number;
  lastActiveDate: string;
}

// 成就系统
const achievements = [
  {
    id: 'confucian-beginner',
    name: '儒家入门',
    condition: (progress) =>
      progress.unlockedNodes.filter(n => n.category === '儒家').length >= 5,
    icon: '🎓'
  },
  {
    id: 'explorer',
    name: '探索者',
    condition: (progress) =>
      progress.wikiExplorations >= 20,
    icon: '🗺️'
  }
];
```

---

## 实施路线图

### 第一阶段：MVP基础 (Week 1-2)

**目标**: 技能树可视化 + 基础交互

**任务清单**:
- [ ] **数据准备**
  - 提取45个儒释道核心概念
  - 标注节点关系（60-80条边）
  - 编写JSON数据文件
  - （可选）生成预置释义

- [ ] **技能树组件**
  - 集成React Flow
  - 实现节点渲染
  - 实现点击/悬停事件
  - 节点状态视觉区分

- [ ] **状态管理**
  - 搭建Zustand store
  - 实现unlocked节点追踪
  - 实现currentNode切换
  - LocalStorage持久化

**验收标准**:
- ✅ 技能树正确渲染45个节点
- ✅ 点击节点改变状态和颜色
- ✅ 刷新页面保持进度

---

### 第二阶段：内容展示 (Week 3-4)

**目标**: 节点详情 + AI释义

**任务清单**:
- [ ] **NodeDetailView组件**
  - 经典原文展示
  - AI释义流式显示
  - 推荐节点列表

- [ ] **AI服务扩展**
  - 封装节点释义生成prompt
  - 实现IndexedDB缓存
  - 添加失败降级方案

- [ ] **布局开发**
  - 左右双栏布局
  - 面板展开/收起动画
  - 响应式适配

**验收标准**:
- ✅ 点击节点展开内容面板
- ✅ 正确显示原文和释义
- ✅ 释义生成失败时显示预置内容

---

### 第三阶段：推荐与探索 (Week 5-6)

**目标**: 推荐系统 + Wiki模式

**任务清单**:
- [ ] **推荐引擎**
  - 图谱关联推荐
  - 向量相似度计算
  - 推荐节点UI展示

- [ ] **Wiki探索模式**
  - 复用ContentDisplay组件
  - 词汇点击事件处理
  - 模式切换逻辑

- [ ] **浏览历史**
  - 历史栈实现
  - 面包屑导航
  - 前进/后退功能

**验收标准**:
- ✅ 显示3个推荐节点
- ✅ 点击推荐可跳转
- ✅ 词汇点击切换到Wiki模式
- ✅ 可返回技能树

---

### 第四阶段：体验优化 (Week 7-8)

**目标**: 动画、搜索、性能

**任务清单**:
- [ ] **进度追踪面板**
  - 显示节点统计
  - 学习路径时间线
  - 成就徽章系统

- [ ] **动画优化**
  - 节点点亮动画（Framer Motion）
  - 面板切换过渡
  - 推荐节点高亮

- [ ] **搜索功能**
  - 搜索节点名称
  - 高亮定位
  - 搜索经典原文

- [ ] **性能优化**
  - 图形渲染优化
  - 缓存策略完善
  - 首屏加载优化

**验收标准**:
- ✅ 进度统计准确
- ✅ 动画流畅（60fps）
- ✅ 搜索功能正常
- ✅ 首屏加载 < 3秒

---

### V2演进方向 (Month 3+)

**数据层升级**:
- 迁移到Neo4j图数据库
- 引入Pinecone向量数据库
- 扩展更多经典（庄子、金刚经等）

**AI能力增强**:
- 个性化释义生成
- AI生成学习路径
- 对话式问答功能

**社交功能**:
- 分享个人技能树
- 查看他人学习路径
- 协作标注讨论

**沉浸式体验**:
- 语音朗读原文
- 背景音乐主题
- VR/AR技能树

---

## 技术决策记录

### ADR-001: 选择React Flow作为可视化方案

**状态**: 已接受
**日期**: 2025-10-04

**背景**:
需要选择技能树可视化库，核心需求：
- 支持自定义节点样式
- 高性能（500+节点）
- React生态集成友好

**决策**:
选择React Flow + D3.js混合方案

**理由**:
- React Flow提供开箱即用的交互能力
- D3.js补充高级可视化和力导向布局
- 社区活跃，长期维护有保障
- 性能测试表现优秀

**后果**:
- ✅ 优势: 开发效率高、可定制性强、文档完善
- ⚠️ 劣势: 需要学习两个库的API
- 🔴 风险: 大规模数据需要额外优化（Canvas降级）

**替代方案**:
- D3.js纯实现：定制能力最强，但开发成本高
- Cytoscape.js：适合生物信息学，风格不匹配
- react-force-graph：更轻量，但定制能力不足

---

### ADR-002: MVP使用静态JSON存储知识图谱

**状态**: 已接受
**日期**: 2025-10-04

**背景**:
需要决定MVP阶段的数据存储方案

**决策**:
使用静态JSON文件 + 前端图算法

**理由**:
- 无需后端服务，降低初期复杂度
- 支持离线使用
- 部署简单（Vercel静态托管）
- 45个节点规模完全够用

**演进路径**:
```
MVP: 静态JSON
  ↓ 节点>100 或 需要动态更新
V2: Neo4j图数据库
  ↓ 需要复杂图查询 或 多租户
V3: 分布式图数据库
```

**后果**:
- ✅ 快速迭代验证
- ⚠️ 数据更新需要重新部署
- 🔴 后期迁移需要数据导出工具

---

### ADR-003: 使用Zustand + React Query混合状态管理

**状态**: 已接受
**日期**: 2025-10-04

**背景**:
需要选择状态管理方案

**决策**:
- Zustand: 全局UI状态、用户进度
- React Query: 服务端状态、AI响应
- Local State: 组件内部UI状态

**理由**:
- Zustand轻量级（<1KB），学习曲线平缓
- React Query自动处理缓存、重试、错误
- 避免Redux的样板代码
- 符合"关注点分离"原则

**后果**:
- ✅ 代码简洁、易于维护
- ✅ 开发体验优秀（DevTools支持）
- ⚠️ 需要学习两个库的API

**替代方案**:
- Redux Toolkit: 过度工程化，不适合MVP
- Context API: 性能问题，不适合频繁更新
- Jotai/Recoil: 原子化状态，学习成本高

---

### ADR-004: AI服务使用抽象层隔离

**状态**: 已接受
**日期**: 2025-10-04

**背景**:
当前直接依赖Google Gemini API，存在供应商锁定风险

**决策**:
创建LLMProvider接口抽象层

**理由**:
- 支持多供应商切换（成本优化）
- 降级策略（主服务不可用时切换）
- 测试友好（Mock Provider）
- 未来可能需要混合使用多个模型

**实现**:
```typescript
interface LLMProvider {
  generate(prompt: string): Promise<string>;
  generateStream(prompt: string): AsyncGenerator<string>;
  generateEmbedding(text: string): Promise<number[]>;
}
```

**后果**:
- ✅ 灵活性高、可测试性强
- ⚠️ 增加一层抽象（轻微性能损耗）
- ✅ 长期收益大于短期成本

---

## 风险管理

### 技术风险

| 风险 | 影响 | 概率 | 缓解策略 | 负责人 |
|------|------|------|----------|--------|
| **AI API成本失控** | 🔴 HIGH | 🟠 MEDIUM | 1. 请求去重<br>2. 结果缓存（Redis）<br>3. 用量监控告警<br>4. 降级到离线模型 | Backend Lead |
| **大规模图谱性能瓶颈** | 🔴 HIGH | 🟡 LOW | 1. 增量加载<br>2. WebGL渲染<br>3. 服务端预计算<br>4. 虚拟化滚动 | Frontend Lead |
| **向量数据库迁移复杂** | 🟠 MEDIUM | 🟠 MEDIUM | 1. 抽象层隔离<br>2. 数据导出工具<br>3. 双写策略过渡 | Data Engineer |
| **第三方服务不可用** | 🟠 MEDIUM | 🟡 LOW | 1. 多供应商策略<br>2. 降级方案<br>3. 离线模式 | DevOps |
| **中文字体渲染问题** | 🟡 LOW | 🟠 MEDIUM | 1. 使用Noto Sans SC<br>2. Canvas自定义渲染<br>3. SVG降级方案 | Frontend Dev |

### 产品风险

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|----------|
| **双模式切换不自然** | 🔴 HIGH | 🟠 MEDIUM | 1. 用户测试验证<br>2. 渐进式引导<br>3. 可关闭Wiki模式 |
| **技能树节点数量不合理** | 🟠 MEDIUM | 🟠 MEDIUM | 1. AB测试不同规模<br>2. 可配置层级展开<br>3. 用户反馈迭代 |
| **AI生成内容质量不稳定** | 🟠 MEDIUM | 🟠 MEDIUM | 1. Prompt工程优化<br>2. 预生成内容兜底<br>3. 用户反馈机制 |

### 架构风险

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| **过度工程化** | 🟠 MEDIUM | MVP优先，增量演进，避免预先设计 |
| **状态管理混乱** | 🔴 HIGH | 单向数据流，状态提升原则，DevTools监控 |
| **技术栈碎片化** | 🟠 MEDIUM | 技术雷达评审，统一选型，定期技术债清理 |
| **文档滞后** | 🟡 LOW | ADR强制记录，API自动生成，代码注释规范 |

---

## 性能指标

### 前端性能目标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| **首屏加载时间** | < 3s | Lighthouse CI |
| **FCP (首次内容绘制)** | < 1.8s | Web Vitals |
| **LCP (最大内容绘制)** | < 2.5s | Web Vitals |
| **FID (首次输入延迟)** | < 100ms | Web Vitals |
| **CLS (累积布局偏移)** | < 0.1 | Web Vitals |
| **交互响应时间** | < 100ms | Performance API |
| **技能树渲染帧率** | ≥ 60fps | Chrome DevTools |

### 后端性能目标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| **API响应时间 (P95)** | < 200ms | APM工具 |
| **AI生成首字节时间** | < 500ms | 自定义监控 |
| **数据库查询时间** | < 50ms | 慢查询日志 |
| **缓存命中率** | > 80% | Redis监控 |

### 业务指标

| 指标 | 目标值 | 测量方式 |
|------|--------|---------|
| **用户平均点亮节点数** | ≥ 10个/会话 | Analytics |
| **Wiki探索深度** | ≥ 3层/节点 | 浏览历史分析 |
| **推荐点击率** | ≥ 30% | A/B测试 |
| **7日留存率** | ≥ 40% | Cohort分析 |
| **平均会话时长** | ≥ 8分钟 | Analytics |

---

## 安全考虑

### 前端安全

- **XSS防护**:
  - 使用React的自动转义
  - DOMPurify净化用户输入
  - CSP (Content Security Policy)

- **数据泄露**:
  - 不在前端存储敏感数据
  - LocalStorage加密存储
  - HTTPS强制传输

### API安全

- **认证授权**:
  - JWT token认证
  - RBAC权限控制
  - API限流（Rate Limiting）

- **输入验证**:
  - GraphQL Query深度限制
  - 参数类型校验
  - SQL注入防护

### AI服务安全

- **Prompt注入防护**:
  - 输入过滤
  - Prompt模板隔离
  - 输出内容审查

- **成本控制**:
  - 请求频率限制
  - Token用量监控
  - 异常告警

---

## 监控与可观测性

### 日志策略

```typescript
// 分级日志
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

// 结构化日志
logger.info('Node unlocked', {
  userId: 'user123',
  nodeId: 'ren-仁',
  timestamp: Date.now(),
  context: 'skill-tree'
});
```

### 错误追踪

```typescript
// Sentry集成
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay()
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### 性能监控

```typescript
// Web Vitals
import { onCLS, onFID, onLCP } from 'web-vitals';

onCLS(metric => analytics.track('CLS', metric.value));
onFID(metric => analytics.track('FID', metric.value));
onLCP(metric => analytics.track('LCP', metric.value));
```

### 用户行为分析

```typescript
// 关键事件追踪
analytics.track('Node Clicked', {
  nodeId: 'ren-仁',
  category: '儒家',
  fromRecommendation: true
});

analytics.track('Mode Switched', {
  from: 'node-detail',
  to: 'wiki-explore',
  trigger: 'word-click'
});
```

---

## 测试策略

### 测试金字塔

```
         E2E Tests (10%)
        ┌─────────────┐
        │ Playwright  │ ← 关键用户路径
        └─────────────┘
              ↑
    Integration Tests (30%)
   ┌────────────────────────┐
   │ React Testing Library  │ ← 组件集成
   └────────────────────────┘
              ↑
      Unit Tests (60%)
┌───────────────────────────────┐
│ Vitest                        │ ← 纯函数、Hook
└───────────────────────────────┘
```

### 关键测试场景

```typescript
// 单元测试 - 推荐算法
describe('RecommendationEngine', () => {
  test('基于向量相似度推荐', () => {
    const recommendations = engine.getSemanticSimilarNodes('ren-仁');
    expect(recommendations).toHaveLength(5);
    expect(recommendations[0]).toBe('yi-义');
  });
});

// 集成测试 - 数据流
test('点击节点 → AI推荐 → 更新进度', async () => {
  render(<SkillTree />);
  await userEvent.click(screen.getByText('仁'));
  expect(await screen.findByText('推荐：义、礼')).toBeInTheDocument();
  expect(getProgress().unlockedNodes).toContain('ren-仁');
});

// E2E测试 - 完整路径
test('学习路径：浏览 → 点亮 → Wiki探索 → 返回', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-node="ren-仁"]');
  await expect(page.locator('.progress')).toHaveText('1/45');
  await page.click('text=尊重');
  await expect(page.locator('.mode-indicator')).toHaveText('Wiki探索');
  await page.click('button:has-text("返回技能树")');
  await expect(page.locator('.current-node')).toHaveText('仁');
});
```

---

## 部署架构

### MVP部署方案

```
前端: Vercel (静态托管 + Edge Functions)
  ├─ 自动CI/CD (GitHub集成)
  ├─ 全球CDN加速
  └─ 预览环境（PR预览）

数据:
  ├─ JSON文件（随前端部署）
  └─ AI缓存（Vercel KV / Upstash Redis）

监控:
  ├─ Vercel Analytics
  ├─ Sentry错误追踪
  └─ Mixpanel用户行为
```

### V2部署方案

```
┌──────────────────────────────────────┐
│         CDN (Cloudflare)             │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│    Frontend (Vercel / Netlify)       │
└────────────┬─────────────────────────┘
             ↓
┌──────────────────────────────────────┐
│    API Gateway (Kong / AWS ALB)      │
└────────────┬─────────────────────────┘
             ↓
┌─────────────────────────────────────────────┐
│              Microservices                  │
│  ┌────────────┐  ┌────────────┐            │
│  │ Knowledge  │  │    AI      │            │
│  │  Service   │  │  Service   │            │
│  └────────────┘  └────────────┘            │
│  ┌────────────┐  ┌────────────┐            │
│  │   User     │  │ Analytics  │            │
│  │  Service   │  │  Service   │            │
│  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────┘
             ↓
┌─────────────────────────────────────────────┐
│            Data Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Neo4j   │  │ Pinecone │  │PostgreSQL│  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
```

---

## 开发规范

### 代码风格

```typescript
// ESLint + Prettier配置
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off"
  }
}
```

### 命名约定

```typescript
// 组件: PascalCase
const SkillTreeCanvas = () => { ... };

// 函数/变量: camelCase
const handleNodeClick = () => { ... };
const userProgress = { ... };

// 常量: UPPER_SNAKE_CASE
const MAX_RECOMMENDATIONS = 3;
const API_BASE_URL = 'https://api.example.com';

// 类型/接口: PascalCase
interface NodeData { ... }
type RecommendationEngine = { ... };

// 文件名:
// - 组件: PascalCase.tsx
// - 工具函数: camelCase.ts
// - Hook: use*.ts
```

### Git提交规范

```
type(scope): subject

[optional body]

[optional footer]

类型:
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式调整
- refactor: 重构
- perf: 性能优化
- test: 测试相关
- chore: 构建/工具更新

示例:
feat(skill-tree): 添加节点点亮动画
fix(ai-service): 修复流式响应中断问题
docs(architecture): 更新架构设计文档
```

---

## 附录

### A. 数据示例

**完整节点数据示例**:
```json
{
  "id": "ren-仁",
  "label": "仁",
  "category": "儒家",
  "classic": "论语",
  "chapter": "颜渊",
  "originalText": "仁者爱人",
  "fullQuote": "樊迟问仁。子曰：'爱人。'",
  "reference": "论语·颜渊·第二十二章",
  "interpretation": "仁的核心是对他人的关爱和尊重，体现在日常行为中。它不是抽象的概念，而是具体的实践——在与他人的互动中展现出善意、理解和同理心。",
  "embedding": [0.023, -0.145, 0.067, ...], // 1536维向量
  "position": { "x": 100, "y": 200 },
  "layer": 1,
  "unlocked": false,
  "metadata": {
    "difficulty": "beginner",
    "tags": ["道德", "人际关系", "核心价值"],
    "relatedConcepts": ["yi-义", "li-礼", "zhong-忠"],
    "modernRelevance": "现代社会的同理心和社会责任"
  }
}
```

### B. API示例

**GraphQL查询示例**:
```graphql
query GetNodeWithRecommendations {
  node(id: "ren-仁") {
    id
    name
    category
    originalText
    reference
    interpretation

    relations {
      type
      target {
        id
        name
      }
    }

    recommendations(limit: 3) {
      score
      reason
      node {
        id
        name
        category
      }
    }
  }

  userProgress {
    unlockedNodes
    totalNodes
    progress
  }
}
```

### C. 环境配置

**.env.example**:
```bash
# AI服务
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_AI_PROVIDER=gemini # gemini | openai | claude

# 分析服务
VITE_MIXPANEL_TOKEN=your_mixpanel_token
VITE_SENTRY_DSN=your_sentry_dsn

# 功能开关
VITE_ENABLE_WIKI_MODE=true
VITE_ENABLE_ACHIEVEMENTS=true
VITE_MAX_RECOMMENDATIONS=3

# 性能配置
VITE_CACHE_TTL=3600
VITE_MAX_HISTORY_LENGTH=50
```

### D. 参考资源

**技术文档**:
- React Flow: https://reactflow.dev/
- Zustand: https://zustand-demo.pmnd.rs/
- React Query: https://tanstack.com/query/latest
- Gemini API: https://ai.google.dev/

**设计参考**:
- 技能树UI: Civilization系列、Path of Exile
- 知识图谱: Obsidian、Roam Research
- AI交互: ChatGPT、Claude

**开发工具**:
- Vite: https://vitejs.dev/
- TypeScript: https://www.typescriptlang.org/
- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/

---

## 文档变更历史

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|---------|
| 1.0 | 2025-10-04 | Architecture Team | 初始版本 |

---

**文档所有者**: 技术架构团队
**审核者**: 产品经理、技术负责人
**下次审核日期**: 2025-11-04
