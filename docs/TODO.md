# InfiDao TODO（MVP 路线）

> 目标：4 周跑通“输入一句 → 检索六经 → 双向短注 → 继续点开”。

## M0 基础搭建（第 1 周）
- [ ] 初始化 Next.js（App Router）项目与基础目录
- [ ] 配置 `.env.local`（OPENAI/GLM/Qwen、LANCEDB_PATH、HYBRID_SEARCH、KV_CACHE、TIMEOUT_MS）
- [ ] 搭建 LanceDB 连接封装 `lib/db.ts`
- [ ] 嵌入适配层 `lib/embed.ts`（bge-m3，版本 EMB_V1_BGE_M3）
- [ ] 模型适配层 `lib/llm.ts`（GLM-4.5 优先，Qwen/OpenAI 可切换）
- [ ] 检索抽象 `lib/search.ts`（支持 hybrid 与 filters）

验收：本地启动成功；`/api/health` 输出 OK；日志打印依赖与路径。

## M1 语义检索（第 2 周）
- [ ] 导入 `data/sixclassics.jsonl`（≥ 5k 段）
- [ ] 完成 `scripts/import-data.js`（批量 add、维度校验、异常处理）
- [ ] 实现 `/api/embed`（单条与批量）
- [ ] 实现 `/api/search`（Top-k、threshold、filters、hybrid=true）
- [ ] 前端搜索页：输入框、结果卡片、骨架屏、错误提示

验收：输入现代句，返回 3–5 条合理经文；接口 P99 < 3s。

## M2 双向注释与流式（第 3 周）
- [ ] 实现 `/api/annotate`（ReadableStream，按行 JSON：chunk/meta/end）
- [ ] 固定注释结构：`six_to_me`, `me_to_six`, `reason`, `links[{to_passage,score}]`
- [ ] 前端流式渲染：逐行解析并更新 UI；显示生成耗时
- [ ] 延伸 chips：点击再检索（带上 reason 或 semantic_terms）
- [ ] KV 缓存：同 query 的检索与注释结果短期缓存

验收：流式输出稳定；点击延伸可继续探索；缓存命中 < 1.2s。

## M3 MVP 完成度提升（第 4 周）
- [ ] Hybrid 检索权重调优（BM25 召回 + 向量重排）
- [ ] 数据扩展到 10k–20k 段；补充《孟子》《尚书》等
- [ ] 结果高亮与分页/懒加载（先渲 3 条，余下懒加载）
- [ ] 错误与降级策略：模型超时回退、检索不足回退关键词检索
- [ ] 部署方案：Vercel（默认）/ Cloudflare / Supabase 香港区（国内可用）

验收：端到端可用、稳定；部署稳定可访问；主要路径日志可观测。

## 工程与规范（滚动）
- [ ] 统一错误返回：`{ success: false, error: { code, message } }`
- [ ] 日志：请求入参、耗时、Top-k 命中、模型名、失败原因
- [ ] `.env.example`：列出所有键位与示例值
- [ ] README：快速开始（10 步内跑通）

---

小贴士
- LanceDB 适合 ≤5–10k 段；若 >10w 段，迁移 Supabase+pgvector（保留检索接口不变）。
- 先做出来再优化：首要保障检索稳定与注释质量；可视化与协作放后面。

