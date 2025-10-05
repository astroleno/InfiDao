# InfiDao 架构设计澄清文档

**文档版本**: v1.0
**创建日期**: 2025-10-04
**关联文档**: ARCHITECTURE.md
**文档目的**: 澄清原架构文档中模糊、不清晰或缺乏实施细节的部分

---

## 📋 文档说明

本文档针对 `ARCHITECTURE.md` 中识别出的以下关键模糊点，提供详细的澄清和实施指南：

1. ✅ 数据准备阶段的具体细节
2. ✅ 技能树与Wiki模式切换逻辑
3. ✅ AI服务成本控制机制
4. ✅ 性能优化具体方案
5. ✅ 错误处理和降级策略
6. ✅ 测试策略实施计划
7. ✅ 部署和运维配置

---

## 1️⃣ 数据准备阶段的具体细节

### 问题诊断

**原架构文档中的模糊点**：
- ❓ 45个概念的选择标准是什么？
- ❓ 如何确定节点的层级关系？
- ❓ 节点位置坐标如何生成？
- ❓ 如何确保三个学派（儒释道）的均衡性？

---

### 澄清方案

#### 1.1 概念选择标准

**多维度评分体系**：

```typescript
interface ConceptSelectionCriteria {
  // 维度1：经典重要性（1-5分）
  classicImportance: {
    score: number;
    criteria: {
      mentionFrequency: number;    // 在经典中出现频率
      scholarConsensus: boolean;   // 学者是否普遍认可为核心概念
      historicalImpact: number;    // 历史影响力
    };
  };

  // 维度2：现代相关性（1-5分）
  modernRelevance: {
    score: number;
    criteria: {
      dailyApplication: number;    // 日常生活应用频率
      academicLinks: number;       // 与现代学科的关联度
      culturalPresence: number;    // 在当代文化中的活跃度
      problemSolving: number;      // 解决当代问题的能力
    };
  };

  // 维度3：教学适宜性（1-5分）
  pedagogicalValue: {
    score: number;
    criteria: {
      accessibility: number;       // 理解门槛（越低越好）
      networkValue: number;        // 与其他概念的连接度
      progressionFit: number;      // 在学习路径中的位置合理性
    };
  };

  // 维度4：学派均衡性（加权项）
  balanceWeight: number;           // 优先选择未饱和学派的概念
}
```

**选择流程**：

```
第一步：候选池生成
  → 儒家：从《论语》《孟子》《大学》提取20个候选概念
  → 道家：从《道德经》《庄子》提取20个候选概念
  → 佛家：从《心经》《金刚经》《坛经》提取20个候选概念
  → 总计：60个候选概念

第二步：多维度评分
  → 每个概念由3位专家独立评分
  → 计算加权总分：
    总分 = 经典重要性×0.4 + 现代相关性×0.3 + 教学适宜性×0.2 + 学派均衡性×0.1

第三步：分层筛选
  Layer 1（核心概念，15个）：
    → 每学派选择总分Top 5
    → 必须是该学派的"门面概念"（如仁、道、空）

  Layer 2（延伸概念，20个）：
    → 每学派选择总分排名6-12
    → 需要与Layer 1概念有明确关联

  Layer 3（细分概念，10个）：
    → 填补知识图谱的空白
    → 优先选择跨学派桥接概念

第四步：人工调整
  → 检查学派分布：确保15-15-15的均衡
  → 检查难度分布：确保beginner:elementary:intermediate = 5:5:5（每学派）
  → 检查性别代表性：避免全是"父权"概念（如增加"慈母"相关）
  → 检查现代多元性：确保涵盖心理、职场、家庭、社交等场景
```

**最终输出文档**：

```markdown
# 概念选择结果清单

## 儒家（15个）

### Layer 1 - 核心概念（5个）
1. **仁** - 总分4.8 - 儒家思想核心
2. **义** - 总分4.6 - 行为准则
3. **礼** - 总分4.5 - 社会规范
4. **智** - 总分4.3 - 明辨是非
5. **信** - 总分4.2 - 诚信品质

### Layer 2 - 延伸概念（7个）
6. **忠** - 总分4.0 - 尽心尽力
7. **孝** - 总分4.0 - 尊敬父母
...

### Layer 3 - 细分概念（3个）
...

[附：每个概念的详细评分表]
```

---

#### 1.2 节点层级关系确定

**关系类型定义**：

```typescript
enum RelationType {
  // 类型1：逻辑关系
  PREREQUISITE = 'prerequisite',    // A是理解B的前提（仁→义）
  DERIVED = 'derived',              // B从A派生（道→无为）
  PARALLEL = 'parallel',            // A与B并列（仁义礼智信）
  OPPOSITE = 'opposite',            // A与B对立统一（有为↔无为）

  // 类型2：结构关系
  PART_OF = 'part_of',              // A是B的组成部分（戒→三学）
  CONTAINS = 'contains',            // A包含B（五常→仁）

  // 类型3：功能关系
  IMPLEMENTS = 'implements',        // B是实践A的方法（仁→恕）
  SUPPORTS = 'supports',            // B支持A的实现（礼→仁）

  // 类型4：跨学派关系
  SIMILAR = 'similar',              // 跨学派的相似概念（仁≈慈悲）
  CONTRASTS = 'contrasts',          // 跨学派的对比（无为vs积极入世）
}

interface ConceptRelation {
  source: string;
  target: string;
  type: RelationType;
  weight: number;                   // 0.1-1.0，关系强度
  bidirectional: boolean;           // 是否双向
  evidenceText: string;             // 经典依据（原文引用）
  description: string;              // 关系说明
}
```

**关系标注流程**：

```
步骤1：自动关系推断（辅助）
  工具：基于embedding的相似度计算
  输出：候选关系列表（相似度>0.7的节点对）

步骤2：人工关系标注（核心）
  方法：
    - 3位专家独立标注每对概念的关系
    - 要求提供经典原文依据
    - 标注关系类型和强度权重

  示例标注卡片：
    ┌─────────────────────────────────┐
    │ 关系标注：仁 → 义                │
    ├─────────────────────────────────┤
    │ 关系类型：[prerequisite ▼]       │
    │ 权重：[====······] 0.8          │
    │ 双向：[✓] 是 [ ] 否              │
    │                                 │
    │ 经典依据：                       │
    │ "仁者爱人，义者宜也。仁义并行，  │
    │  而天下治。" - 孟子·告子上       │
    │                                 │
    │ 关系说明：                       │
    │ [文本框：义是仁的外在表现...]    │
    │                                 │
    │ [保存] [跳过] [需讨论]          │
    └─────────────────────────────────┘

步骤3：关系一致性检查
  自动检查：
    ✓ 是否存在循环依赖（A→B→C→A）
    ✓ 是否存在孤立节点（无任何关系）
    ✓ prerequisite关系是否符合层级（Layer 1→Layer 2）
    ✓ 权重分布是否合理（避免全是1.0）

  人工审核：
    → 召开专家组会议解决标注冲突
    → 讨论"需讨论"标记的关系
    → 最终投票确定争议关系

步骤4：跨学派关系特别标注
  重点：
    - 跨学派关系必须有学术支持（引用对比研究论文）
    - 避免简单化的"等同"（如仁=慈悲，实际有差异）
    - 标注差异点，而非只标注相似点

  示例：
    仁（儒）← similar →慈悲（佛）
    权重：0.7
    说明："仁偏重人伦关系（爱有差等），
           慈悲强调无差别的众生平等。
           相似点：同为爱他精神。
           差异点：对象范围和实践方式。"
    参考：方立天《中国佛教与传统文化》
```

**输出关系图谱**：

```json
{
  "relations": [
    {
      "id": "rel_001",
      "source": "ren-仁",
      "target": "yi-义",
      "type": "prerequisite",
      "weight": 0.8,
      "bidirectional": false,
      "evidenceText": "仁者爱人，义者宜也。仁义并行，而天下治。",
      "evidenceSource": "孟子·告子上",
      "description": "仁是内在的道德情感，义是仁的外在行为准则。理解仁是理解义的前提。",
      "validator": "张教授",
      "validatedAt": "2025-09-15"
    },
    // ... 更多关系
  ]
}
```

---

#### 1.3 节点位置坐标生成

**问题**：原文档未说明节点位置的 `{ x: 100, y: 200 }` 如何生成。

**澄清**：采用**算法生成 + 人工微调**的混合方案。

**方案A：力导向布局算法（推荐用于初始布局）**

```typescript
// 使用 d3-force 算法
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force';

interface NodePosition {
  id: string;
  x: number;
  y: number;
  vx?: number; // 速度（算法用）
  vy?: number;
}

function generateInitialLayout(
  nodes: GraphNode[],
  edges: GraphEdge[]
): NodePosition[] {
  // 配置力导向参数
  const simulation = forceSimulation(nodes)
    .force('link', forceLink(edges)
      .id(d => d.id)
      .distance(d => {
        // 根据关系权重动态调整节点距离
        // 权重越大，距离越近
        return 100 * (1 / d.weight);
      })
    )
    .force('charge', forceManyBody()
      .strength(-300) // 节点间排斥力
    )
    .force('center', forceCenter(400, 300)) // 画布中心
    .force('collision', forceCollide(30)); // 防止节点重叠

  // 运行模拟（300次迭代）
  simulation.tick(300);

  // 提取最终位置
  return nodes.map(node => ({
    id: node.id,
    x: Math.round(node.x),
    y: Math.round(node.y)
  }));
}
```

**方案B：分层环形布局（推荐用于展示层级）**

```typescript
function generateLayeredLayout(
  nodes: GraphNode[],
  layers: { [layer: number]: string[] }
): NodePosition[] {
  const positions: NodePosition[] = [];
  const centerX = 400;
  const centerY = 300;

  // Layer 1: 核心概念（内圈）
  const layer1Radius = 150;
  const layer1Nodes = layers[1];
  layer1Nodes.forEach((nodeId, index) => {
    const angle = (2 * Math.PI / layer1Nodes.length) * index;
    positions.push({
      id: nodeId,
      x: centerX + layer1Radius * Math.cos(angle),
      y: centerY + layer1Radius * Math.sin(angle)
    });
  });

  // Layer 2: 延伸概念（中圈）
  const layer2Radius = 280;
  const layer2Nodes = layers[2];
  layer2Nodes.forEach((nodeId, index) => {
    const angle = (2 * Math.PI / layer2Nodes.length) * index;
    positions.push({
      id: nodeId,
      x: centerX + layer2Radius * Math.cos(angle),
      y: centerY + layer2Radius * Math.sin(angle)
    });
  });

  // Layer 3: 细分概念（外圈）
  const layer3Radius = 400;
  const layer3Nodes = layers[3];
  layer3Nodes.forEach((nodeId, index) => {
    const angle = (2 * Math.PI / layer3Nodes.length) * index;
    positions.push({
      id: nodeId,
      x: centerX + layer3Radius * Math.cos(angle),
      y: centerY + layer3Radius * Math.sin(angle)
    });
  });

  return positions;
}
```

**方案C：学派分区布局（推荐用于强调分类）**

```typescript
function generateSchoolBasedLayout(
  nodes: GraphNode[]
): NodePosition[] {
  const positions: NodePosition[] = [];
  const canvasWidth = 800;
  const canvasHeight = 600;

  // 三个学派分别占据画布的三个区域
  const regions = {
    '儒家': { centerX: canvasWidth * 0.25, centerY: canvasHeight * 0.5, radius: 150 },
    '道家': { centerX: canvasWidth * 0.75, centerY: canvasHeight * 0.5, radius: 150 },
    '佛家': { centerX: canvasWidth * 0.5, centerY: canvasHeight * 0.8, radius: 150 }
  };

  // 按学派分组节点
  const nodesBySchool = groupBy(nodes, n => n.category);

  Object.entries(nodesBySchool).forEach(([school, schoolNodes]) => {
    const region = regions[school];
    schoolNodes.forEach((node, index) => {
      const angle = (2 * Math.PI / schoolNodes.length) * index;
      positions.push({
        id: node.id,
        x: region.centerX + region.radius * Math.cos(angle),
        y: region.centerY + region.radius * Math.sin(angle)
      });
    });
  });

  return positions;
}
```

**人工微调工具（关键步骤）**：

```
工具需求：
  - 可视化编辑器（基于React Flow）
  - 拖拽调整节点位置
  - 实时显示节点间距离
  - 检查节点重叠（自动提示）
  - 支持撤销/重做
  - 导出最终JSON

微调原则：
  ✓ 相关概念靠近（视觉暗示关系）
  ✓ 避免边交叉（减少视觉混乱）
  ✓ 核心概念居中（视觉焦点）
  ✓ 学派分区清晰（可选，取决于布局方案）
  ✓ 留白合理（密度适中）

工作流：
  1. 算法生成初始布局
  2. 产品经理+设计师微调（2-3小时）
  3. 用户测试（5人试用，记录寻找节点的时间）
  4. 根据反馈二次调整
  5. 锁定最终版本
```

**最终数据格式**：

```json
{
  "layout": {
    "algorithm": "force-directed",
    "version": "1.0",
    "canvasSize": { "width": 800, "height": 600 },
    "lastModified": "2025-09-20",
    "positions": [
      {
        "id": "ren-仁",
        "x": 400,
        "y": 300,
        "layer": 1,
        "manuallyAdjusted": true,
        "note": "核心节点，居中放置"
      },
      // ... 其他节点
    ]
  }
}
```

---

#### 1.4 概念覆盖的均衡性保证

**多维度均衡检查清单**：

```typescript
interface BalanceMetrics {
  // 1. 学派数量均衡
  schoolBalance: {
    confucian: number;  // 目标：15个
    taoist: number;     // 目标：15个
    buddhist: number;   // 目标：15个
    deviation: number;  // 标准差，应<2
  };

  // 2. 难度分布均衡
  difficultyBalance: {
    beginner: number;       // 目标：15个（每学派5个）
    elementary: number;     // 目标：18个（每学派6个）
    intermediate: number;   // 目标：9个（每学派3个）
    advanced: number;       // 目标：3个（每学派1个）
  };

  // 3. 现代相关性均衡
  relevanceBalance: {
    highRelevance: number;    // 日常应用度4-5分
    mediumRelevance: number;  // 日常应用度2-3分
    lowRelevance: number;     // 日常应用度1分
    targetRatio: string;      // "6:3:1"
  };

  // 4. 主题场景覆盖
  scenarioCoverage: {
    psychology: number;    // 心理健康相关
    workplace: number;     // 职场应用相关
    family: number;        // 家庭关系相关
    social: number;        // 社交场景相关
    philosophy: number;    // 哲学思辨相关
    minPerCategory: 3;     // 每个场景至少3个概念
  };

  // 5. 性别视角均衡
  genderBalance: {
    masculine: number;     // 偏男性视角的概念（如君子）
    feminine: number;      // 偏女性视角的概念（如慈母）
    neutral: number;       // 性别中立的概念
    targetRatio: string;   // "4:1:5"（避免全男性视角）
  };
}
```

**自动化检查脚本**：

```typescript
function validateBalance(nodes: GraphNode[]): ValidationReport {
  const report: ValidationReport = {
    passed: true,
    warnings: [],
    errors: []
  };

  // 检查1：学派均衡
  const schoolCounts = countBy(nodes, n => n.category);
  if (Math.abs(schoolCounts['儒家'] - 15) > 2) {
    report.errors.push('儒家概念数量偏离目标值>2');
    report.passed = false;
  }
  // ... 同理检查道家、佛家

  // 检查2：难度分布
  const difficultyCounts = countBy(nodes, n => n.metadata.difficulty);
  if (difficultyCounts['beginner'] < 12) {
    report.warnings.push('入门级概念过少，可能对新手不友好');
  }

  // 检查3：场景覆盖
  const scenarioCounts = {};
  nodes.forEach(node => {
    node.metadata.scenarios?.forEach(scenario => {
      scenarioCounts[scenario] = (scenarioCounts[scenario] || 0) + 1;
    });
  });
  Object.entries(scenarioCounts).forEach(([scenario, count]) => {
    if (count < 3) {
      report.warnings.push(`场景"${scenario}"覆盖不足（仅${count}个）`);
    }
  });

  return report;
}
```

**人工审核会议议程**：

```markdown
# 概念均衡性审核会议

**时间**：2小时
**参与者**：产品经理、内容负责人、3位学科专家

## 议程

1. **数据呈现**（15分钟）
   - 展示自动化检查报告
   - 可视化学派分布、难度分布、场景覆盖

2. **问题讨论**（45分钟）
   - 针对每个warning/error讨论解决方案
   - 是否需要替换某些概念？
   - 是否需要调整某些概念的分类？

3. **跨学派关联审查**（30分钟）
   - 是否有足够的"桥接节点"？
   - 用户能否自然地从一个学派探索到另一个学派？

4. **用户视角模拟**（20分钟）
   - 模拟3类用户的学习路径：
     * 完全新手（从哪个节点开始？）
     * 有基础的学习者（能否找到进阶内容？）
     * 跨学派探索者（能否发现关联？）

5. **最终决策**（10分钟）
   - 投票确认概念清单
   - 或安排二轮筛选
```

---

## 2️⃣ 技能树与Wiki模式切换逻辑澄清

### 问题诊断

**原架构文档的模糊点**：
- ❓ 用户如何知道当前处于哪种模式？
- ❓ 切换时的视觉反馈是什么？
- ❓ 历史记录如何处理？
- ❓ 返回机制的具体实现？

---

### 澄清方案

#### 2.1 模式识别设计（让用户清楚当前模式）

**视觉差异化策略**：

| 设计元素 | 节点详情模式 | Wiki探索模式 |
|---------|------------|-------------|
| **背景色** | 暖色调（#FFF9E6） | 冷色调（#E6F3FF） |
| **左侧边框** | 金色（#D4AF37，4px） | 蓝色（#4A90E2，4px） |
| **图标标识** | 📜（经典文本） | 🌀（探索） |
| **标题栏文案** | "节点详情：仁" | "Wiki探索：尊重" |
| **面包屑** | 技能树 > 仁 | 技能树 > 仁 > 尊重 > 同理心 |
| **返回按钮** | 不显示（已在技能树）| "← 返回技能树"显示 |

**模式指示器组件**：

```tsx
// 顶部模式指示条
<ModeIndicator mode={currentMode}>
  {currentMode === 'node-detail' ? (
    <>
      <Icon>📜</Icon>
      <Label>节点详情</Label>
      <Subtitle>结构化学习</Subtitle>
    </>
  ) : (
    <>
      <Icon>🌀</Icon>
      <Label>Wiki探索</Label>
      <Subtitle>自由探索模式</Subtitle>
    </>
  )}
</ModeIndicator>
```

**第一次进入Wiki模式时的引导**：

```tsx
// 首次切换到Wiki模式时显示气泡提示
{isFirstWikiMode && (
  <Tooltip>
    <Icon>💡</Icon>
    <Text>
      你已进入Wiki探索模式！
      点击任意词汇继续深入探索，
      或点击"返回技能树"回到主线学习。
    </Text>
    <Button onClick={dismissTip}>知道了</Button>
  </Tooltip>
)}
```

---

#### 2.2 切换动画时序详解

**节点详情 → Wiki探索的完整动画时序**：

```
T=0.0s  用户点击释义中的词汇"尊重"
  ↓
T=0.0s  词汇高亮闪烁（0.2秒，黄色背景闪3次）

T=0.2s  内容面板开始切换动画
  └─ 阶段1：当前内容向左淡出（0.3秒）
     · 透明度: 1 → 0
     · 位移: translateX(0) → translateX(-20px)

T=0.5s  模式指示器切换
  └─ 背景色过渡（0.4秒）
     · 暖色调 → 冷色调
     · 左侧边框：金色 → 蓝色
  └─ 图标翻转动画
     · 📜 旋转退出 → 🌀 旋转进入

T=0.5s  面包屑更新
  └─ 新层级从右侧滑入
     · "尊重" 层级淡入
     · 箭头">"动画出现

T=0.6s  阶段2：新内容从右侧淡入（0.4秒）
  └─ Wiki内容开始流式加载
     · 透明度: 0 → 1
     · 位移: translateX(20px) → translateX(0)

T=0.7s  返回按钮淡入（0.2秒）
  └─ "← 返回技能树" 从左上角滑入

T=1.0s  所有动画完成，进入稳定状态
  └─ Wiki内容继续流式加载（AI生成中）
```

**代码实现（使用Framer Motion）**：

```tsx
<AnimatePresence mode="wait">
  {content.mode === 'node-detail' ? (
    <motion.div
      key="node-detail"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1] // cubic-bezier缓动
      }}
      style={{
        background: 'linear-gradient(to bottom, #FFF9E6, #ffffff)',
        borderLeft: '4px solid #D4AF37'
      }}
    >
      <NodeDetailView {...props} />
    </motion.div>
  ) : (
    <motion.div
      key="wiki-explore"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{
        duration: 0.4,
        ease: [0.4, 0, 0.2, 1]
      }}
      style={{
        background: 'linear-gradient(to bottom, #E6F3FF, #ffffff)',
        borderLeft: '4px solid #4A90E2'
      }}
    >
      <WikiExploreView {...props} />
    </motion.div>
  )}
</AnimatePresence>
```

---

#### 2.3 历史记录栈实现

**数据结构设计**：

```typescript
interface NavigationHistory {
  id: string;                    // 唯一ID
  type: 'skill-tree' | 'wiki';   // 类型
  timestamp: number;              // Unix时间戳

  // 节点详情模式的数据
  nodeData?: {
    nodeId: string;
    nodeName: string;
    category: string;
  };

  // Wiki探索模式的数据
  wikiData?: {
    topic: string;
    fromNode?: string;            // 从哪个节点进入Wiki的（用于返回）
    depth: number;                // Wiki探索深度
  };

  // 滚动位置（用于恢复现场）
  scrollPosition?: number;
}

interface NavigationState {
  history: NavigationHistory[];   // 历史栈
  currentIndex: number;           // 当前位置指针
  maxHistoryLength: number;       // 最大历史长度（50）
}
```

**核心操作实现**：

```typescript
class NavigationManager {
  private state: NavigationState;

  // 添加新记录
  push(entry: NavigationHistory): void {
    // 如果当前不在栈顶，删除前进历史
    if (this.state.currentIndex < this.state.history.length - 1) {
      this.state.history = this.state.history.slice(0, this.state.currentIndex + 1);
    }

    // 添加新记录
    this.state.history.push(entry);
    this.state.currentIndex++;

    // 限制栈大小（FIFO删除最老的）
    if (this.state.history.length > this.state.maxHistoryLength) {
      this.state.history.shift();
      this.state.currentIndex--;
    }

    // 持久化到LocalStorage
    this.persist();
  }

  // 后退
  goBack(): NavigationHistory | null {
    if (this.canGoBack()) {
      this.state.currentIndex--;
      const entry = this.state.history[this.state.currentIndex];
      this.restoreState(entry);
      return entry;
    }
    return null;
  }

  // 前进
  goForward(): NavigationHistory | null {
    if (this.canGoForward()) {
      this.state.currentIndex++;
      const entry = this.state.history[this.state.currentIndex];
      this.restoreState(entry);
      return entry;
    }
    return null;
  }

  // 返回技能树（清空Wiki历史）
  backToSkillTree(): NavigationHistory | null {
    // 从当前位置向后查找最近的skill-tree类型
    for (let i = this.state.currentIndex - 1; i >= 0; i--) {
      if (this.state.history[i].type === 'skill-tree') {
        this.state.currentIndex = i;
        const entry = this.state.history[i];
        this.restoreState(entry);

        // 删除后续的Wiki历史（可选）
        // this.state.history = this.state.history.slice(0, i + 1);

        return entry;
      }
    }
    return null;
  }

  // 恢复状态
  private restoreState(entry: NavigationHistory): void {
    if (entry.type === 'skill-tree') {
      // 切换到节点详情模式
      setContentMode('node-detail');
      setCurrentNode(entry.nodeData.nodeId);

      // 恢复滚动位置
      if (entry.scrollPosition) {
        window.scrollTo(0, entry.scrollPosition);
      }
    } else {
      // 切换到Wiki探索模式
      setContentMode('wiki-explore');
      setWikiTopic(entry.wikiData.topic);
    }
  }

  // 持久化
  private persist(): void {
    localStorage.setItem('navigation_history', JSON.stringify(this.state));
  }

  // 从LocalStorage加载
  static load(): NavigationManager {
    const stored = localStorage.getItem('navigation_history');
    if (stored) {
      const state = JSON.parse(stored);
      return new NavigationManager(state);
    }
    return new NavigationManager();
  }
}
```

**使用示例**：

```typescript
// 点击节点时
navigationManager.push({
  id: generateId(),
  type: 'skill-tree',
  timestamp: Date.now(),
  nodeData: {
    nodeId: 'ren-仁',
    nodeName: '仁',
    category: '儒家'
  },
  scrollPosition: window.scrollY
});

// 点击释义词汇时
navigationManager.push({
  id: generateId(),
  type: 'wiki',
  timestamp: Date.now(),
  wikiData: {
    topic: '尊重',
    fromNode: 'ren-仁',
    depth: 1
  }
});

// 点击"返回技能树"按钮时
navigationManager.backToSkillTree();
```

---

#### 2.4 面包屑导航详细规范

**显示规则**：

```typescript
interface BreadcrumbItem {
  label: string;
  type: 'home' | 'node' | 'wiki';
  onClick: () => void;
  active: boolean;
}

function generateBreadcrumbs(history: NavigationHistory[]): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [];

  // 始终显示"技能树"首页
  breadcrumbs.push({
    label: '技能树',
    type: 'home',
    onClick: () => navigateToHome(),
    active: false
  });

  // 添加当前路径的所有层级
  const relevantHistory = history.slice(Math.max(0, history.length - 5));
  relevantHistory.forEach((entry, index) => {
    if (entry.type === 'skill-tree') {
      breadcrumbs.push({
        label: entry.nodeData.nodeName,
        type: 'node',
        onClick: () => navigateToNode(entry.nodeData.nodeId),
        active: index === relevantHistory.length - 1
      });
    } else {
      breadcrumbs.push({
        label: entry.wikiData.topic,
        type: 'wiki',
        onClick: () => navigateToWiki(entry.wikiData.topic),
        active: index === relevantHistory.length - 1
      });
    }
  });

  return breadcrumbs;
}
```

**视觉实现**：

```tsx
<Breadcrumb>
  {breadcrumbs.map((item, index) => (
    <React.Fragment key={item.label}>
      <BreadcrumbItem
        active={item.active}
        onClick={item.onClick}
        style={{
          color: item.active ? '#2c3e50' : '#7f8c8d',
          fontWeight: item.active ? 600 : 400,
          cursor: item.active ? 'default' : 'pointer',
          textDecoration: item.active ? 'none' : 'underline'
        }}
      >
        {item.label}
      </BreadcrumbItem>
      {index < breadcrumbs.length - 1 && (
        <Separator>›</Separator>
      )}
    </React.Fragment>
  ))}
</Breadcrumb>
```

---

## 3️⃣ AI服务成本控制机制澄清

### 问题诊断

**原架构文档的模糊点**：
- ❓ 请求去重的具体算法？
- ❓ 缓存失效策略的精确规则？
- ❓ 降级方案的触发阈值？
- ❓ 成本预警和限流机制？

---

### 澄清方案

#### 3.1 多层缓存策略

**三层缓存架构**：

```
L1: React Query（内存缓存）
  ├─ TTL: 5分钟
  ├─ 容量: 无限制（内存允许范围内）
  ├─ 用途: 同一会话内的快速访问
  └─ 淘汰策略: LRU

L2: IndexedDB（本地持久化）
  ├─ TTL: 24小时
  ├─ 容量: 50MB（约1000条释义）
  ├─ 用途: 跨会话缓存，离线支持
  └─ 淘汰策略: LRU + 时间过期

L3: 预生成静态内容（JSON文件）
  ├─ TTL: 永久（随版本更新）
  ├─ 容量: 所有45个节点的释义
  ├─ 用途: AI失败时的降级方案
  └─ 淘汰策略: 无（静态内容）
```

**缓存键（Cache Key）设计**：

```typescript
function generateCacheKey(params: {
  type: 'node-interpretation' | 'wiki-definition';
  nodeId?: string;
  wikiTopic?: string;
  userContext?: string[];
}): string {
  if (params.type === 'node-interpretation') {
    // 节点释义缓存键：nodeId + 用户已点亮节点（影响个性化）
    const contextHash = params.userContext
      ? hashArray(params.userContext)
      : 'default';
    return `node:${params.nodeId}:${contextHash}`;
  } else {
    // Wiki定义缓存键：topic（不考虑用户上下文）
    return `wiki:${params.wikiTopic}`;
  }
}

// 示例
generateCacheKey({
  type: 'node-interpretation',
  nodeId: 'ren-仁',
  userContext: ['yi-义', 'li-礼']
});
// 输出: "node:ren-仁:a3f2d8"
```

**缓存读取瀑布流**：

```typescript
async function getNodeInterpretation(nodeId: string): Promise<string> {
  const cacheKey = generateCacheKey({ type: 'node-interpretation', nodeId });

  // L1: React Query（内存）
  const l1Cache = queryClient.getQueryData(cacheKey);
  if (l1Cache) {
    console.log('✅ L1 Cache Hit');
    return l1Cache;
  }

  // L2: IndexedDB（本地持久化）
  const l2Cache = await idbCache.get(cacheKey);
  if (l2Cache && !isCacheExpired(l2Cache)) {
    console.log('✅ L2 Cache Hit');
    // 回写到L1
    queryClient.setQueryData(cacheKey, l2Cache.content);
    return l2Cache.content;
  }

  // L3: 预生成内容（静态JSON）
  const l3Cache = staticData.nodes.find(n => n.id === nodeId)?.interpretation;
  if (l3Cache) {
    console.log('✅ L3 Cache Hit (Static Content)');
    // 回写到L1和L2
    queryClient.setQueryData(cacheKey, l3Cache);
    await idbCache.set(cacheKey, { content: l3Cache, timestamp: Date.now() });
    return l3Cache;
  }

  // Cache Miss：调用AI生成
  console.log('❌ Cache Miss, calling AI API');
  try {
    const generated = await aiService.generateInterpretation(nodeId);

    // 写入所有缓存层
    queryClient.setQueryData(cacheKey, generated);
    await idbCache.set(cacheKey, { content: generated, timestamp: Date.now() });

    return generated;
  } catch (error) {
    console.error('AI生成失败，使用L3兜底');
    return l3Cache || '暂无释义';
  }
}
```

---

#### 3.2 请求去重机制

**问题场景**：
用户快速点击多个节点，或网络延迟导致重复请求同一内容。

**解决方案：请求合并（Request Deduplication）**

```typescript
class AIRequestDeduplicator {
  private pendingRequests: Map<string, Promise<string>> = new Map();

  async request(key: string, fetcher: () => Promise<string>): Promise<string> {
    // 如果已有相同请求在进行中，直接返回该Promise
    if (this.pendingRequests.has(key)) {
      console.log(`⚡ 请求合并: ${key}`);
      return this.pendingRequests.get(key)!;
    }

    // 创建新请求
    const promise = fetcher()
      .finally(() => {
        // 请求完成后清理
        this.pendingRequests.delete(key);
      });

    // 记录到进行中的请求
    this.pendingRequests.set(key, promise);

    return promise;
  }
}

// 使用示例
const deduplicator = new AIRequestDeduplicator();

async function generateInterpretation(nodeId: string): Promise<string> {
  return deduplicator.request(
    `interpretation:${nodeId}`,
    () => aiService.generateInterpretation(nodeId)
  );
}
```

**效果**：
```
用户操作：快速点击节点A、B、A、A

传统方式：发送4次请求（浪费）
  Request 1: nodeA → 正在生成...
  Request 2: nodeB → 正在生成...
  Request 3: nodeA → 正在生成...（重复！）
  Request 4: nodeA → 正在生成...（重复！）

去重后：仅发送2次请求
  Request 1: nodeA → 正在生成...
  Request 2: nodeB → 正在生成...
  Request 3: nodeA → ⚡ 等待Request 1完成
  Request 4: nodeA → ⚡ 等待Request 1完成
```

---

#### 3.3 成本监控与限流

**用量追踪数据结构**：

```typescript
interface UsageMetrics {
  userId: string;
  date: string;  // YYYY-MM-DD

  // 请求统计
  requests: {
    nodeInterpretations: number;
    wikiDefinitions: number;
    embeddings: number;
  };

  // Token统计
  tokens: {
    input: number;
    output: number;
    total: number;
  };

  // 成本估算
  cost: {
    amount: number;  // 美元
    currency: 'USD';
  };

  // 缓存命中率
  cacheHitRate: {
    l1: number;  // 0-1
    l2: number;
    l3: number;
    overall: number;
  };
}
```

**限流策略（Rate Limiting）**：

```typescript
interface RateLimitConfig {
  // 每用户每日限额
  maxRequestsPerDay: number;     // 100次
  maxTokensPerDay: number;       // 50,000 tokens
  maxCostPerDay: number;         // $0.50

  // 每用户每小时限额（防止短时爆发）
  maxRequestsPerHour: number;    // 20次

  // 突发容量（允许短期超限）
  burstCapacity: number;         // 5次
}

class RateLimiter {
  async checkLimit(userId: string): Promise<RateLimitResult> {
    const usage = await getUsageMetrics(userId, today());

    // 检查日限额
    if (usage.requests.total >= config.maxRequestsPerDay) {
      return {
        allowed: false,
        reason: 'daily_quota_exceeded',
        retryAfter: getSecondsUntilMidnight(),
        message: '今日AI生成额度已用尽，明日0点重置'
      };
    }

    // 检查成本限额
    if (usage.cost.amount >= config.maxCostPerDay) {
      return {
        allowed: false,
        reason: 'cost_limit_exceeded',
        message: '今日成本已达上限'
      };
    }

    // 检查小时限额（滑动窗口）
    const hourUsage = await getUsageInLastHour(userId);
    if (hourUsage >= config.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: 'hourly_rate_exceeded',
        retryAfter: 3600,
        message: '请求过于频繁，请稍后再试'
      };
    }

    return { allowed: true };
  }

  async recordUsage(userId: string, tokens: number, cost: number): Promise<void> {
    // 更新使用量统计
    await updateUsageMetrics(userId, {
      requests: +1,
      tokens: tokens,
      cost: cost
    });
  }
}
```

**用户侧显示**：

```tsx
// 在设置页面显示用量
<UsagePanel>
  <UsageBar>
    <Label>今日AI生成次数</Label>
    <Progress value={usage.requests.total} max={100} />
    <Text>{usage.requests.total} / 100</Text>
  </UsageBar>

  <UsageBar>
    <Label>缓存命中率</Label>
    <Text>{(usage.cacheHitRate.overall * 100).toFixed(1)}%</Text>
    <Hint>命中率越高，生成越快且不消耗额度</Hint>
  </UsageBar>

  <ResetInfo>
    额度将在 {getSecondsUntilMidnight() / 3600} 小时后重置
  </ResetInfo>
</UsagePanel>
```

---

#### 3.4 降级方案详解

**四级降级策略**：

```typescript
enum FallbackLevel {
  NONE = 0,           // 无降级，正常AI生成
  CACHE_ONLY = 1,     // 仅使用缓存，不调用AI
  STATIC_ONLY = 2,    // 仅使用预生成内容
  MINIMAL = 3,        // 最小化内容（仅显示原文）
  OFFLINE = 4,        // 完全离线模式
}

class FallbackManager {
  getCurrentLevel(): FallbackLevel {
    // 判断降级条件
    if (isOffline()) return FallbackLevel.OFFLINE;
    if (isUserQuotaExceeded()) return FallbackLevel.CACHE_ONLY;
    if (isAIServiceDown()) return FallbackLevel.STATIC_ONLY;
    if (isHighLatency()) return FallbackLevel.CACHE_ONLY;
    return FallbackLevel.NONE;
  }

  async getContent(nodeId: string): Promise<ContentResult> {
    const level = this.getCurrentLevel();

    switch (level) {
      case FallbackLevel.NONE:
        // 正常流程：尝试AI生成
        try {
          return await generateWithAI(nodeId);
        } catch (error) {
          // AI失败，自动降级到下一级
          return this.getContent(nodeId); // 递归降级
        }

      case FallbackLevel.CACHE_ONLY:
        // 仅从缓存读取
        const cached = await getFromCache(nodeId);
        if (cached) {
          return {
            content: cached,
            source: 'cache',
            warning: '今日额度已用尽，显示缓存内容'
          };
        }
        // 缓存未命中，继续降级
        return this.getContent(nodeId);

      case FallbackLevel.STATIC_ONLY:
        // 使用预生成内容
        const static = getStaticContent(nodeId);
        return {
          content: static,
          source: 'static',
          warning: 'AI服务暂时不可用，显示预置内容'
        };

      case FallbackLevel.MINIMAL:
        // 最小化内容
        const minimal = getOriginalText(nodeId);
        return {
          content: minimal,
          source: 'minimal',
          error: '内容加载失败，仅显示经典原文'
        };

      case FallbackLevel.OFFLINE:
        // 离线模式
        return {
          content: null,
          source: 'offline',
          error: '当前处于离线状态，请连接网络后重试'
        };
    }
  }
}
```

**降级提示UI**：

```tsx
{contentResult.warning && (
  <WarningBanner severity="warning">
    <Icon>⚠️</Icon>
    <Message>{contentResult.warning}</Message>
    <Action onClick={retryWithAI}>重新生成</Action>
  </WarningBanner>
)}

{contentResult.source === 'static' && (
  <SourceBadge>
    <Icon>📄</Icon>
    <Text>预置内容</Text>
  </SourceBadge>
)}
```

---

## 4️⃣ 性能优化具体方案

### 问题诊断

**原架构文档的模糊点**：
- ❓ 45个节点 vs 500个节点的渲染策略差异？
- ❓ 向量计算的性能瓶颈？
- ❓ Web Worker的具体使用场景？
- ❓ 首屏加载的关键路径？

---

### 澄清方案

#### 4.1 图形渲染性能优化

**分级渲染策略**：

```typescript
interface RenderStrategy {
  nodeCount: number;
  method: 'svg' | 'canvas' | 'webgl';
  features: {
    labels: 'always' | 'hover' | 'none';
    edges: 'all' | 'selected' | 'none';
    animations: boolean;
  };
}

function selectRenderStrategy(nodeCount: number): RenderStrategy {
  if (nodeCount <= 50) {
    // MVP范围：高质量SVG渲染
    return {
      nodeCount,
      method: 'svg',
      features: {
        labels: 'always',
        edges: 'all',
        animations: true
      }
    };
  } else if (nodeCount <= 200) {
    // 中等规模：SVG + 部分优化
    return {
      nodeCount,
      method: 'svg',
      features: {
        labels: 'hover',
        edges: 'all',
        animations: true
      }
    };
  } else if (nodeCount <= 1000) {
    // 大规模：Canvas渲染
    return {
      nodeCount,
      method: 'canvas',
      features: {
        labels: 'hover',
        edges: 'selected',  // 只显示选中节点的边
        animations: false
      }
    };
  } else {
    // 超大规模：WebGL + 极致优化
    return {
      nodeCount,
      method: 'webgl',
      features: {
        labels: 'none',
        edges: 'none',
        animations: false
      }
    };
  }
}
```

**React Flow性能配置（MVP阶段）**：

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}

  // 性能优化配置
  fitView
  fitViewOptions={{ padding: 0.2 }}
  minZoom={0.5}
  maxZoom={2}

  // 仅渲染可见区域（重要！）
  onlyRenderVisibleElements={true}

  // 防止意外拖拽
  nodesDraggable={false}

  // 连接线优化
  edgesUpdatable={false}
  edgesFocusable={false}

  // 性能监控
  onInit={(instance) => {
    console.log('React Flow initialized');
    measureRenderPerformance();
  }}
/>
```

**性能基准测试**：

```typescript
// 测试场景
const performanceTests = [
  { nodeCount: 45, expectedFPS: 60, maxLoadTime: 500 },
  { nodeCount: 100, expectedFPS: 55, maxLoadTime: 1000 },
  { nodeCount: 500, expectedFPS: 45, maxLoadTime: 3000 },
];

async function runPerformanceTest(test: PerformanceTest) {
  const startTime = performance.now();

  // 渲染技能树
  render(<SkillTree nodes={generateNodes(test.nodeCount)} />);

  const loadTime = performance.now() - startTime;

  // 测量FPS
  const fps = await measureFPS(duration: 3000);

  // 断言
  expect(loadTime).toBeLessThan(test.maxLoadTime);
  expect(fps).toBeGreaterThan(test.expectedFPS);
}
```

---

#### 4.2 向量计算性能优化

**问题分析**：
- 45个节点 × 1536维embedding = 69,120个数值
- 计算相似度：O(n²) 复杂度 = 45×44 = 1,980次计算
- 每次计算：1536次乘法 + 1536次加法 + 开方

**优化方案1：预计算（推荐用于MVP）**

```typescript
// 构建时预计算所有节点对的相似度
interface PrecomputedSimilarities {
  [nodeId: string]: {
    nodeId: string;
    score: number;
  }[];
}

// 生成脚本（Node.js）
async function precomputeAllSimilarities() {
  const nodes = await loadNodes();
  const similarities: PrecomputedSimilarities = {};

  for (const node of nodes) {
    const nodeEmbedding = await getEmbedding(node.id);
    const scores = [];

    for (const otherNode of nodes) {
      if (node.id === otherNode.id) continue;

      const otherEmbedding = await getEmbedding(otherNode.id);
      const score = cosineSimilarity(nodeEmbedding, otherEmbedding);

      if (score > 0.5) {  // 过滤低相关性
        scores.push({ nodeId: otherNode.id, score });
      }
    }

    // 排序并保留Top 10
    similarities[node.id] = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  // 保存为静态JSON
  fs.writeFileSync(
    'data/similarities.json',
    JSON.stringify(similarities, null, 2)
  );
}

// 前端使用
function getRecommendations(nodeId: string): string[] {
  const similarities = require('./data/similarities.json');
  return similarities[nodeId].slice(0, 3).map(s => s.nodeId);
}
```

**优化方案2：Web Worker（用于实时计算）**

```typescript
// similarity-worker.ts
self.onmessage = (e: MessageEvent) => {
  const { targetEmbedding, allEmbeddings } = e.data;

  const results = allEmbeddings.map(({ id, embedding }) => ({
    id,
    score: cosineSimilarity(targetEmbedding, embedding)
  }));

  // 排序并返回Top 10
  const topResults = results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  self.postMessage(topResults);
};

// 主线程使用
const worker = new Worker(new URL('./similarity-worker.ts', import.meta.url));

async function calculateSimilarities(nodeId: string): Promise<Recommendation[]> {
  return new Promise((resolve) => {
    worker.postMessage({
      targetEmbedding: embeddings[nodeId],
      allEmbeddings: embeddings
    });

    worker.onmessage = (e) => {
      resolve(e.data);
    };
  });
}
```

**优化方案3：WASM加速（高级优化，V2）**

```rust
// similarity.rs（Rust）
#[wasm_bindgen]
pub fn cosine_similarity(vec_a: &[f32], vec_b: &[f32]) -> f32 {
    let dot_product: f32 = vec_a.iter()
        .zip(vec_b.iter())
        .map(|(a, b)| a * b)
        .sum();

    let magnitude_a: f32 = vec_a.iter().map(|a| a * a).sum::<f32>().sqrt();
    let magnitude_b: f32 = vec_b.iter().map(|b| b * b).sum::<f32>().sqrt();

    dot_product / (magnitude_a * magnitude_b)
}

// TypeScript调用
import init, { cosine_similarity } from './similarity_wasm';

await init();
const score = cosine_similarity(embeddingA, embeddingB);
```

---

#### 4.3 首屏加载优化

**关键渲染路径分析**：

```
用户访问 → HTML加载 → JS解析 → 数据获取 → React渲染 → 首屏显示
  100ms      200ms     300ms      500ms      200ms      = 1300ms
```

**优化策略**：

**1. 代码分割（Code Splitting）**

```typescript
// 路由级分割
const SkillTreePage = lazy(() => import('./pages/SkillTree'));
const WikiPage = lazy(() => import('./pages/Wiki'));
const ProgressPage = lazy(() => import('./pages/Progress'));

// 组件级分割（大型可视化组件）
const ReactFlowRenderer = lazy(() => import('react-flow-renderer'));

// 使用Suspense包裹
<Suspense fallback={<LoadingSkeleton />}>
  <SkillTreePage />
</Suspense>
```

**2. 数据预加载（Preloading）**

```html
<!-- index.html -->
<head>
  <!-- 预加载关键数据 -->
  <link rel="preload" href="/data/nodes.json" as="fetch" crossorigin>
  <link rel="preload" href="/data/edges.json" as="fetch" crossorigin>

  <!-- 预加载关键字体 -->
  <link rel="preload" href="/fonts/NotoSansSC-Regular.woff2" as="font" type="font/woff2" crossorigin>

  <!-- DNS预解析（AI服务） -->
  <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com">
</head>
```

**3. 渐进式渲染（Progressive Rendering）**

```tsx
function SkillTree() {
  const [renderStage, setRenderStage] = useState<'skeleton' | 'basic' | 'full'>('skeleton');

  useEffect(() => {
    // 第一阶段：立即显示骨架屏
    setRenderStage('skeleton');

    // 第二阶段：显示基础图谱（无边、无标签）
    setTimeout(() => {
      setRenderStage('basic');
    }, 100);

    // 第三阶段：显示完整图谱
    setTimeout(() => {
      setRenderStage('full');
    }, 500);
  }, []);

  return (
    <>
      {renderStage === 'skeleton' && <SkillTreeSkeleton />}
      {renderStage === 'basic' && <ReactFlow nodes={nodes} edges={[]} />}
      {renderStage === 'full' && <ReactFlow nodes={nodes} edges={edges} />}
    </>
  );
}
```

**4. 资源优化**

```json
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'graph-vendor': ['react-flow-renderer', 'd3-force'],
          'ui-vendor': ['framer-motion', 'zustand']
        }
      }
    },
    // 压缩配置
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // 生产环境移除console
        drop_debugger: true
      }
    }
  },
  // 开启Gzip
  plugins: [
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz'
    })
  ]
});
```

**5. 首屏性能预算（Performance Budget）**

```typescript
const PERFORMANCE_BUDGET = {
  // Core Web Vitals
  FCP: 1800,  // First Contentful Paint < 1.8s
  LCP: 2500,  // Largest Contentful Paint < 2.5s
  FID: 100,   // First Input Delay < 100ms
  CLS: 0.1,   // Cumulative Layout Shift < 0.1

  // 自定义指标
  TTI: 3000,  // Time to Interactive < 3s
  TBT: 300,   // Total Blocking Time < 300ms

  // 资源大小
  totalJSSize: 300,   // KB
  totalCSSSize: 50,   // KB
  totalImageSize: 200 // KB
};

// CI/CD中自动检查
if (metrics.LCP > PERFORMANCE_BUDGET.LCP) {
  throw new Error('LCP超出预算！');
}
```

---

## 5️⃣ 错误处理和降级策略

### 详细错误分类

**错误类型表**：

| 错误代码 | 错误名称 | 严重级别 | 用户影响 | 降级方案 |
|---------|---------|---------|---------|---------|
| `E001` | AI生成失败 | Warning | 显示预置内容 | 使用静态JSON |
| `E002` | AI超时 | Warning | 生成时间过长 | 10秒后降级到预置 |
| `E003` | API配额超限 | Error | 今日无法生成 | 仅显示缓存内容 |
| `E004` | 网络错误 | Error | 无法连接服务 | 离线模式 |
| `E005` | 数据加载失败 | Critical | 应用无法使用 | 显示错误页 |
| `E006` | 节点不存在 | Error | 该内容不可用 | 返回上一页 |
| `E007` | LocalStorage满 | Warning | 进度可能丢失 | 提示清理 |

**错误处理流程图**：

```
错误发生
  ↓
错误捕获（try-catch / Error Boundary）
  ↓
判断错误类型
  ↓
┌─────────┬──────────┬──────────┐
│ Warning │  Error   │ Critical │
└────┬────┴────┬─────┴────┬─────┘
     ↓         ↓          ↓
   Toast    Modal    Full-Page
   提示      弹窗      错误页
     ↓         ↓          ↓
   自动降级  用户选择  应用中断
     ↓         ↓          ↓
   记录日志  记录日志  记录日志
     ↓         ↓          ↓
   上报Sentry 上报Sentry 上报Sentry
```

**完整代码示例**：

```typescript
class ErrorHandler {
  handle(error: AppError): ErrorHandlingResult {
    // 1. 记录错误
    this.logError(error);

    // 2. 上报到监控服务
    this.reportError(error);

    // 3. 根据错误类型选择处理策略
    switch (error.code) {
      case 'E001':  // AI生成失败
        return {
          userMessage: 'AI服务暂时不可用，已为您显示预置内容',
          severity: 'warning',
          action: 'fallback_to_static',
          retryable: true
        };

      case 'E002':  // AI超时
        return {
          userMessage: '生成时间较长，建议重试或查看预置内容',
          severity: 'warning',
          action: 'show_timeout_options',
          retryable: true
        };

      case 'E003':  // 配额超限
        return {
          userMessage: '今日AI生成次数已达上限，明日0点重置',
          severity: 'error',
          action: 'disable_ai_generation',
          retryable: false,
          retryAfter: getSecondsUntilMidnight()
        };

      case 'E004':  // 网络错误
        return {
          userMessage: '网络连接失败，请检查网络设置',
          severity: 'error',
          action: 'enable_offline_mode',
          retryable: true
        };

      case 'E005':  // 数据加载失败
        return {
          userMessage: '数据加载失败，请刷新页面重试',
          severity: 'critical',
          action: 'show_error_page',
          retryable: true
        };

      default:
        return {
          userMessage: '发生未知错误，请联系支持团队',
          severity: 'error',
          action: 'show_generic_error',
          retryable: false
        };
    }
  }

  private logError(error: AppError): void {
    console.error(`[${error.code}] ${error.message}`, {
      timestamp: new Date().toISOString(),
      userId: getUserId(),
      context: error.context
    });
  }

  private reportError(error: AppError): void {
    Sentry.captureException(error, {
      tags: {
        errorCode: error.code,
        severity: error.severity
      },
      extra: {
        context: error.context
      }
    });
  }
}
```

---

## 6️⃣ 测试策略详细计划

### 测试用例设计

**单元测试用例清单**：

```typescript
// 推荐引擎测试
describe('RecommendationEngine', () => {
  test('基于图谱关系推荐 - 直接关联', () => {
    const engine = new RecommendationEngine(graphData);
    const recommendations = engine.getGraphBasedRecommendations('ren-仁');

    expect(recommendations).toContain('yi-义');
    expect(recommendations).toContain('li-礼');
    expect(recommendations.length).toBeLessThanOrEqual(3);
  });

  test('基于向量相似度推荐', () => {
    const engine = new RecommendationEngine(graphData);
    const recommendations = engine.getSemanticSimilarNodes('ren-仁', 5);

    expect(recommendations).toHaveLength(5);
    expect(recommendations).not.toContain('ren-仁'); // 不推荐自己
  });

  test('混合推荐排序 - 图谱优先', () => {
    const engine = new RecommendationEngine(graphData);
    const recommendations = engine.getRecommendations('ren-仁');

    // 图谱关联的节点应该排在前面
    const firstRecommendation = recommendations[0];
    expect(firstRecommendation.reason).toBe('相关概念');
  });

  test('避免推荐已点亮节点', () => {
    const engine = new RecommendationEngine(graphData);
    const unlockedNodes = new Set(['yi-义', 'li-礼']);

    const recommendations = engine.getRecommendations('ren-仁', { unlockedNodes });

    expect(recommendations.every(r => !unlockedNodes.has(r.id))).toBe(true);
  });
});

// 余弦相似度测试
describe('cosineSimilarity', () => {
  test('相同向量相似度=1', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
  });

  test('正交向量相似度=0', () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0);
  });

  test('反向向量相似度=-1', () => {
    const vecA = [1, 2, 3];
    const vecB = [-1, -2, -3];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0);
  });
});
```

**集成测试用例清单**：

```typescript
// 用户完整交互流程
describe('用户交互流程', () => {
  test('点击节点 → AI推荐 → 更新进度', async () => {
    const { getByText, findByText } = render(<App />);

    // 1. 点击节点
    const nodeRen = getByText('仁');
    await userEvent.click(nodeRen);

    // 2. 等待内容面板展开
    expect(await findByText('仁者爱人')).toBeInTheDocument();

    // 3. 验证推荐节点显示
    expect(await findByText('推荐：义、礼')).toBeInTheDocument();

    // 4. 验证进度更新
    const progress = getProgress();
    expect(progress.unlockedNodes).toContain('ren-仁');
    expect(progress.totalUnlocked).toBe(1);
  });

  test('Wiki探索流程：节点 → 词汇 → 深度探索', async () => {
    const { getByText, findByText } = render(<App />);

    // 1. 点击节点进入详情
    await userEvent.click(getByText('仁'));

    // 2. 点击释义中的词汇
    const word = await findByText('尊重');
    await userEvent.click(word);

    // 3. 验证切换到Wiki模式
    expect(await findByText('Wiki探索')).toBeInTheDocument();
    expect(await findByText('正在生成')).toBeInTheDocument();

    // 4. 验证面包屑
    expect(await findByText('技能树 > 仁 > 尊重')).toBeInTheDocument();
  });
});
```

**E2E测试用例清单（Playwright）**：

```typescript
test('完整学习路径：浏览 → 点亮 → Wiki探索 → 返回', async ({ page }) => {
  // 1. 访问首页
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('INFINITE WIKI');

  // 2. 等待技能树加载
  await page.waitForSelector('[data-testid="skill-tree-canvas"]');

  // 3. 点击节点"仁"
  await page.click('[data-node-id="ren-仁"]');

  // 4. 验证节点点亮
  await expect(page.locator('[data-node-id="ren-仁"]')).toHaveClass(/unlocked/);

  // 5. 验证内容面板展开
  await expect(page.locator('.content-panel')).toBeVisible();
  await expect(page.locator('.classic-text')).toContainText('仁者爱人');

  // 6. 验证进度更新
  await expect(page.locator('.progress-indicator')).toContainText('1/45');

  // 7. 点击释义中的词汇
  await page.click('text=尊重');

  // 8. 验证切换到Wiki模式
  await expect(page.locator('.mode-indicator')).toContainText('Wiki探索');

  // 9. 验证流式加载
  await page.waitForSelector('.streaming-content');

  // 10. 点击返回按钮
  await page.click('button:has-text("返回技能树")');

  // 11. 验证返回到节点详情
  await expect(page.locator('.content-panel')).toBeVisible();
  await expect(page.locator('.mode-indicator')).toContainText('节点详情');
});

// 性能测试
test('首屏加载性能 < 3秒', async ({ page }) => {
  const startTime = Date.now();

  await page.goto('/');
  await page.waitForSelector('[data-testid="skill-tree-canvas"]');

  const loadTime = Date.now() - startTime;
  expect(loadTime).toBeLessThan(3000);
});

// 跨浏览器测试
test.describe('跨浏览器兼容性', () => {
  test('Chrome', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Desktop Chrome'] });
    // ... 测试用例
  });

  test('Firefox', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Desktop Firefox'] });
    // ... 测试用例
  });

  test('Safari', async ({ browser }) => {
    const context = await browser.newContext({ ...devices['Desktop Safari'] });
    // ... 测试用例
  });
});
```

---

## 7️⃣ 部署和运维配置详解

### CI/CD流程详细步骤

**GitHub Actions配置**：

```yaml
# .github/workflows/deploy.yml
name: Deploy InfiDao

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # Job 1: 代码质量检查
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run type-check

      - name: Format check
        run: npm run format:check

  # Job 2: 测试
  test:
    runs-on: ubuntu-latest
    needs: quality-check
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Unit tests
        run: npm run test:unit

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

      - name: E2E tests
        run: npx playwright test
        env:
          CI: true

  # Job 3: 构建
  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/

  # Job 4: 部署到Vercel
  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3

      - name: Download build artifacts
        uses: actions/download-artifact@v3
        with:
          name: dist
          path: dist/

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'

  # Job 5: 冒烟测试
  smoke-test:
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - uses: actions/checkout@v3

      - name: Wait for deployment
        run: sleep 30

      - name: Run smoke tests
        run: |
          curl -f https://infidao.vercel.app || exit 1
          curl -f https://infidao.vercel.app/health || exit 1
```

---

## 📊 总结

### 关键澄清成果

本文档针对原架构文档的7个主要模糊点提供了详细澄清：

1. ✅ **数据准备**：多维度评分体系、关系标注流程、布局生成算法
2. ✅ **模式切换**：视觉差异化、动画时序、历史记录栈实现
3. ✅ **成本控制**：三层缓存、请求去重、限流机制、降级策略
4. ✅ **性能优化**：分级渲染、向量计算优化、首屏加载优化
5. ✅ **错误处理**：错误分类、降级流程、用户提示规范
6. ✅ **测试策略**：完整的单元/集成/E2E测试用例
7. ✅ **部署运维**：CI/CD流程、环境配置、监控告警

### 建议优先级

**P0（必须在MVP前实现）**：
- 数据准备的概念选择和关系标注
- 基础缓存策略（L1+L3）
- 错误处理的基本降级方案
- 核心测试用例覆盖

**P1（MVP发布后1个月）**：
- 完整的三层缓存
- 成本监控和限流
- 性能优化的分级渲染
- E2E测试覆盖

**P2（V2功能）**：
- Web Worker向量计算
- WASM加速
- 高级性能优化（WebGL）
- 全量自动化测试

---

**文档所有者**: 技术架构团队
**相关文档**: ARCHITECTURE.md
**下次更新**: MVP开发完成后
