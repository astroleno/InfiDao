下面给你一套“能今天就开干”的 MVP 轻量化技术栈，按“超轻 / 轻 / 标准”三档给选型与落地路径。都围绕你的目标：输入一句 → 语义检索六经段落 → 可继续点开的 Infinite Wiki。

超轻（最快起步，单人一晚能跑通）

适用：先证明闭环与交互感觉
	•	前端：Next.js (App Router) + React Server Components
	•	API：Next.js Route Handlers（免独立后端）
	•	向量库：LanceDB（本地/文件型） 或 SQLite + pgvector-lite（libsql/turso）
	•	嵌入模型：bge-m3（中文效果好；用 web 端 API 推理或本地小服务）或 text-embedding-3-large（省心）
	•	LLM：GLM-4.5（你计划生产用）或 Qwen-Max / OpenAI（开发期对照）
	•	数据：六经段落切分成 JSON/CSV，首批几千段即可
	•	部署：Vercel（静态+Serverless），向量库选 LanceDB 可直接随项目文件部署

UI 先做“两列 + 反向注”
左：我的句子 & 关键词；右：Top-k 六经段落（chip 可点开）
点击任意段落 → 生成“六经注我”与“我注六经”两块短释义，底部列出延伸链接（再检索一次即可）。

优点：依赖最少、认知负担低、快速迭代。
限：数据量到 10w 段后需要升级向量库或外部服务。

⸻

轻（可小规模上线试水）

适用：要一点可靠性和团队协作
	•	前端：Next.js + shadcn/ui（快出干净 UI）
	•	后端：Next.js Edge/Node 混合（语义检索走 Node Runtime）
	•	向量库：Supabase + pgvector（托管省心）
	•	嵌入：bge-m3（离线批处理）+ text-embedding-3-small（在线补齐）
	•	LLM：GLM-4.5（生产通道）+ OpenAI/Qwen（灰度对比）——用适配层屏蔽差异
	•	数据流：n8n/脚本 → 分句/去重/断句 → 批量嵌入 → upsert 到 Supabase
	•	鉴权：NextAuth（邮箱魔法链接）
	•	部署：Vercel（前端+API） + Supabase（DB/存储）

优点：性价比高、易维护、能撑到早期用户。
限：复杂查询/图结构需要额外设计。

⸻

标准（为“图谱/回链/版本化”预留位）

适用：你确认要做“语义图谱 + 版本管理 + 回链统计”
	•	数据层：Postgres（文本/关系） + pgvector（检索） + Neo4j（可选，图查询）
	•	检索层：Hybrid Search（BM25 + 向量）
	•	队列：QStash / BullMQ（异步批量嵌入/重算）
	•	观测：OpenTelemetry + Sentry（Prompt/检索链路可观测）

优点：可扩到大规模、复杂分析；
限：MVP 期不必要，先别上。

⸻

推荐你就用这套（落地清单）

栈：Next.js + Route Handlers + LanceDB + bge-m3 + GLM-4.5（适配层）+ Vercel

目录草案

/app
  /page.tsx              # 输入区+结果两列
  /api/embed/route.ts    # 文本→嵌入（可切换 bge/TE3）
  /api/search/route.ts   # Top-k 语义检索
  /api/annotate/route.ts # 六经注我 / 我注六经 生成
/lib
  /db.ts                 # LanceDB 封装
  /llm.ts                # 模型适配层（GLM/Qwen/OpenAI）
  /embed.ts              # 嵌入适配层
/data
  /sixclassics.jsonl     # 预处理好的段落（id, text, source, book, chapter）

最小数据结构
	•	Passage: {id, book, chapter, text, tokens, embedding}
	•	Link: {from_id, to_id, reason: "semantic|contrast|symbolic", score}
	•	Note（用户侧“我语”）: {id, user_id, text, created_at}

交互闭环（MVP）
	1.	输入“我语” → /api/search：Top-k 六经段落
	2.	展示：右列卡片（原文、来源、相似度）
	3.	点开卡片 → /api/annotate：两段短文
	•	六经注我（经文如何照见此句）
	•	我注六经（我的句子如何反注此段）
	4.	结果卡底部 → “延伸” chips（再检索：同义/对照/象征）
	5.	侧边栏保留历史脉络（形成你的“注经树”）

三条 Prompt 规范
	•	retrieve_prompt: 仅做关键词扩展（避免过度生成）
	•	annotate_prompt: 固定两段式，限制字数（比如各 80–120 字）
	•	link_reason_prompt: 生成 reason（semantic / contrast / symbolic）+ 一句话依据

⸻

里程碑
	•	M0（1–2 天）：离线嵌入 5k 段六经 → LanceDB → Top-k 检索 → 两列 UI
	•	M1：双向注释（两段式）+ 延伸 chips → 可连续点
	•	M2：历史脉络（本地存储）+ 导出 JSON（便于后续图谱）
	•	M3（可选）：Hybrid Search + 简易“关系理由”统计（reason 分布）

⸻

关键取舍建议
	•	先别上可视化大图谱：前两版用两列/面包屑就够，图谱后上。
	•	控制生成长度：每次生成≤150字，快、稳定、少跑偏。
	•	分离嵌入与生成：嵌入可离线批量，线上只检索+短生成。
	•	适配层必做：方便 GLM/Qwen/OpenAI 随时切换与 A/B。

需要的话，我可以把上述目录与 API 接口约定整理成一页 开发手册（含请求/响应 JSON 样例和 Prompt 模板），你直接开 repo 就能写了。