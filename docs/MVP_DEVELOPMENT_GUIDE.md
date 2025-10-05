# InfiDao MVP开发手册（更新版）

> 目标：用最小成本实现“输入一句 → 检索六经 → 双向短注 → 继续点开”的闭环
> 技术栈（MVP）：Next.js (App Router) + Route Handlers + LanceDB + @xenova/transformers(bge-m3) + GLM-4.5/Qwen/OpenAI（可切换）+ Vercel

## 1. MVP目标总览

### 核心闭环
1. **Embed**: 古籍文本 → 向量 → 存入 LanceDB（可批量）
2. **Search**: 查询 → 语义检索（支持 Hybrid）→ 返回 Top-k 段落
3. **Annotate**: 两段式注释（六经注我 / 我注六经）+ links 与 reason

### 最小可行产品
- 3 个 API 接口（/api/embed, /api/search, /api/annotate）
- 1 个前端页面（两列：输入/结果）
- 1 个 LanceDB 数据表（classics）
- 六经数据样例（JSONL）

### 成功标准
- 能导入六经文本（语义分块可选）
- 能语义搜索并稳定返回相关段落（Top-k）
- 能生成“两段式”注释并流式展示

## 2. 技术栈MVP配置

### package.json核心依赖（修正）
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "@lancedb/lancedb": "^0.5.0",
    "@xenova/transformers": "^3.0.0",
    "openai": "^4.0.0",
    "axios": "^1.6.0",
    "sharp": "^0.33.0"
  }
}
```

### 环境变量 (.env.local)
```bash
# LLM配置（三选一）
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# 或使用智谱AI
ZHIPU_API_KEY=xxx
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4

# 或使用通义千问
DASHSCOPE_API_KEY=xxx

# 向量模型配置
BGE_MODEL_PATH=./models/bge-m3
EMBEDDING_DIM=1024

# 数据库配置
LANCEDB_PATH=./data/lancedb

# 开关与优化
HYBRID_SEARCH=true             # 启用 Hybrid（BM25+向量）
KV_CACHE=true                  # 启用检索/注释KV缓存
ANNOTATE_MODEL=glm            # glm | qwen | gpt
TIMEOUT_MS=20000              # API超时
```

## 3. 三接口合同（统一错误与流式方案）

统一错误返回：
```json
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "..." } }
```

### 3.1 嵌入接口 POST /api/embed
```json
// 请求
{
  "text": "学而时习之，不亦说乎？",
  "metadata": {
    "source": "论语",
    "chapter": "学而",
    "section": 1
  }
}

// 响应
{
  "success": true,
  "id": "uuid-xxx",
  "vector_length": 1024,
  "version": "EMB_V1_BGE_M3"
}
```

### 3.2 检索接口 POST /api/search
```json
// 请求
{
  "query": "什么是君子",
  "top_k": 5,
  "threshold": 0.7,
  "hybrid": true,
  "filters": { "book": ["论语"], "chapter": ["学而"] }
}

// 响应
{
  "results": [
    {
      "text": "君子务本，本立而道生",
      "source": "论语",
      "chapter": "学而",
      "score": 0.89,
      "metadata": { "id": "lu-001", "section": 1 }
    }
  ]
}
```

### 3.3 注释接口 POST /api/annotate（ReadableStream 流式返回）
```json
// 请求
{
  "text": "学而时习之，不亦说乎？",
  "model": "glm" // glm | qwen | gpt
}

// 响应（按行分块JSON，每行一条）
{"type":"chunk","data":{"six_to_me":"..."}}
{"type":"chunk","data":{"me_to_six":"..."}}
{"type":"meta","data":{"reason":"semantic","links":[{"to_id":"lu-023","score":0.62}]}}
{"type":"end"}
```

## 4. 三条Prompt模板

### 4.1 文本分块Prompt
```
请将以下古籍文本按语义切分为合适的段落（每段50-200字）：
{TEXT}

要求：
1. 保持语义完整性
2. 按JSON数组格式返回
3. 每段包含原文、出处、章节信息

格式：
[
  {
    "text": "原文内容",
    "source": "书名",
    "chapter": "章节名",
    "section": 序号
  }
]
```

### 4.2 语义搜索Prompt（Hybrid 友好）
```
根据用户查询，生成最适合的搜索关键词：
用户查询：{QUERY}

要求：
1. 提取3-5个核心关键词
2. 考虑古文和白话的差异
3. 返回JSON格式，并给出两类关键词：BM25用的关键词、向量检索的概念词

格式：
{
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "expanded": ["扩展词1", "扩展词2"],
  "semantic_terms": ["概念1", "概念2"]
}
```

### 4.3 注释生成Prompt（两段式 + reason/links）
```
请为以下古籍原文提供白话注释：
原文：{TEXT}
出处：{SOURCE}

要求：
1. 两段式输出：
   - 六经注我（经典如何照见此句，80-120字）
   - 我注六经（此句如何反注经典，80-120字）
2. 给出 links（1-3条）：to_id（可为相似段落ID或简要提示）、reason（semantic|contrast|symbolic）、score(0-1)
3. 语言中性、简洁；避免空话。

按以下格式返回：
{
  "six_to_me": "...",
  "me_to_six": "...",
  "reason": "semantic",
  "links": [ {"to_id": "lu-023", "score": 0.62} ]
}
```

## 5. LanceDB表结构和导入

### 5.1 表结构
```javascript
// db/schema.js
// 注意：不同 @lancedb/lancedb 版本对 schema 定义方式略有差异，请以实际 API 为准。
export const schema = {
  id: "string",
  text: "string",
  source: "string",
  chapter: "string",
  section: "int",
  vector: "float[1024]", // bge-m3 维度
  created_at: "string"
}
```

### 5.2 导入脚本
```javascript
// scripts/import-data.js
import lancedb from "@lancedb/lancedb";
import { pipeline } from "@xenova/transformers";
import { schema } from "../db/schema.js";

async function importData() {
  try {
    // 1. 连接数据库
    const db = await lancedb.connect(process.env.LANCEDB_PATH || "./data/lancedb");
    const table = await db.createTable("classics", schema).catch(async () => {
      return await db.openTable("classics");
    });

    // 2. 加载 embedding 模型（bge-m3）
    const embedder = await pipeline("feature-extraction", "BAAI/bge-m3");

    // 3. 读取六经数据（请实现 loadSixClassics 返回数组）
    const data = await loadSixClassics();

    const rows = [];
    for (const item of data) {
      const output = await embedder(item.text, { pooling: "mean", normalize: true });
      const vector = Array.from(output.data || output[0]?.data || []);
      if (vector.length !== Number(process.env.EMBEDDING_DIM || 1024)) {
        console.warn("Skip item due to embedding dim mismatch", item);
        continue;
      }
      rows.push({
        ...item,
        id: crypto.randomUUID(),
        vector,
        created_at: new Date().toISOString()
      });
    }

    if (rows.length > 0) {
      await table.add(rows);
    }
    console.log(`Imported rows: ${rows.length}`);
  } catch (err) {
    console.error("Import failed", err);
  }
}
```

## 6. 六经数据样例 (sixclassics.jsonl)
```json
{"text": "学而时习之，不亦说乎？有朋自远方来，不亦乐乎？", "source": "论语", "chapter": "学而", "section": 1}
{"text": "其为人也孝弟，而好犯上者，鲜矣；不好犯上，而好作乱者，未之有也。", "source": "论语", "chapter": "学而", "section": 2}
{"text": "巧言令色，鲜矣仁。", "source": "论语", "chapter": "学而", "section": 3}
{"text": "吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？", "source": "论语", "chapter": "学而", "section": 4}
{"text": "道千乘之国，敬事而信，节用而爱人，使民以时。", "source": "论语", "chapter": "学而", "section": 5}
{"text": "大学之道，在明明德，在亲民，在止于至善。", "source": "大学", "chapter": "经一章", "section": 1}
{"text": "古之欲明明德于天下者，先治其国；欲治其国者，先齐其家。", "source": "大学", "chapter": "传二章", "section": 1}
{"text": "天命之谓性，率性之谓道，修道之谓教。", "source": "中庸", "chapter": "第一章", "section": 1}
{"text": "喜怒哀乐之未发，谓之中；发而皆中节，谓之和。", "source": "中庸", "chapter": "第一章", "section": 2}
{"text": "致中和，天地位焉，万物育焉。", "source": "中庸", "chapter": "第一章", "section": 3}
```

## 7. 前端流式实现

### 7.1 主页面结构（统一 ReadableStream）
```tsx
// app/page.tsx
"use client";

import { useState } from "react";
import { StreamingText } from "@/components/StreamingText";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [annotating, setAnnotating] = useState(false);

  const handleSearch = async () => {
    const response = await fetch("/api/search", {
      method: "POST",
      body: JSON.stringify({ query, top_k: 5 })
    });
    const data = await response.json();
    setResults(data.results);
  };

  const handleAnnotate = async (text: string) => {
    setAnnotating(true);
    const response = await fetch("/api/annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, model: "glm" })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          // 根据 evt.type 更新UI（chunk/meta/end）
        } catch (_) {}
      }
    }

    setAnnotating(false);
  };

  return (
    <main className="container">
      <h1>古籍知识图谱</h1>

      {/* 搜索框 */}
      <div className="search-box">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索古籍内容..."
        />
        <button onClick={handleSearch}>搜索</button>
      </div>

      {/* 结果展示 */}
      <div className="results">
        {results.map((item, idx) => (
          <div key={idx} className="result-item">
            <div className="original-text">{item.text}</div>
            <div className="source">出处：{item.source}</div>
            <button onClick={() => handleAnnotate(item.text)}>
              生成注释
            </button>
            {annotating && <StreamingText text={item.text} />}
          </div>
        ))}
      </div>
    </main>
  );
}
```

### 7.2 流式文本组件
```tsx
// components/StreamingText.tsx
"use client";

import { useEffect, useState } from "react";

export function StreamingText({ text }: { text: string }) {
  const [annotation, setAnnotation] = useState("");
  const [translation, setTranslation] = useState("");

  useEffect(() => {
    // 这里只示例本地状态展示，实际数据在 page 中通过 ReadableStream 逐步 set 到组件
    setAnnotation("");
    setTranslation("");
  }, [text]);

  return (
    <div className="annotation">
      <div className="translation">
        <h4>白话译文</h4>
        <p>{translation}</p>
      </div>
      <div className="explanation">
        <h4>详细注释</h4>
        <p>{annotation}</p>
      </div>
    </div>
  );
}
```

## 8. 检索实现与 Hybrid（建议）

### 8.1 lib/search.ts 抽象（示例）
```ts
// lib/search.ts
export interface SearchOptions {
  topK?: number;
  threshold?: number;
  hybrid?: boolean;
  filters?: { book?: string[]; chapter?: string[] };
}

export async function search(query: string, opts: SearchOptions = {}) {
  // 1) 如果 hybrid=true：BM25 召回（mini-search/lunr） ∪ 向量召回；
  // 2) 合并去重后，按向量分数/简单加权排序；
  // 3) 应用 filters；返回 TopK。
}
```

### 8.2 KV 缓存策略（建议）
- Key：`sha1(query|filters|topK|model)`；TTL：5–30 分钟
- 命中后直接返回结果；注释也做短期缓存（避免重复费用）

## 9. 开发和部署命令

### 9.1 本地开发
```bash
# 安装依赖
npm install

# 下载bge-m3模型
npm run download-model

# 初始化数据库
npm run init-db

# 导入六经数据
npm run import-data

# 启动开发服务器
npm run dev
```

### 9.2 生产部署
```bash
# 构建项目
npm run build

# 启动生产服务器
npm start

# Docker部署
docker build -t infidao-mvp .
docker run -p 3000:3000 infidao-mvp
```

### 9.3 package.json scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "download-model": "node scripts/download-model.js",
    "init-db": "node scripts/init-db.js",
    "import-data": "node scripts/import-data.js",
    "test": "jest",
    "lint": "next lint"
  }
}
```

## 10. M0-M3里程碑

### M0 - 基础搭建（第1周）
- [ ] Next.js项目初始化
- [ ] LanceDB数据库连接
- [ ] bge-m3模型本地部署
- [ ] 基础API框架搭建

### M1 - 核心功能（第2周）
- [ ] 实现embed接口
- [ ] 实现search接口
- [ ] 六经数据导入（500条）
- [ ] 基础搜索界面

### M2 - 注释功能（第3周）
- [ ] 实现annotate接口
- [ ] 流式响应处理
- [ ] 前端两段式展示
- [ ] 性能优化

### M3 - MVP完善（第4周）
- [ ] 数据扩展到2000条
- [ ] 搜索结果高亮
- [ ] 简单的用户反馈
- [ ] 部署文档完善

## 11. 快速开始检查清单

1. [ ] 克隆代码：`git clone`
2. [ ] 安装依赖：`npm install`
3. [ ] 配置环境变量：复制`.env.example`到`.env.local`
4. [ ] 下载模型：`npm run download-model`
5. [ ] 初始化DB：`npm run init-db`
6. [ ] 导入数据：`npm run import-data`
7. [ ] 启动服务：`npm run dev`
8. [ ] 访问：`http://localhost:3000`

## 12. 常见问题

**Q: 模型下载太慢？**
A: 使用镜像源或下载后放在`./models`目录

**Q: 搜索结果不准确？**
A: 调整`top_k`和`threshold`参数，或使用关键词扩展

**Q: 流式响应卡顿？**
A: 检查网络连接，或切换到更快的LLM服务

**Q: 内存占用过高？**
A: 减少批处理大小，或使用更小的embedding模型

---

> MVP原则：先做出来，再做好
> 目标：4周内上线可用的版本