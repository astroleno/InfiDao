# JSON 数据库文件与流程计划（MVP）

目标：用最小代价在本地以内存检索跑通“输入一句 → 命中六经原文 → 三段式解释 → 词级回溯”的闭环，并为后续迁移 LanceDB/pgvector 预留接口位。

## 一、目录与文件

- 数据目录：`data/`
  - 语料：`data/sixclassics-sample.jsonl`
    - 行格式：`{ id, book, chapter, section, text }`
  - 向量：`data/embeddings.json`（或 `embeddings.jsonl`）
    - 结构：`[{ id, text, vector:number[] }]`
  - 可选缓存：`data/search-cache.json`（按需落盘，键为 query 指纹）

## 二、离线向量生成脚本（推荐）

- 新增脚本：`scripts/generate-embeddings.js`
  - 输入：`data/sixclassics-sample.jsonl`
  - 过程：批量走 `/api/embed` 或直接调用 `lib/embed/index.ts`
  - 输出：`data/embeddings.json`
  - 异常：逐条 try-catch，失败写入 `data/embeddings.errors.log`
  - 性能：支持可配置 batchSize/并发度（env 或 CLI 参数）、normalize、float32；打印总耗时与 QPS

示例输出（单项）：
```json
{
  "id": "lunyu-1-1",
  "text": "子曰：学而时习之，不亦说乎？",
  "vector": [0.0123, -0.0456, ...]
}
```

## 三、检索适配器设计

- 抽象接口（保持不变）：`lib/search/index.ts`
  - `searchProvider = 'json' | 'lancedb'`（env 或 config 切换）
  - 入参：`SearchOptions { query, topK, threshold, hybrid, filter? }`
  - 出参：`SearchResult[] { id, book, chapter, section, text, score, metadata }`

- JSON 适配器：`lib/search/json.ts`
  - 加载：启动时读取 `data/embeddings.json`（懒加载 + 单例缓存）
    - 并发安全：首次加载期间使用简单互斥（Promise 缓存/锁）避免重复读
    - 热更新策略：MVP 阶段建议“文件变更需重启进程”；后续可加文件变更监听与版本号
  - 相似度：`cosine(vector(query), vector(item))`
  - Top-K：排序取前 K，score < threshold 的过滤掉
  - 可选混排：`minisearch` 做 BM25，与向量分数加权
  - 性能：首次加载打印条目数与内存占用；支持 LRU 缓存 query 结果

## 四、API 改造点

- `/api/search`：
  - 从 `JsonVectorSearch` 获取 Top-K；保留接口不变
  - 参数：`topK`、`threshold` 均为可选，给默认值
  - 打印日志：query 指纹、耗时、命中数

- `/api/explain`（若已存在则“扩展”，否则“新增”）：
  - 入参：`{ passage?: string, passageIds?: string[], userQuery?: string }`
  - 取 Top-1~Top-3 原文为上下文 + `explantation_prompt.md`
  - 出参：`{ translation, terms:[{term,note}], background, anchors? }`
  - 缓存：对同一 passage 解释结果 L1 缓存；可选落盘

## 五、类型与配置

- `types/index.ts`：明确 `SearchOptions` 驼峰命名（`topK` 而非 `top_k`）
- `lib/config.ts`：增加 `SEARCH_PROVIDER=json|lancedb`、默认 `json`
- `tsconfig.json`：已排除非必需目录，便于先跑通 MVP

## 六、迁移策略

- 保持 `lib/search/index.ts` 抽象层不变
- 新增 `LanceDbSearch` 时，仅在该层切换 provider 即可
- `embeddings.json` 与 LanceDB 索引共享同一 `id/text/vector` 结构，便于导入

## 七、验收标准

- 搜索接口：P95 < 800ms（数据量≤5k 段）
- 三段式解释：结构化 JSON 可解析；异常有降级
- 词级回溯：hover 预览 + click 打开原句
- 关键日志：检索耗时、命中数、模型耗时、错误栈
  
- 冷启动：首次加载 `embeddings.json` ≤ 2s（≤5k 段，SSD，本地）
- 内存占用：embeddings 常驻内存 ≤ 1.2 × 文件体积（float32 情况）

## 八、后续优化（可选）

- 增量更新：支持追加新段落与增量向量写入
- 预热：应用启动预载向量与 Top-N 常见 query
- 索引压缩：向量量化（uint8）以减小内存与 IO


