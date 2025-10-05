## InfiDao 项目说明（技术框架与基本计划）

> 仅参考 `prd说明.md` 与 `ref/infinite-wiki/`。本说明面向快速起步与迭代，优先保证闭环、体验与可维护性。

### 一、项目目标（MVP）
- **目标**：实现“输入一句 → 语义检索六经段落 → 可继续点开的 Infinite Wiki”。
- **交互闭环**：
  1) 用户输入“我语”；
  2) /api/search 返回 Top-k 六经段落；
  3) 点击某段 → /api/annotate 生成“两段式”释义：
     - 六经注我：经文如何照见此句
     - 我注六经：我的句子如何反注此段
  4) 卡片底部提供“延伸”chips（再检索：semantic/contrast/symbolic）；
  5) 侧边栏保留历史脉络（后续版本）。

### 二、技术栈与整体架构
- **前端**：Next.js（App Router）+ React Server Components；UI 可先用最简 CSS，后续接入 shadcn/ui。
- **API**：Next.js Route Handlers（无需独立后端）。
- **向量库**：LanceDB（文件型，便于随项目部署；MVP 足够）。
- **嵌入模型**：bge-m3（中文优秀，离线批量）或 text-embedding-3-*（在线补齐）。
- **LLM**：GLM-4.5（生产通道）或 Qwen-Max / OpenAI（对照）。
- **部署**：Vercel（静态+Serverless）；向量库选 LanceDB 可随项目文件部署。
- **参考实现要点（来自 ref/infinite-wiki）**：
  - 流式生成与取消：前端 `useEffect` + 取消标记；
  - 错误与兜底：服务端/前端 `try-catch`、错误提示、ASCII fallback；
  - 骨架屏和渐进呈现：`LoadingSkeleton` + 文本流式更新；
  - 指标打印：生成耗时与关键日志，便于调试。

### 三、目录草案
```
/app
  /page.tsx              # 输入区 + 结果两列
  /api/embed/route.ts    # 文本→嵌入（可切换 bge/TE3）
  /api/search/route.ts   # Top-k 语义检索
  /api/annotate/route.ts # 六经注我 / 我注六经
/lib
  /db.ts                 # LanceDB 封装
  /llm.ts                # 模型适配层（GLM/Qwen/OpenAI）
  /embed.ts              # 嵌入适配层
/data
  /sixclassics.jsonl     # 段落数据（id, text, source, book, chapter）
```

### 四、最小数据结构
- Passage: `{ id, book, chapter, text, tokens?, embedding }`
- Link: `{ from_id, to_id, reason: "semantic|contrast|symbolic", score }`
- Note（用户“我语”）: `{ id, user_id, text, created_at }`

### 五、API 设计（请求/响应样例）
> 错误时统一返回 `{ error: { code, message } }`，HTTP 4xx/5xx；服务端记录错误栈与请求耗时。

1) POST /api/embed
```json
// req
{ "texts": ["天地玄黄", "宇宙洪荒"] }
// res
{ "embeddings": [[0.12, -0.03, ...], [0.09, 0.22, ...]] }
```

2) POST /api/search
```json
// req
{ "query": "仁者爱人", "k": 5, "filters": { "book": ["论语"] } }
// res
{
  "results": [
    {
      "passage": { "id": "lu-001", "book": "论语", "chapter": "颜渊", "text": "..." },
      "score": 0.83
    }
  ]
}
```

3) POST /api/annotate
```json
// req
{ "query": "仁者爱人", "passage": { "id": "lu-001", "text": "..." } }
// res
{
  "annotate": {
    "classic_on_me": "（六经注我）...80-120字...",
    "me_on_classic": "（我注六经）...80-120字..."
  },
  "links": [
    { "to_id": "lu-023", "reason": "semantic", "score": 0.62 }
  ]
}
```

### 六、Prompt 规范（固定模板，可参数化）
- retrieve_prompt：仅做关键词扩展，避免过度生成，输出检索用 query 或扩展词。
- annotate_prompt：固定“两段式”，各 80–120 字，语气中性、克制。
- link_reason_prompt：输出 `reason`（semantic/contrast/symbolic）+ 一句话依据。

### 七、运行与配置
- 环境变量
  - `LLM_PROVIDER`（glm/qwen/openai），`LLM_API_KEY`
  - `EMBED_PROVIDER`（bge/openai），`EMBED_API_KEY`
  - `LANCEDB_DIR`（如 `./data/lancedb`）
- 本地启动（示例）
  - 导入数据：将 `data/sixclassics.jsonl` 通过脚本嵌入后 upsert 到 LanceDB
  - 开发：`npm i && npm run dev`（Next.js）
  - 部署：Vercel，注意指定 Node Runtime 的 API Route（搜索/嵌入）

### 八、里程碑与时间
- M0（1–2 天）：离线嵌入 5k 段 → LanceDB → Top-k 检索 → 两列 UI
- M1：双向注释 + 延伸 chips → 可连续点
- M2：历史脉络（本地存储）+ 导出 JSON（便于后续图谱）
- M3（可选）：Hybrid Search + 简易“关系理由”统计（reason 分布）

### 九、开发清单（首批）
- 初始化 Next.js 项目与目录；创建 `/api/embed|search|annotate` 路由（含错误处理与日志）。
- 实现 `/lib/embed.ts` 与 `/lib/llm.ts` 适配层，便于切换供应商与 A/B。
- 搭建 LanceDB 封装 `/lib/db.ts`，提供 upsert/search API；导入最小样例数据。
- 前端实现两列页面：输入区、结果卡片、骨架屏、错误提示、延伸 chips。
- 关键指标打印：检索耗时、生成字数、错误率；前端显示生成耗时。

### 十、与 ref/infinite-wiki 的关系
- 借鉴其：
  - 流式生成与 UI 节奏（`streamDefinition` 式流出）；
  - 错误兜底与 ASCII fallback；
  - 加载体验与渐进呈现；
- 本项目需新增：
  - 语义检索与向量库（LanceDB）层；
  - 三条 Prompt 规范与检索-生成链路；
  - API 合同与数据导入流程。

—— 以上为可立即落地的项目说明。后续我可按此文档直接补齐目录与空路由文件，并提供最小数据与导入脚本，帮助你“一晚能跑通”。


