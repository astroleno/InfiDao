# InfiDao TODO（MVP：JSON 优先）

> 目标：3 周跑通“输入一句 → JSON 向量检索 → 三段式解释 → 可点击回溯”。

## M0 启动与基础（第 1 周）
- [ ] 配置 `.env.local`（LLM_PROVIDER/KEY、LOG_LEVEL、TIMEOUT_MS）
- [ ] JSON 数据放置：`data/sixclassics-sample.jsonl`
- [ ] 向量生成脚本（离线）：输出 `data/embeddings.json`
- [ ] 检索抽象接口定义：`JsonVectorSearch`（预留 `LanceDbSearch`）
- [ ] `/api/health` 输出 OK；关键日志（启动参数、数据量、内存占用）

验收：本地启动；可加载 embeddings JSON；健康检查通过。

## M1 语义检索与结果页（第 2 周）
- [ ] `/api/embed`（单条/批量，便于离线脚本复用）
- [ ] `/api/search`（内存 Top-K + 阈值；可选 BM25 混排）
- [ ] 搜索 UI：输入框、结果卡片、骨架屏、错误提示
- [ ] 命中预览：展示出处（书/章/句）与相似度

验收：输入现代句，返回 3–5 条合理经文；P95 < 800ms。

## M2 三段式解释与可点击回溯（第 3 周）
- [ ] `/api/explain`：使用 `explantation_prompt.md` 生成【核心译文/重点词解/背景解读】
- [ ] 解释面板：渲染三段式；核心译文“词级链接”（hover 预览，click 打开原句）
- [ ] 缓存：同一 passage 的解释结果进程内缓存（可选落盘）
- [ ] 错误与降级：LLM 超时/结构化失败的回退策略

验收：端到端可用；点击词汇可回到原句并可继续“注我”。

## 工程与规范（滚动）
- [ ] 统一错误返回：`{ success: false, error: { code, message } }`
- [ ] 关键路径日志与耗时监控
- [ ] `.env.example`：列出最小必需键位
- [ ] README：MVP JSON 路线更新

---

小贴士
- JSON 路线适合 ≤5–10 万 token 级别数据与 demo；数据增长再切换 LanceDB/pgvector（保持检索接口不变）。
- 先保证检索稳定和解释质量，再优化可视化与协作。 

