# InfiDao 质量与发布收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 Reboot MVP 公共 API 和核心用户路径的前提下，把当前“功能基本成立、质量证据较强、但发布门禁仍未闭环”的项目状态收敛为可复现、可审查、可发布的 Release Candidate。

**Architecture:** 保持现有 JSON-first、本地混合检索、可选 Graph sidecar、一次性 Annotation JSON、栈式 Wiki Explore 和内部 A2A fail-open 架构。收敛工作只处理发布契约、测试稳定性、静态检查覆盖、检索质量证据、制品可复现性、仓库卫生和最终验收，不扩展产品功能。

**Tech Stack:** Next.js 15、React 18、TypeScript 5.6、Jest 29、本地 JSON/JSONL 制品、GitHub Actions、Node.js 20 CI。

---

Created: 2026-07-26
Status: proposed
Priority: release convergence
Scope: quality, verification, repository hygiene, release sign-off

## 1. 与项目主计划的关系

本计划是发布收敛子计划，不替代主计划。发生冲突时，仍以以下文档为准：

- `docs/SUPERPOWERS_REBOOT_PLAN.md`
- `docs/plans/reboot-mvp-implementation-plan.md`
- `docs/plans/reboot-mvp-continuation-plan.md`

本计划继续保护主路径：

```text
query -> search -> annotation/explain -> wiki explore
```

继续保护公共契约：

- `POST /api/search`
- `POST /api/annotate`
- `GET /api/health`

继续保护架构边界：

- 运行时搜索只依赖本地 JSON/JSONL 制品，不把在线古籍站点变成请求时依赖。
- Graph sidecar 保持可选、fail-open，不参与公开搜索排序加权。
- A2A 保持内部、确定性、隐私受限和 fail-open，不新增公共 A2A 路由。
- Annotation 继续返回一次性 JSON，不恢复旧流式协议。
- 现有 telemetry timeout 例外继续按主计划记录；没有新的产品决定时，不扩大为本轮阻塞项。

本计划不包含：

- 新产品功能、账号体系、分享、收藏、图谱画布或时间线。
- UI 重设计或 `docs/simon-rogers-main-screen-plan/` 的实施。
- LanceDB、pgvector、Redis、远程 embedding provider 或在线证据链迁移。
- Graph boost、Graph diversity rerank 或公开诊断字段。
- Playwright 自动化；当前版本的桌面与移动验收采用人工检查，除非另行授权。

## 2. 当前结论

当前项目状态为：**黄色，功能与核心逻辑大体可用，但尚不能重新签署 Release Candidate。**

原因不是主要功能缺失，而是四个发布闭环尚未同时成立：

1. 当前 production smoke 的固定 Top 1 契约与扩容后的实际排序冲突。
2. 完整 Jest 首轮出现过冷启动超时，随后复跑全部通过，说明测试仍有环境敏感性。
3. 当前 lint 和 TypeScript 默认范围没有覆盖全部关键搜索代码、测试和发布脚本。
4. 工作区包含大量未整理的功能、生成制品、QA 输出和本地审查文件，尚未形成可审查提交序列。

### 2.1 2026-07-26 实测基线

| 检查项                          | 当前结果                                                 | 判断                                                         |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Branch                          | `codex/p5-search-diagnostics-plan`，较 upstream ahead 1  | 需要整理和同步                                               |
| Worktree                        | 32 个 tracked modified path、29 个 untracked path        | 发布集成风险高                                               |
| Corpus                          | 14 部典籍、11,829 passages                               | 数据扩容已进入运行基线                                       |
| Embeddings                      | `infidao-local-concept-v2`、151 dimensions、11,829 items | 本地制品有效                                                 |
| Search graph                    | 12,825 nodes、24,084 edges                               | sidecar 制品有效                                             |
| `npm run type-check`            | 通过                                                     | 但默认不检查 `tests/**` 和 `scripts/**`                      |
| `npm run lint`                  | 通过，无 warning/error                                   | 但 `.eslintrc.json` 忽略 `src/lib/search/**` 和 `scripts/**` |
| 手工 lint `tests/**`            | 通过                                                     | 尚未进入标准脚本                                             |
| 手工 TypeScript 检查 `tests/**` | 123 files、0 diagnostics                                 | 可以安全恢复到标准门禁                                       |
| 首轮完整 Jest                   | 38/44 suites、190/204 tests 通过；14 个 5s timeout       | 冷启动/资源敏感，不稳定                                      |
| 同批失败测试使用 60s timeout    | 6/6 suites、40/40 tests 通过                             | 断言逻辑成立                                                 |
| 同批失败测试恢复默认 timeout    | 6/6 suites、40/40 tests 通过                             | 失败不可稳定复现                                             |
| 第二轮完整 Jest                 | 44/44 suites、204/204 tests 通过，22.4s                  | 当前逻辑回归为绿                                             |
| `npm run test:search-quality`   | 11/11 golden；OOD full 0、fusion 0；制品复现通过         | 当前可见回归集为绿                                           |
| Search 50-query reports         | 50/50、50/50                                             | 强回归证据                                                   |
| “Blind generalization” report   | 30/30                                                    | 查询已进入 alias pattern，不能继续称为真正盲测               |
| A2A QA                          | 100/100                                                  | 内部 A2A 回归证据较强                                        |
| `npm run build`                 | 第二次通过                                               | 首次因磁盘仅余约 245 MiB 出现 `ENOSPC`                       |
| Runtime index cold load         | index 342ms、graph 232ms、总计约 574ms                   | 生产冷加载本身未超过 5s                                      |
| Production smoke                | health 和静态资源通过；search ranking contract 失败      | 当前 P0 blocker                                              |
| Smoke 排序                      | 期望 `lunyu-1-8`；实际 `rysxguji-zhongyong-1-2`          | 固定旧 Top 1 已漂移                                          |
| 当前人工桌面/移动 E2E           | 本轮未重跑                                               | 最终签署前必须补齐                                           |

### 2.2 依赖拓扑风险

`graphify-out/GRAPH_REPORT.md` 显示 `createAnnotation()`、`diagnoseSearchPassages()`、Search Index、Graph Loader 等节点具有较高连接度。由此确定两条执行规则：

- 修改 search、annotation、graph 或 A2A 边界时，必须同时跑 unit、route integration、quality gate 和 production smoke。
- 不在这些高连接度节点上做“顺手重构”；每次改动只解决一个明确发布问题。

## 3. Release Candidate 的完成定义

只有以下条件全部满足，才能把状态从黄色改为绿色：

- [ ] 主查询 `如何面对困境` 命中经过人工语义确认的困境/韧性经典，不再把泛化的“中庸”段落作为错误固定契约。
- [ ] Production smoke 验证 HTTP、响应结构和完整用户链路；排序质量由独立 golden gate 负责。
- [ ] 完整 Jest 在无缓存条件下连续两轮全绿。
- [ ] 冷启动敏感 suites 连续两轮全绿，且没有仅靠全局放宽 timeout 掩盖问题。
- [ ] `type-check` 覆盖 app、tests 和 active TypeScript scripts。
- [ ] `lint` 覆盖 `src/**`、`tests/**` 和 active release scripts，不再忽略 `src/lib/search/**`。
- [ ] CI 运行 search quality gate，并拒绝未提交或不可复现的 embeddings/graph 制品。
- [ ] 现有“blind”报告被诚实重分类为 tuned regression；真正 holdout 按冻结流程产生。
- [ ] README、release-readiness、acceptance checklist 和实际 npm scripts 一致。
- [ ] Release commit 在 detached clean worktree 中通过 install、artifact check、static gates、tests、build 和 standalone smoke。
- [ ] 当前桌面和 390px 移动主路径人工验收通过并记录。
- [ ] Release diff 不包含本地截图、重复 QA 压缩包、采集缓存或无关设计计划。

## 4. 阻塞顺序

```mermaid
flowchart LR
  A["冻结现状与变更清单"] --> B["修复搜索发布契约"]
  B --> C["稳定冷启动测试"]
  C --> D["恢复静态检查覆盖"]
  D --> E["补齐 CI 与制品门禁"]
  E --> F["重建质量证据分级"]
  F --> G["整理仓库与文档"]
  G --> H["Clean worktree 最终验收"]
```

P0 阻塞项：Task 1、Task 2、Task 3、Task 4、Task 7。
P1 发布信心项：Task 5、Task 6。
P2 延后项：本文末尾的 Post-release backlog。

## 5. 文件地图

### 主计划与发布文档

- `docs/SUPERPOWERS_REBOOT_PLAN.md`
- `docs/plans/reboot-mvp-implementation-plan.md`
- `docs/plans/reboot-mvp-continuation-plan.md`
- `docs/qa/reboot-mvp-release-readiness.md`
- `docs/qa/reboot-mvp-acceptance-checklist.md`
- `README.md`

### 检索与制品

- `src/lib/search/local-embedding-spec.json`
- `src/lib/search/local-embedding.ts`
- `src/lib/search/evidence.ts`
- `src/lib/search/lexical.ts`
- `src/lib/search/fusion.ts`
- `src/lib/search/diagnostics.ts`
- `src/lib/search/index-store.ts`
- `data/corpus-manifest.json`
- `data/embeddings.json`
- `data/search-graph.json`
- `data/rysxguji/`

### 测试与质量脚本

- `jest.config.js`
- `tests/fixtures/search-golden-queries.json`
- `tests/fixtures/search-ood-queries.json`
- `tests/unit/search/`
- `tests/unit/annotation/service.test.ts`
- `tests/integration/api/search.route.test.ts`
- `tests/integration/api/annotate.route.test.ts`
- `scripts/compare-search-embeddings.ts`
- `scripts/release-smoke.mjs`
- `scripts/generate-search-artifacts.mjs`
- `scripts/generate-search-graph.ts`

### 工程门禁

- `.eslintrc.json`
- `tsconfig.json`
- `tsconfig.scripts.json`（新增）
- `package.json`
- `package-lock.json`
- `.github/workflows/reboot-mvp-ci.yml`
- `.gitignore`

---

## Task 0: 冻结现状与变更边界

**Files:**

- Create: `docs/qa/2026-07-26-quality-convergence-baseline.md`
- Modify: none

- [ ] **Step 1: 记录 Git 边界**

运行：

```bash
git status --short --branch
git diff --stat
git diff --check
git log -5 --oneline --decorate
```

在 baseline 文档中记录 branch、ahead/behind、tracked modified、untracked 和 `git diff --check` 结果。不要在本步骤执行 stash、reset、clean 或批量 stage。

- [ ] **Step 2: 记录制品头信息**

运行只读脚本，记录：

```bash
node -e 'const fs=require("fs"); const e=JSON.parse(fs.readFileSync("data/embeddings.json","utf8")); const g=JSON.parse(fs.readFileSync("data/search-graph.json","utf8")); const m=JSON.parse(fs.readFileSync("data/corpus-manifest.json","utf8")); console.log({corpusVersion:m.version, corpusFiles:m.files.length, works:Object.keys(m.works).length, embeddingModel:e.model, dimension:e.dimension, embeddings:e.items.length, graphNodes:g.nodes.length, graphEdges:g.edges.length, graphSignature:g.artifactSignature});'
```

Expected: corpus version 为 `guji-core-v1`，works 为 14，embeddings 为 11,829，graph 为 12,825 nodes / 24,084 edges。

- [ ] **Step 3: 记录当前质量证据**

把本计划 2.1 节的实际命令、通过项、失败项、运行日期写入 baseline 文档。明确区分：

- stable pass
- pass after rerun
- incomplete gate
- current blocker

- [ ] **Step 4: 标记不属于本轮的文件**

在 baseline 文档中列出并保护：

- `.codex-screens/`
- `docs/simon-rogers-main-screen-plan/`
- `ref/rysxguji/`
- `docs/qa/a2a-agentic-framework-100-review-package.zip`
- `docs/qa/a2a-agentic-framework-100-review-package/`

这些文件在未单独决定前不得进入 release commit。

- [ ] **Step 5: 提交基线文档**

```bash
git add docs/qa/2026-07-26-quality-convergence-baseline.md
git diff --cached --check
git commit -m "docs(qa): record quality convergence baseline"
```

---

## Task 1: 修复搜索发布契约并分离 Smoke 与 Ranking Gate

**Files:**

- Modify: `tests/fixtures/search-golden-queries.json`
- Modify: `src/lib/search/local-embedding-spec.json`
- Modify: `tests/unit/search/local-embedding.test.ts`
- Modify: `data/embeddings.json`
- Modify: `scripts/release-smoke.mjs`
- Modify: `tests/unit/docs/release-readiness.test.ts`
- Modify: `tests/unit/docs/acceptance-checklist.test.ts`
- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`

- [ ] **Step 1: 先把主查询变成失败的质量测试**

在 `tests/fixtures/search-golden-queries.json` 添加：

```json
{
  "query": "如何面对困境",
  "expectedTop1Ids": ["rysxguji-lunyu-15-2", "rysxguji-mengzi-10-20"],
  "requiredTop3Ids": ["rysxguji-lunyu-15-2", "rysxguji-mengzi-10-20"],
  "bannedTop3Ids": ["rysxguji-zhongyong-1-2", "zhongyong-2-1"],
  "minResults": 3
}
```

语义依据：

- `rysxguji-lunyu-15-2`：`君子固穷，小人穷斯滥矣`
- `rysxguji-mengzi-10-20`：`天将降大任……困於心，衡於虑，而后作`

- [ ] **Step 2: 确认测试先失败**

```bash
npm test -- tests/unit/search/golden-search.test.ts --runInBand
```

Expected: 新增的 `如何面对困境` case 失败，当前错误 Top 1 为 `rysxguji-zhongyong-1-2`；原有 cases 继续通过。

- [ ] **Step 3: 修正已有 hardship concept，不新增专用 query hack**

修改 `src/lib/search/local-embedding-spec.json` 中现有的 `hardship-response` 和 `hardship` anchor：

- 保留 query-side 通用词：`困境`、`挫折`、`逆境`、`艰难`、`压力`。
- 从 hardship expansion 移除会把结果泛化到中庸章节的 `中庸`、`时中`。
- 加入 corpus-side 证据：`君子固穷`、`天将降大任`、`苦其心志`、`困於心`、`动心忍性`、`曾益其所不能`、`不报无道`、`强哉矫`。
- 不得把完整测试句 `如何面对困境` 写入 alias pattern。
- 不改变 anchor 数量，避免仅因本修复改变 embedding dimension。

- [ ] **Step 4: 为 alias 行为补单元测试**

在 `tests/unit/search/local-embedding.test.ts` 证明：

- `困境` 命中 `hardship` label。
- alias expansion 包含 `君子固穷` 和 `天将降大任`。
- expansion 不再自动加入 `中庸` 或 `时中`。
- OOD query 不命中 hardship alias。

- [ ] **Step 5: 重新生成 embedding 制品**

```bash
SEARCH_EMBEDDING_BACKEND=local npm run generate-search-artifacts
```

Expected: 仍为 11,829 items、151 dimensions，只有模型内容和对应生成制品发生预期变化。

- [ ] **Step 6: 运行检索质量门禁**

```bash
npm test -- tests/unit/search/local-embedding.test.ts tests/unit/search/golden-search.test.ts tests/unit/search/diagnostics.test.ts --runInBand
npm run test:search-quality
```

Expected:

- 所有 golden cases 通过，包括新增的主查询。
- `如何面对困境` Top 1 属于两个人工确认 ID 之一，两个 ID 都在 Top 3。
- OOD full = 0，OOD fusion = 0。
- embedding artifact reproducibility = passed。

- [ ] **Step 7: 让 production smoke 只负责链路契约**

修改 `scripts/release-smoke.mjs`：

- 删除 `search.json.data[0]?.id === "lunyu-1-8"`。
- 保留 `200`、`success: true`、非空结果。
- 新增结果结构检查：`id/source/chapter/text` 为非空，`section` 和 `score` 为有限数值。
- 新增 Top 5 ID 不重复检查。
- 继续把实际 Top 1 传给 `/api/annotate`，验证 search -> annotate -> links 完整链路。

原则：production smoke 验证“能否工作”；golden fixture 验证“结果是否正确”。

- [ ] **Step 8: 更新发布文档及其契约测试**

更新：

- `docs/qa/reboot-mvp-release-readiness.md`
- `docs/qa/reboot-mvp-acceptance-checklist.md`
- `tests/unit/docs/release-readiness.test.ts`
- `tests/unit/docs/acceptance-checklist.test.ts`

文档必须明确：

- Smoke 不再固定一个 passage ID。
- `如何面对困境` 的语义排序由 `tests/fixtures/search-golden-queries.json` 和 `npm run test:search-quality` 阻塞。
- 旧的 `top result lunyu-1-8` 仅是 2026-04-29 历史基线，不是扩容后的当前契约。

- [ ] **Step 9: 提交搜索契约修复**

```bash
git add tests/fixtures/search-golden-queries.json \
  src/lib/search/local-embedding-spec.json \
  tests/unit/search/local-embedding.test.ts \
  data/embeddings.json \
  scripts/release-smoke.mjs \
  tests/unit/docs/release-readiness.test.ts \
  tests/unit/docs/acceptance-checklist.test.ts \
  docs/qa/reboot-mvp-release-readiness.md \
  docs/qa/reboot-mvp-acceptance-checklist.md
git diff --cached --check
git commit -m "fix(search): align release query with adversity evidence"
```

---

## Task 2: 消除冷启动测试不稳定

**Files:**

- Create: `tests/helpers/search-index.fixture.ts`
- Modify: `tests/unit/search/graph-store.test.ts`
- Modify: `tests/unit/search/graph-service.test.ts`
- Modify: `tests/unit/search/search-graph-generator.test.ts`
- Modify: `tests/unit/search/diagnostics.test.ts`
- Modify: `tests/unit/annotation/service.test.ts`
- Modify: `tests/integration/api/annotate.route.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 建立轻量 SearchIndex fixture**

创建 `tests/helpers/search-index.fixture.ts`，返回一个类型完整的 `SearchIndex`：

- 至少包含 `lunyu-1-1`、`lunyu-1-2` 及 graph fixture 使用的 passages。
- passage text、textHash、corpusVersion 必须与 `tests/fixtures/search-graph.valid.json` 一致。
- embedding 通过 `buildLocalEmbedding()` 在测试内生成，不提交另一份大型 embedding fixture。
- model 和 dimension 使用 `LOCAL_EMBEDDING_MODEL`、`LOCAL_EMBEDDING_DIMENSION`。

- [ ] **Step 2: 先让 unit graph tests 不读取 11,829 条生产制品**

在以下测试中使用 fixture index，移除每个 test 后不必要的 `clearSearchIndexCache()`：

- `tests/unit/search/graph-store.test.ts`
- `tests/unit/search/graph-service.test.ts`

仍然保留 `clearSearchGraphCache()`，保证不同 graph path 和 required mode 隔离。

- [ ] **Step 3: 保留真正需要全量制品的 integration 行为**

以下 suites 继续使用真实 corpus/embeddings，但在文件顶部显式设置 `jest.setTimeout(15_000)`：

- `tests/unit/search/search-graph-generator.test.ts`
- `tests/unit/search/diagnostics.test.ts`
- `tests/unit/annotation/service.test.ts`
- `tests/integration/api/annotate.route.test.ts`

禁止在 `jest.config.js` 中全局放宽 timeout。普通 unit test 继续使用 Jest 默认 5s，只有明确加载全量 release artifacts 的 suite 获得 15s 上限。

- [ ] **Step 4: 减少同一 suite 内重复生成**

在 `search-graph-generator.test.ts` 中：

- 使用 `beforeAll` 生成一次固定 `generatedAt` 的 artifact。
- 各测试读取同一个只读 artifact 或 defensive clone。
- 仅测试写盘/缓存更新的 case 单独生成。

Expected: 保留 signature、污染检测、节点边完整性和 concept precision 断言，同时减少重复全图生成。

- [ ] **Step 5: 新增稳定性脚本**

在 `package.json` 添加：

```json
"test:stability": "jest --runInBand --no-cache tests/unit/annotation/service.test.ts tests/integration/api/annotate.route.test.ts tests/unit/search/graph-store.test.ts tests/unit/search/graph-service.test.ts tests/unit/search/diagnostics.test.ts tests/unit/search/search-graph-generator.test.ts"
```

- [ ] **Step 6: 连续验证**

```bash
npm run test:stability
npm run test:stability
npm test -- --runInBand --no-cache
npm test -- --runInBand --no-cache
```

Expected:

- 四条命令全部通过。
- 不出现 5s timeout。
- 不通过增加 Jest retry、跳过测试或删除断言达成。

- [ ] **Step 7: 提交测试稳定性修复**

```bash
git add tests/helpers/search-index.fixture.ts \
  tests/unit/search/graph-store.test.ts \
  tests/unit/search/graph-service.test.ts \
  tests/unit/search/search-graph-generator.test.ts \
  tests/unit/search/diagnostics.test.ts \
  tests/unit/annotation/service.test.ts \
  tests/integration/api/annotate.route.test.ts \
  package.json package-lock.json
git diff --cached --check
git commit -m "test: stabilize full-artifact search suites"
```

---

## Task 3: 恢复真实的静态检查范围

**Files:**

- Modify: `.eslintrc.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.scripts.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Move: `scripts/clear-cache.js` -> `scripts/legacy/clear-cache.js`
- Move: `scripts/download-model.js` -> `scripts/legacy/download-model.js`
- Move: `scripts/health-check.js` -> `scripts/legacy/health-check.js`
- Move: `scripts/import-data.js` -> `scripts/legacy/import-data.js`
- Move: `scripts/init-db.js` -> `scripts/legacy/init-db.js`
- Move: `scripts/setup.sh` -> `scripts/legacy/setup.sh`
- Create: `scripts/legacy/README.md`

- [ ] **Step 1: 归档不再支持的旧脚本**

把没有对应 npm script、且依赖 legacy DB/model 路线的六个脚本移入 `scripts/legacy/`。在 `scripts/legacy/README.md` 说明：

- 这些脚本不属于 Reboot MVP。
- 不在 CI 或 release path 中执行。
- 仅保留历史参考价值。

不得给这些脚本重新添加 npm 入口。

- [ ] **Step 2: 修复 ESLint 覆盖盲区**

在 `.eslintrc.json`：

- 删除 `src/lib/search/**` ignore。
- 删除 `scripts/**` ignore。
- 添加精确的 `scripts/legacy/**` ignore。
- 保留主计划明确冻结的 legacy modules ignore。

将 npm scripts 改为 ESLint CLI，避免 `next lint` deprecation：

```json
"lint": "eslint --ext .js,.mjs,.ts,.tsx src tests scripts --max-warnings=0",
"lint:fix": "eslint --ext .js,.mjs,.ts,.tsx src tests scripts --fix --max-warnings=0"
```

- [ ] **Step 3: 恢复 tests TypeScript 检查**

在 `tsconfig.json` 的 `include` 中加入：

```json
"tests/**/*.ts",
"tests/**/*.tsx"
```

不要移除现有 strict flags。

- [ ] **Step 4: 给 active TypeScript scripts 单独配置**

创建 `tsconfig.scripts.json`，继承主配置，并只包含：

- `scripts/compare-search-embeddings.ts`
- `scripts/generate-search-graph.ts`
- `scripts/run-a2a-agentic-framework-100-examples.ts`
- `scripts/run-search-50-iteration.ts`
- `scripts/run-search-50-iteration-suite.ts`

配置使用 Node types、`noEmit: true`，并覆盖父配置对 `scripts/**` 的 exclude。

在 `package.json` 拆分并组合：

```json
"type-check": "npm run type-check:app && npm run type-check:scripts",
"type-check:app": "tsc --noEmit",
"type-check:scripts": "tsc --noEmit -p tsconfig.scripts.json"
```

- [ ] **Step 5: 先运行并修复新增发现**

```bash
npm run type-check
npm run lint
```

Expected: 两条命令都为 0 exit code、0 warning。只修复 active reboot code 和 active scripts；不得通过新增宽泛 ignore 绕过问题。

- [ ] **Step 6: 运行回归**

```bash
npm test -- --runInBand
npm run test:search-quality
```

- [ ] **Step 7: 提交工程门禁**

```bash
git add .eslintrc.json tsconfig.json tsconfig.scripts.json \
  package.json package-lock.json scripts/legacy
git add -u -- scripts/clear-cache.js \
  scripts/download-model.js \
  scripts/health-check.js \
  scripts/import-data.js \
  scripts/init-db.js \
  scripts/setup.sh
git diff --cached --check
git commit -m "chore(tooling): check active reboot code and tests"
```

---

## Task 4: 把搜索质量与制品复现加入 CI

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/reboot-mvp-ci.yml`
- Create: `tests/unit/tooling/ci-contract.test.ts`
- Modify: `docs/qa/reboot-mvp-release-readiness.md`

- [ ] **Step 1: 先写 CI 契约测试**

创建 `tests/unit/tooling/ci-contract.test.ts`，读取 workflow 和 `package.json`，断言：

- CI 运行 `npm run generate:release-artifacts`。
- CI 对 `data/embeddings.json` 和 `data/search-graph.json` 执行 `git diff --exit-code`。
- CI 运行 `npm run test:search-quality`。
- CI 运行完整 Jest。
- CI 运行 build 和 production smoke。

运行：

```bash
npm test -- tests/unit/tooling/ci-contract.test.ts --runInBand
```

Expected: 当前 workflow 缺少这些契约，测试先失败。

- [ ] **Step 2: 添加统一制品生成入口**

在 `package.json` 添加：

```json
"generate:release-artifacts": "npm run generate-search-artifacts && npm run generate-search-graph"
```

- [ ] **Step 3: 修改 CI 顺序**

`.github/workflows/reboot-mvp-ci.yml` 的 verify job 固定为：

1. `npm ci`
2. `npm run generate:release-artifacts`
3. `git diff --exit-code -- data/embeddings.json data/search-graph.json`
4. `npm run type-check`
5. `npm run lint`
6. `npm test -- --runInBand --no-cache`
7. `npm run test:stability`
8. `npm run test:search-quality`
9. `npm run build`
10. prepare standalone runtime
11. production smoke

`SEARCH_EMBEDDING_BACKEND=local` 继续固定在 CI env。

- [ ] **Step 4: 证明 graph generator 可复现**

```bash
npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
```

Expected: 生成结果与提交制品 byte-for-byte 一致；graph 相同 signature 时保留 `generatedAt`。

- [ ] **Step 5: 运行 CI 契约与本地等价门禁**

```bash
npm test -- tests/unit/tooling/ci-contract.test.ts --runInBand
npm run type-check
npm run lint
npm test -- --runInBand --no-cache
npm run test:stability
npm run test:search-quality
```

- [ ] **Step 6: 更新发布文档**

在 `docs/qa/reboot-mvp-release-readiness.md` 中把 CI 描述更新为真实顺序，并明确：

- embeddings 和 graph 都必须可复现。
- search-quality 是阻塞门禁。
- production smoke 不代替 ranking quality。

- [ ] **Step 7: 提交 CI 收敛**

```bash
git add package.json package-lock.json \
  .github/workflows/reboot-mvp-ci.yml \
  tests/unit/tooling/ci-contract.test.ts \
  docs/qa/reboot-mvp-release-readiness.md
git diff --cached --check
git commit -m "ci: gate search quality and release artifacts"
```

---

## Task 5: 重建“回归集 / Holdout”证据分级

**Files:**

- Move: `tests/fixtures/search-blind-generalization-cases.json` -> `tests/fixtures/search-tuned-paraphrase-regression-cases.json`
- Move: `docs/qa/search-blind-generalization-baseline-report.md` -> `docs/qa/search-tuned-paraphrase-regression-baseline-report.md`
- Move: `docs/qa/search-blind-generalization-baseline-results.json` -> `docs/qa/search-tuned-paraphrase-regression-baseline-results.json`
- Move: `docs/qa/search-blind-generalization-report.md` -> `docs/qa/search-tuned-paraphrase-regression-report.md`
- Move: `docs/qa/search-blind-generalization-results.json` -> `docs/qa/search-tuned-paraphrase-regression-results.json`
- Create: `docs/qa/search-quality-methodology.md`
- Create after search freeze: `tests/fixtures/search-holdout-v1.json`
- Create after one-shot evaluation: `docs/qa/search-holdout-v1-results.json`
- Create after one-shot evaluation: `docs/qa/search-holdout-v1-report.md`

- [ ] **Step 1: 诚实重分类已有 30/30**

现有 25 个“blind”查询已经被 `src/lib/search/local-embedding-spec.json` 的 alias patterns 直接覆盖，因此：

- 文件和标题统一改为 `tuned paraphrase regression`。
- case category 从 `blind` 改为 `tuned-regression`。
- 保留 baseline 0/25 与当前 25/25，作为“调优前后”的有效证据。
- 不再把 30/30 描述为 unseen generalization。

- [ ] **Step 2: 编写质量方法文档**

`docs/qa/search-quality-methodology.md` 固定四层证据：

1. Unit behavior：token、alias、fusion、evidence guard。
2. Golden regression：可见且允许持续维护。
3. Tuned paraphrase regression：证明已解决问题不会回归，但不证明泛化。
4. Frozen holdout：搜索代码冻结后一次性评估，不允许看结果后继续针对 v1 调参。

- [ ] **Step 3: 冻结搜索实现 SHA**

完成 Task 1 至 Task 4 后运行：

```bash
git rev-parse HEAD
git diff --exit-code -- src/lib/search data/embeddings.json data/search-graph.json
```

把 SHA 写入 `docs/qa/search-quality-methodology.md` 的 holdout ledger。

- [ ] **Step 4: 创建真正的 holdout v1**

这是本计划唯一需要产品/评审者独立输入的 checkpoint。由未参与本轮 alias 调参的人，在搜索 SHA 冻结后创建 30 个 case：

- 24 个 in-domain 现代中文真实意图。
- 6 个 OOD 查询。
- 不复用 golden、50-query 或 tuned paraphrase 的完整句子。
- 每个 in-domain case 只写语义可接受的 Top 3 passage IDs 或 source contract。
- 不修改 `src/lib/search/**` 和 `data/embeddings.json` 后再重跑 v1。

- [ ] **Step 5: 一次性运行 holdout**

```bash
npm exec tsx scripts/run-search-50-iteration-suite.ts -- \
  --cases tests/fixtures/search-holdout-v1.json \
  --json docs/qa/search-holdout-v1-results.json \
  --markdown docs/qa/search-holdout-v1-report.md \
  --title "Search Frozen Holdout v1"
```

Acceptance:

- in-domain 至少 19/24 通过。
- 6/6 OOD 返回空。
- 报告记录 frozen SHA、artifact signature 和执行时间。

若不通过：保留 v1 结果，返回新的搜索改进周期；修复后必须创建新的 holdout v2，禁止把 v1 改成通过。

- [ ] **Step 6: 提交质量证据**

```bash
git add tests/fixtures/search-tuned-paraphrase-regression-cases.json \
  docs/qa/search-tuned-paraphrase-regression-baseline-report.md \
  docs/qa/search-tuned-paraphrase-regression-baseline-results.json \
  docs/qa/search-tuned-paraphrase-regression-report.md \
  docs/qa/search-tuned-paraphrase-regression-results.json \
  docs/qa/search-quality-methodology.md \
  tests/fixtures/search-holdout-v1.json \
  docs/qa/search-holdout-v1-results.json \
  docs/qa/search-holdout-v1-report.md
git add -u -- tests/fixtures/search-blind-generalization-cases.json \
  docs/qa/search-blind-generalization-baseline-report.md \
  docs/qa/search-blind-generalization-baseline-results.json \
  docs/qa/search-blind-generalization-report.md \
  docs/qa/search-blind-generalization-results.json
git diff --cached --check
git commit -m "docs(qa): separate tuned regression from frozen holdout"
```

---

## Task 6: 整理仓库、制品与文档事实来源

**Files:**

- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `data/rysxguji/README.md`
- Modify: `docs/rysxguji-local-corpus/IMPLEMENTATION_PLAN.md`
- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`
- Review: all current modified and untracked paths

- [ ] **Step 1: 固定“应提交 / 不应提交”边界**

应进入版本控制：

- `data/rysxguji/guji-core-v1.jsonl`
- `data/rysxguji/provenance-v1.jsonl`
- `data/rysxguji/sources.json`
- `data/embeddings.json`
- `data/search-graph.json`
- 可复现生成脚本、搜索实现、测试、规范化 QA 报告。

不进入 release commit：

- `.codex-screens/`
- `ref/rysxguji/`
- `docs/qa/a2a-agentic-framework-100-review-package.zip`
- `docs/qa/a2a-agentic-framework-100-review-package/`
- `docs/simon-rogers-main-screen-plan/`

在 `.gitignore` 添加精确规则；不得用 `docs/**`、`data/**` 或 `ref/**` 等宽泛规则。

- [ ] **Step 2: 验证 corpus provenance**

运行：

```bash
node -e 'const fs=require("fs"); const corpus=fs.readFileSync("data/rysxguji/guji-core-v1.jsonl","utf8").trim().split(/\\r?\\n/).map(JSON.parse); const provenance=fs.readFileSync("data/rysxguji/provenance-v1.jsonl","utf8").trim().split(/\\r?\\n/).map(JSON.parse); const ids=new Set(corpus.map(x=>x.id)); const provenanceIds=new Set(provenance.map(x=>x.id)); console.log({corpus:corpus.length, provenance:provenance.length, duplicateIds:corpus.length-ids.size, missingProvenance:[...ids].filter(id=>!provenanceIds.has(id)).length});'
```

Expected:

- duplicateIds = 0。
- missingProvenance = 0。
- corpus 与 provenance 数量关系在文档中解释清楚。

- [ ] **Step 3: 更新 README 到当前真实入口**

`README.md` 必须：

- 使用 Next.js 15，而不是旧 Next.js 14 描述。
- 把当前状态改为“quality/release convergence”，完成 Task 7 后才能改为 Release Candidate。
- 删除不存在的 npm commands：`health-check`、`download-model`、`init-db`、`import-data`、`setup`、`db:reset`、`cache:clear`。
- 保留唯一 Quick Start：install -> generate release artifacts -> dev。
- 增加标准验证命令：type-check、lint、Jest、stability、search-quality、build、release smoke。
- 说明本地 corpus 和请求时不访问 Daizhige。

- [ ] **Step 4: 更新 corpus 和 release 文档**

同步：

- 14 works。
- 11,829 passages / embeddings。
- graph node/edge 数。
- corpus regeneration 命令。
- `test:search-quality` 和 artifact diff gate。
- tuned regression 与 frozen holdout 的区别。

- [ ] **Step 5: 按职责审查当前 dirty diff**

只使用精确路径 stage，按以下提交职责拆分：

1. Corpus acquisition、manifest、provenance、corpus loader/tests。
2. Search model、evidence、ranking、quality fixtures/scripts/results。
3. Graph artifact 和 graph fixture。
4. A2A / annotation cache 补充及其 QA。
5. Tooling、CI、release docs。

同一文件若跨职责，先用 `git diff -- <file>` 审查，再用交互式 hunk staging；不得 `git add -A`。

- [ ] **Step 6: 检查文件模式与噪声**

```bash
git diff --summary
git diff --check
git status --short
```

Expected:

- active executable scripts 保持正确 executable mode。
- archived `scripts/legacy/setup.sh` 不作为 active executable 入口。
- release diff 无 `.codex-screens`、review package、采集缓存和无关 UI plan。

- [ ] **Step 7: 提交仓库与文档收敛**

```bash
git add .gitignore README.md data/rysxguji/README.md \
  docs/rysxguji-local-corpus/IMPLEMENTATION_PLAN.md \
  docs/qa/reboot-mvp-release-readiness.md \
  docs/qa/reboot-mvp-acceptance-checklist.md
git diff --cached --check
git commit -m "docs: align repository with reboot release path"
```

其余既有 dirty changes 按 Step 5 的职责提交，不得混成单个“everything” commit。

---

## Task 7: 在 Clean Worktree 中完成最终发布验收

**Files:**

- Modify: `docs/qa/reboot-mvp-release-readiness.md`
- Modify: `docs/qa/reboot-mvp-acceptance-checklist.md`
- Modify: `docs/qa/2026-07-26-quality-convergence-baseline.md`

- [ ] **Step 1: 确认 release commit 可独立检出**

```bash
git status --short
git log --oneline --decorate -10
```

Expected: release 相关文件均已提交；工作区中若仍有用户的无关文件，它们不在 release commit。

- [ ] **Step 2: 检查磁盘**

```bash
df -h .
```

Hard stop:

- 可用空间低于 4 GiB 时不得在本机新建完整 `node_modules` 并执行 build。
- 先由用户确认可删除的缓存或改用干净 CI runner；不得擅自删除 workspace、node_modules 或其他项目数据。

- [ ] **Step 3: 创建 detached 验证 worktree**

```bash
release_source_dir="$(pwd)"
release_verify_root="$(mktemp -d "${TMPDIR:-/tmp}/infidao-release-verify.XXXXXX")"
release_verify_dir="$release_verify_root/worktree"
git worktree add --detach "$release_verify_dir" HEAD
cd "$release_verify_dir"
```

该 worktree 只验证当前 commit，不带入原工作区未提交文件。

- [ ] **Step 4: 从零安装并检查制品**

```bash
npm ci
SEARCH_EMBEDDING_BACKEND=local npm run generate:release-artifacts
git diff --exit-code -- data/embeddings.json data/search-graph.json
```

Expected: install 成功，生成制品无 diff。

- [ ] **Step 5: 运行全部自动门禁**

```bash
npm run type-check
npm run lint
npm test -- --runInBand --no-cache
npm test -- --runInBand --no-cache
npm run test:stability
npm run test:stability
npm run test:search-quality
npm run build
```

Expected: 所有命令 0 exit code；无 lint warning；无 test timeout；build 完成。

- [ ] **Step 6: 运行 standalone production smoke**

```bash
mkdir -p .next/standalone/data
cp -R data/. .next/standalone/data/
rm -rf .next/standalone/.next/static
cp -R .next/static .next/standalone/.next/static
if [ -d public ]; then cp -R public .next/standalone/public; fi
PORT=3001 HOSTNAME=127.0.0.1 node .next/standalone/server.js > /tmp/infidao-release-smoke.log 2>&1 &
server_pid=$!
SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:release
```

Expected:

- `/api/health` 200。
- 首页和静态 JS assets 200。
- `/api/search` 返回结构有效且非空。
- 实际 Top 1 可继续完成 `/api/annotate`。
- annotation 包含 `sixToMe`、`meToSix` 和 links。
- production 内部 telemetry route 404。
- legacy `/api/embed` 410。

- [ ] **Step 7: 人工桌面与移动验收**

在当前 standalone server 上人工检查：

Desktop：1440px 宽。
Mobile：390px 宽。

两种视口都完成：

1. 首页输入 `如何面对困境`。
2. 看到语义合理的搜索结果。
3. 选择结果并看到两种 annotation copy。
4. 点击 link 进入第 2 层。
5. Back 返回第 1 层。
6. 选择新的 root result 后 stack 重置。
7. 错误态可以重试，页面无白屏。

只把文字结果写入 QA 文档；本地截图不进入 Git。

- [ ] **Step 8: 处理 telemetry 状态**

若没有有效 provider 凭据：

- 保留 2026-04-29 已接受的 timeout/fallback 例外。
- 验证 deterministic fallback 仍正常。
- 不伪造“canonical telemetry passed”。

若有有效 provider 凭据，再单独运行：

```bash
PORT=3002 npm run dev -- --hostname 127.0.0.1 --port 3002 > /tmp/infidao-telemetry-smoke.log 2>&1 &
telemetry_server_pid=$!
SMOKE_BASE_URL=http://127.0.0.1:3002 npm run smoke:telemetry
kill "$telemetry_server_pid"
wait "$telemetry_server_pid" 2>/dev/null || true
```

Telemetry route 只在 dev/test 返回数据，因此不得把该命令指向 production standalone server。凭据只通过当前 shell 环境注入，不写入命令、日志或 QA 文档；记录真实结果和 provider slot 状态即可。

- [ ] **Step 9: 停止服务并移除临时 worktree**

先确认 detached worktree 没有意外变化，再回到原仓库：

```bash
kill "$server_pid"
wait "$server_pid" 2>/dev/null || true
git status --short
cd "$release_source_dir"
git worktree remove "$release_verify_dir"
rmdir "$release_verify_root"
```

Expected: detached worktree 的 `git status --short` 为空。若存在变化，停止并审查；不得使用 `git worktree remove --force`。

- [ ] **Step 10: 更新最终签署**

在三个 QA 文档写入：

- 验证 commit SHA。
- Node/npm 版本。
- artifact signature。
- 每条命令结果。
- desktop/mobile 人工结果。
- telemetry 结果或已接受例外。
- 最终决定：`release candidate` 或 `blocked`。

只有全部 P0 条件通过时才写 `release candidate`。

- [ ] **Step 11: 验证并提交发布签署**

```bash
npm test -- tests/unit/docs/release-readiness.test.ts tests/unit/docs/acceptance-checklist.test.ts --runInBand
git add docs/qa/reboot-mvp-release-readiness.md \
  docs/qa/reboot-mvp-acceptance-checklist.md \
  docs/qa/2026-07-26-quality-convergence-baseline.md
git diff --cached --check
git commit -m "docs(release): sign off converged reboot candidate"
```

---

## 6. 最终验收矩阵

| Gate                     | 命令/证据                                                     | Release 标准                                    |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------- |
| Artifact reproducibility | `npm run generate:release-artifacts` + `git diff --exit-code` | embeddings、graph 无 diff                       |
| Type safety              | `npm run type-check`                                          | app、tests、active scripts 全绿                 |
| Lint                     | `npm run lint`                                                | `src`、`tests`、active scripts 0 warning/error  |
| Unit/integration         | `npm test -- --runInBand --no-cache`                          | 全部通过                                        |
| Flake resistance         | `npm run test:stability` 连续两次                             | 两次都通过，无 timeout                          |
| Search regression        | `npm run test:search-quality`                                 | 全部 golden；OOD full/fusion 为 0               |
| Main-query semantics     | golden fixture + 人工检查                                     | adversity passages 进入 Top 3                   |
| Holdout                  | frozen v1 report                                              | in-domain ≥19/24，OOD 6/6 empty                 |
| Build                    | `npm run build`                                               | 成功，无 `ENOSPC`                               |
| Production path          | `npm run smoke:release`                                       | health/search/annotate/links/legacy guards 全绿 |
| Desktop                  | 手工 1440px                                                   | root -> child -> back -> reset 全绿             |
| Mobile                   | 手工 390px                                                    | 主路径可用、无横向溢出/白屏                     |
| Repository               | release diff review                                           | 无本地缓存、重复 review package、无关计划       |
| Documentation            | README + QA docs                                              | 命令、版本、状态、例外与代码一致                |

## 7. Stop Conditions

出现以下任一情况必须停止签署：

- `如何面对困境` 仍由泛化中庸结果占据 Top 1/Top 3，且人工认为语义不合格。
- 任一完整 Jest 或 stability run 失败。
- 为通过测试而添加全局高 timeout、retry 或 skip。
- embeddings 或 graph 重新生成后出现未解释 diff。
- lint 仍忽略 `src/lib/search/**`。
- clean worktree 无法 build 或 production smoke 失败。
- 本机 clean-worktree 验证时可用磁盘低于 4 GiB，且没有可用的干净 CI runner。
- release diff 混入无关用户文件或来源不明的数据。
- Holdout 结果被用于继续针对 v1 调参后，又被宣称为 blind。

## 8. Rollback Strategy

- 搜索语义修复只改现有 hardship anchors；若引发既有 golden/OOD 回归，回退该独立 commit，不回退 corpus expansion。
- Smoke contract 与 ranking gate 分开提交；若 smoke 脚本结构校验有问题，可单独回退，不修改搜索排序。
- Test fixture 和 timeout 变更独立提交；禁止通过回退断言来恢复绿色。
- Generated artifacts 与源代码同 commit 或紧邻 commit，回退时必须同时回退对应 spec/artifact。
- CI 变更独立提交，便于在 workflow 语法故障时恢复，但不得长期移除 search-quality gate。
- 不使用 `git reset --hard` 或批量清理用户工作区。

## 9. Post-release Backlog

以下项目有价值，但不阻塞本次收敛：

- 为 search、annotation、A2A 关键模块建立有意义的 branch coverage 基线，再决定 threshold。
- 给 corpus builder 增加 duplicate hash 报告和 provenance lookup utility。
- 评估大型 JSON embedding 的流式加载、二进制格式或后续 vector backend。
- 评估 Graph diagnostics 的可观测性，但继续不影响公开排序。
- 在获得单独授权后，把关键桌面/移动验收转为 Playwright。
- 单独评审 Simon Rogers 主屏方案，不与发布收敛混合。
- 重新评估 telemetry provider 延迟预算和已接受例外。

## 10. 执行授权边界

本文件只完成设计与执行拆解，不自动授权：

- 启动 agent 或并行 worktree。
- 修改代码。
- 删除用户文件或缓存。
- commit、push 或创建 PR。

开始实施前应由用户另行确认执行范围；实施时严格按 Task 0 -> Task 7 顺序推进。
