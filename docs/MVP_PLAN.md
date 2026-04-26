## MVP 计划（JSON 优先）

> 状态：已于 2026-04-24 被 superseded
> 本文件仅保留 pre-reboot 历史参考价值。当前重启执行只认 `docs/SUPERPOWERS_REBOOT_PLAN.md` 与 `docs/plans/reboot-mvp-implementation-plan.md`；若与本文件冲突，以那两份为准。

### 愿景
以最低成本快速跑通“输入一句 → 命中六经原文 → 三段式解释 → 词级可点击回溯 → 无限探索”的闭环。

### 阶段目标
- 阶段一（第 1 周）：完成 JSON 语料/向量加载与健康检查；定义检索抽象
- 阶段二（第 2 周）：完成 `/api/search` 与检索结果 UI；可用 Top-K 命中
- 阶段三（第 3 周）：完成 `/api/explain` 与三段式解释渲染；词级链接回溯

### 关键接口
- `/api/search`：输入 query，输出 Top-K passages（id, text, score, meta）
- `/api/explain`：输入 passage/context，输出 `translation/terms/background/anchors?`
- `/api/embed`：输入文本，输出向量（供离线脚本或小批量生成）

### 数据形态
- 语料：`data/sixclassics-*.jsonl`（id, book, chapter, line, text）
- 向量：`data/embeddings.json`（id, vector, norm?）

### 技术路线
- 检索：内存余弦相似度 Top-K（可选 BM25 混排）
- 解释：`explantation_prompt.md` 作为系统提示模板，严格“三段式”结构
- 链接：优先返回 `anchors`（词级范围 → 原句 passageId）；无 anchors 时回退近邻检索

### 可观测性与容错
- 日志：请求入参指纹、耗时、Top-K 命中、模型名、异常栈
- 降级：LLM 超时回退；解释结构化失败 → 纯文本渲染；检索不足 → 关键词检索
- 缓存：同一 passage 的解释结果与 Top-K 命中缓存（L1 内存，L2 可选落盘）

### 迁移与扩展
- 当数据规模增大：替换 `JsonVectorSearch` 为 `LanceDbSearch`（接口不变）
- 增加过滤：书名/章节/标签过滤器；混合检索权重调优
- 增强体验：图谱视图、时间轴、协作与分享

### 里程碑与验收
- M1：搜索 P95 < 800ms，命中 3–5 条合理经文
- M2：解释结构合规（三段式），词级链接可回溯原句
- M3：端到端稳定；主要路径日志完备；一键部署可用

