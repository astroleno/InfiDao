# InfiDao 新分支重启方案（SUPERPOWERS 流程）

Created: 2026-04-23
Updated: 2026-04-24
Status: active
Decision type: reboot plan

## 0. 文档状态与唯一事实来源

自 `2026-04-24` 起，重启主线只认以下两份 active 文档：

- `docs/SUPERPOWERS_REBOOT_PLAN.md`
- `docs/plans/reboot-mvp-implementation-plan.md`

执行规则：

- 任何 API、类型、阶段、目录、运行形态、验收标准，如与其他文档冲突，一律以上述两份文档为准。
- 除非某文档在文件头明确标注自己已于 `2026-04-24` 之后被重新激活，否则 `docs/` 下其他文档默认视为 legacy reference，不得作为当前重启实现依据。
- `QUICK_START`、`API_REFERENCE`、`SYSTEM_ARCHITECTURE`、`DATABASE_DESIGN`、`COMPONENT_ARCHITECTURE`、`IMPLEMENTATION_SUMMARY`、`TODO`、`MVP_DEVELOPMENT_GUIDE`、`MVP_PLAN` 当前均只保留历史参考价值。

## 1. 结论

本次不在现有实现上继续修补，而是采用“保留旧实现、在新分支上重建 MVP 主线”的策略。

执行方式：
- 当前实现冻结为 `legacy` 线，作为历史资产和参考仓。
- 新工作在一条全新的重启分支上推进，建议分支名为 `codex/reboot-mvp`.
- 新分支只保留一条清晰主线：`query -> search -> annotation/explain -> wiki explore`.

这样做的目标不是推倒重来，而是避免继续在“多套实现并存、接口契约分叉、文档与代码不一致”的状态上叠加复杂度。

## 2. 背景与问题

当前仓库存在以下结构性问题：

- `src/lib` 中同时存在文件版和目录版服务实现，例如 `src/lib/db.ts` 与 `src/lib/db/index.ts`，`src/lib/embed.ts` 与 `src/lib/embed/index.ts`，`src/lib/llm.ts` 与 `src/lib/llm/index.ts`。
- API route 依赖的导出与实际命中的模块不一致，导致 `type-check` 失败，许多能力“看起来存在，实际上不可用”。
- 搜索、注释、图谱三个子系统各自有组件骨架，但主页面没有真正把它们接成闭环。
- 注释请求协议、流式响应协议、数据导入字段协议彼此不一致。
- 文档层明确提出了 JSON-first MVP 路线，但代码层又混入了重型 LanceDB 路线，造成实现目标漂移。

这些问题说明当前仓库不是“功能没做完”，而是“事实来源不唯一”。继续修补会把时间花在识别哪套实现才是真正基线，而不是推进用户可感知的 MVP。

## 3. 目标与非目标

### 3.1 本次重启目标

- 在新分支上建立唯一可信实现。
- 在 2 到 3 周内跑通最小闭环。
- 保留旧项目中有价值的 UI、数据、提示词和文档资产。
- 为后续从 JSON-first 平滑切换到 LanceDB 或 pgvector 预留抽象层，但不在第一阶段提前实现。

### 3.2 本次非目标

- 不在第一阶段恢复所有旧文档承诺的高级能力。
- 不在第一阶段实现复杂的多级缓存体系。
- 不在第一阶段实现完整知识图谱布局引擎。
- 不在第一阶段做多提供商、多环境、多数据库并行支持。
- 不以“保留旧代码量”为目标。

## 4. SUPERPOWERS 流程定义

本仓库当前没有现成的 `superpowers` 模板，因此本文件定义本次重启采用的正式流程。后续所有与新分支重启相关的工作，都以本流程为标准。

### S - Scope Reset

重新定义范围，只保留一条用户主路径：
- 输入一句现代汉语
- 命中 3 到 5 条相关经典
- 选择一条生成注释
- 从注释中的关联点继续探索

### U - Understand Legacy

系统性阅读旧实现，只保留可复用资产，不继承旧结构问题。

### P - Preserve Assets

将当前实现冻结到 `legacy` 线，避免历史资产丢失。

### E - Establish Clean Foundation

在新分支上建立唯一目录结构、唯一服务入口、唯一 API 协议、唯一类型定义。

### R - Rebuild The MVP Path

按主路径从搜索到注释到探索逐段重建，不做并行大爆炸。

### P - Prove Contracts

优先验证接口契约、状态流、数据字段和最小端到端场景，而不是优先做视觉扩展。

### O - Optimize Interaction

在主路径打通之后，集中优化搜索输入、加载态、流式生成和探索切换的流畅性。

### W - Write Guardrails

恢复基础工程护栏：
- `type-check`
- `lint`
- 核心路径测试
- 最小健康检查

### E - Expand Safely

新能力只在主路径稳定后增量进入，例如筛选、排序、收藏、分享、复杂图谱视图。

### R - Release Gating

所有阶段都需要明确验收条件，未过门槛不进入下一阶段。

### S - Sunset Legacy Dependence

当新分支达到可用状态后，旧实现只保留为参考，不再作为开发主线。

## 5. 分支策略

### 5.1 推荐分支结构

- `main`
  仅保留稳定文档和最终合并结果，不再直接承接重启开发。
- `legacy/pre-reboot-2026-04-23`
  保存当前实现快照，后续只读参考。
- `codex/reboot-mvp`
  新分支主线，承载 MVP 重建。

### 5.2 旧实现处理原则

- 不删除旧实现中的历史文档与参考目录。
- 不在新分支里继承旧 `src/lib` 双轨结构。
- 不直接复制旧 API route 作为基础。
- 旧实现中只有“资产”可以搬，“架构”默认不继承。

### 5.3 新分支命名原则

推荐命名：

```text
codex/reboot-mvp
```

如果后续需要拆阶段，可继续使用：

```text
codex/reboot-mvp-phase-1
codex/reboot-mvp-phase-2
```

## 6. 新分支产品范围

### 6.1 必做能力

- 首页输入框
- 搜索请求与结果列表
- 结果卡片
- 注释面板
- 流式或准流式生成
- 关联探索入口
- 最小 wiki 侧栏或抽屉视图

### 6.2 可延后能力

- 排序器
- 筛选器
- 加载更多
- 收藏
- 分享
- 复杂图谱布局
- 时间轴视图
- 多主题切换

### 6.3 用户闭环定义

以下场景全部成功，才算 MVP 闭环成立：

1. 用户输入一句现代问题或感受。
2. 系统返回相关经典段落。
3. 用户点击一条结果生成注释。
4. 右侧注释面板展示 `六经注我` 和 `我注六经`。
5. 用户点击一个关联入口进入下一层探索。

## 7. 技术策略

### 7.1 首阶段技术方向

新分支采用 JSON-first 路线。

理由：
- 当前文档已经多次确认 JSON-first 是 MVP 真实目标。
- JSON-first 更适合快速验证搜索与注释闭环。
- 它能减少 LanceDB、缓存、多表 schema 同时带来的调试面。
- 后续若确实出现第二种搜索后端，再提取 `SearchProvider` 抽象；第一阶段不提前抽象。

### 7.2 首阶段统一技术栈

- 前端：Next.js 14 App Router
- UI：React 18 + Tailwind CSS
- 搜索：本地 JSON embeddings + 内存 Top-K
- 解释/注释：单一 LLM provider 适配层
- 状态：先局部状态，必要时再引入精简 store
- 类型：`src/types` 单一事实来源

### 7.3 首阶段明确放弃

- 不同时支持两套 DB provider
- 不同时支持两套 LLM service
- 不同时支持两套 stream 协议
- 不同时支持文件版和目录版服务入口

## 8. 前端 / 后端 / 端口拆分视图

为避免新分支再次回到“页面、服务、协议同时漂移”的状态，本次重启不只按目录拆分，还要按职责拆分。新分支以三个维度组织：

- 前端：负责用户主路径、状态切换与交互体验。
- 后端：负责数据读取、搜索、注释生成与健康检查。
- 端口与接口：负责边界、契约与运行入口，保证前后端不会再次各说各话。

### 8.1 前端部分

#### 8.1.1 前端职责

前端只服务于一条主路径：

1. 用户输入一句现代汉语。
2. 页面展示 3 到 5 条搜索结果。
3. 用户点击一条结果生成注释。
4. 页面在固定区域展示 `六经注我` / `我注六经`。
5. 用户从 link 或关键词继续进入下一层探索。

前端不再承担“替后端猜协议”或“兼容多套状态流”的责任。

#### 8.1.2 前端布局原则

- 桌面端优先采用两栏结构：左侧搜索与结果，右侧注释与探索。
- 移动端优先采用单栏 + 抽屉或底部面板，不强行保留桌面双栏。
- 首页不再以营销页为主，而是以可立即开始搜索的输入区为主。
- 搜索前、搜索中、搜索成功、搜索为空、搜索失败、注释生成中、注释完成、探索展开，全部必须有独立视觉状态。
- 页面上不保留“能点但没接线”的入口。
- 移动端抽屉或底部面板至少满足以下可访问性要求：打开后焦点进入面板标题或首个可操作元素，支持 `Esc` 或系统返回关闭，主要触控目标不小于 `44x44px`，并为面板标题与关闭按钮提供可读屏名称。

#### 8.1.3 前端设计照搬原则

新分支前端以当前 Next.js 工程作为生产运行骨架，但 Stage 2 起的 UI/UX source of truth 是 `ref/infidao---six-classics-annotate-me`。

执行判断：
- 设计、布局、文案节奏、视觉层级、交互意图应尽量按旧版照搬。
- 工程实现、数据流、API 契约、可访问性与移动端约束必须按当前 Next.js MVP 重建。
- 若当前页面与旧版体验冲突，默认旧版体验胜出；只有在旧版机制破坏 MVP 主路径、可访问性或移动端稳定性时才调整。

必须保留的旧版设计特征：

- 首屏输入区的专注感与沉浸式视觉氛围。
- 注释内容的排版层次：出处、原文、注疏、发散点。
- 关键词可点击继续探索的交互。
- 探索轨迹的可视化呈现。
- 生成态的背景层、呼吸感、渐进式显现。

前端明确不继承以下机制：

- 自动无限续写。
- 自动滚屏主舞台。
- 前端直连模型服务。
- 与 MVP 主路径无关的复杂图谱视图。

#### 8.1.4 前端第一阶段实施边界

- 使用 `src/app/page.tsx` 作为唯一页面入口。
- 使用 `src/components/search`、`src/components/annotation`、`src/components/wiki` 作为唯一主组件域。
- 状态先放在页面局部，不预设 Zustand 全局 store 为前提。
- 首阶段不做登录、收藏、分享、学习社区等外围页面。

### 8.2 后端部分

#### 8.2.1 后端职责

后端负责以下最小能力：

- 接收搜索请求并返回结果列表。
- 接收注释请求并返回一次性的结构化 JSON 注释结果。
- 在注释响应的 `links` 字段中附带下一跳探索所需的最小 passage 信息。
- 返回最小健康检查状态。

后端不再承担以下职责：

- 同时兼容 JSON-first 与 LanceDB 双实现。
- 同时维护多套 LLM provider 逻辑。
- 同时输出 SSE 与裸 JSON 混合流。
- 暴露超出 MVP 主路径的复杂 API 面。

#### 8.2.2 后端实现原则

- 新分支仍然使用 Next.js App Router route handlers，不拆独立 Node 服务。
- `src/app/api` 是唯一 HTTP 入口。
- `src/lib` 只保留目录版入口，不再保留文件版与目录版并存。
- 数据源以 `data/` 下的 corpus 与 embeddings 文件为准。
- 搜索先通过 JSON embeddings + 内存 Top-K 完成。
- 注释先通过单一 LLM 适配层完成。
- `health` route 只检查 MVP 真正依赖的能力，不再假装检查尚未接入的子系统。

#### 8.2.3 后端最小能力边界

第一阶段后端仅保留 3 个公开 HTTP 能力：

- `POST /api/search`
- `POST /api/annotate`
- `GET /api/health`

`/api/embed` 不属于新分支 MVP 主路径。若仍保留，也只应作为开发或离线准备能力，不得成为首页闭环的运行前提。

探索第一版不额外新增公开 `/api/explore` endpoint。

原因：
- MVP 的探索入口来自 `POST /api/annotate` 返回的 `links`。
- 每个 link 必须自带重新发起下一次注释所需的最小字段。
- `CorpusPort` 在第一版只作为服务端内部能力存在，不直接暴露给前端。

#### 8.2.4 后端内部模块边界

建议按以下边界实现：

- `lib/data`：负责读取 corpus、embeddings、passage 索引。
- `lib/search`：负责 Top-K 检索与结果整形。
- `lib/annotation`：负责 prompt 组装、结构化结果与 link 生成。
- `lib/wiki`：负责探索节点装配、栈式探索辅助与叶子节点判定，不新增公开 endpoint。
- `lib/llm`：负责单一 provider 调用。
- `lib/health` 或最薄 `health route`：负责 MVP 真实依赖项的最小健康检查，不承担系统全量巡检职责。
- `lib/utils`：负责错误、日志、流消费辅助。

边界对齐原则：

- `CorpusPort` 是逻辑边界，不等于必须单独创建一个 `lib/corpus` 目录。
- 第一版可由 `lib/data` + `lib/wiki` 共同支撑 `CorpusPort` 的读取与探索能力。
- `HealthPort` 在 phase 1 可以先由 route 内最薄实现承接，只有在第二个调用方出现后再独立抽出 service。

### 8.3 端口与接口部分

本节中的“端口”同时指两类边界：

- 运行端口：进程和反向代理使用的网络端口。
- 应用端口：前端、route、服务之间的稳定调用边界。

#### 8.3.1 运行端口约定

- 本地开发默认只启动一个 Next.js 应用端口：`3000`。
- 生产反向代理可暴露 `80` / `443`，但不改变应用内部单端口事实。
- Redis 默认端口为 `6379`，但在 MVP 首阶段不是必需依赖。
- 新分支不额外拆一个“前端端口 + 后端端口”的双服务形态，避免无意义部署复杂度。

#### 8.3.2 应用端口（Ports）约定

新分支应显式建立以下应用端口，作为内部稳定边界：

- `SearchPort`
  负责根据 query 返回统一格式的搜索结果。
- `AnnotationPort`
  负责根据 query + passage 返回统一格式的结构化注释结果。
- `CorpusPort`
  负责在服务端内部通过 passageId 读取原文、关联信息与探索节点。
- `HealthPort`
  负责对 MVP 依赖项做最小健康检查。

这些 Ports 是逻辑边界，不要求在 phase 1 就先拆成 `lib/ports/*.ts` 独立文件。

落地原则：
- 先把输入输出契约写清楚。
- 第一调用方阶段可先用最薄的 service 模块实现。
- 只有在第二个调用方出现，或跨层耦合开始扩散时，再把逻辑边界抽成独立 ports 文件。

route handler 不应直接跨层拼装底层实现细节。

#### 8.3.3 HTTP 接口约定

公开 HTTP 接口只保留以下契约：

- `POST /api/search`
- `POST /api/annotate`
- `GET /api/health`

这些接口必须满足：

- 请求字段命名统一，不混用 `top_k` / `topK`、`passage_id` / `passageId` 等双写法。
- 响应字段命名统一，由 `src/types/index.ts` 提供唯一事实来源。
- MVP 第一版不启用服务端流式注释。
- 所有接口最少具备请求校验与结构化错误响应。
- link 点击默认复用 `POST /api/annotate`，不引入额外公开 explore endpoint。

#### 8.3.4 未来流式升级约定

phase 1 到 phase 4 以一次性 JSON 响应为准，页面生成态通过前端准流式表现完成。

如果 phase 5 之后决定引入真实流式，唯一允许的协议是 NDJSON：

- 每一行必须是一个完整 JSON 对象。
- 行级事件类型固定，避免运行时猜测。
- 前端按单一消费者实现解析，不再兼容 SSE 混合协议。

## 9. 目标目录结构

新分支建议以如下结构为准：

```text
src/
  app/
    api/
      search/
        route.ts
      annotate/
        route.ts
      health/
        route.ts
    page.tsx
    globals.css
  components/
    search/
      SearchBar.tsx
      SearchResults.tsx
      ResultCard.tsx
    annotation/
      AnnotationPanel.tsx
      StreamingText.tsx
    wiki/
      WikiPanel.tsx
    layout/
      Header.tsx
      Footer.tsx
  lib/
    search/
      service.ts
      json.ts
    annotation/
      service.ts
      prompt.ts
    wiki/
      service.ts
    llm/
      index.ts
    data/
      corpus.ts
      embeddings.ts
    utils/
      errors.ts
      logging.ts
  types/
    index.ts
scripts/
  generate-embeddings.js
docs/
  SUPERPOWERS_REBOOT_PLAN.md
  MVP_PLAN.md
```

目录原则：
- 服务只走目录版入口。
- 每个能力只保留一个主实现。
- 无历史兼容层，除非用户路径被阻塞。

## 10. 旧资产迁移清单

### 10.1 直接复用

- `data/sixclassics-sample.jsonl`
- `explantation_prompt.md`
- `src/components/search/SearchBar.tsx`
  保留输入框、提交、回车触发与显式 query 传递。
- `src/components/search/SearchResults.tsx`
  只保留结果标题区与结果列表容器；删除排序器、加载更多、搜索提示块。
- `src/components/search/ResultCard.tsx`
  保留结果正文、来源信息、`生成注释` 与 `探索` 主按钮；去掉收藏、分享、无主线价值的扩展信息。
- `src/components/annotation/AnnotationPanel.tsx`
  保留 query 展示、`六经注我 / 我注六经` tabs、正文区与 links 区；删除收藏、分享、匹配度 footer 等延后控件。
- `src/components/annotation/StreamingText.tsx`
  只作为前端准流式显示层使用，不绑定服务端流式协议。

复用方式：
- 不整文件盲拷。
- 先迁移结构和交互意图，再按新协议重写 props 与状态流。

### 10.2 设计照搬但不继承运行机制

- `src/components/infinite-wiki/WikiExplorer.tsx`
- `scripts/import-data.js`
- `docs/MVP_PLAN.md`
- `docs/JSON_DB_PLAN.md`
- `ref/infidao---six-classics-annotate-me/components/IntroScreen.tsx`
- `ref/infidao---six-classics-annotate-me/components/NodeCard.tsx`
- `ref/infidao---six-classics-annotate-me/components/BackgroundLayer.tsx`
- `ref/infidao---six-classics-annotate-me/components/ThoughtTrace.tsx`
- `ref/infidao---six-classics-annotate-me/components/ControlBar.tsx`
- `ref/infidao---six-classics-annotate-me/components/CaptureModal.tsx`

迁移方式：
- 对 reference 的视觉语言、排版、探索轨迹、生成态交互做 reference-faithful port。
- 不继承 reference 的运行模型、技术栈与前端直连 LLM 方案。
- 旧版存在的 `h-screen`、鼠标-only atom、隐藏滚动条、CDN/importmap 依赖等问题，在移植时必须用当前工程标准修正。

### 10.3 明确不继承

- `src/lib/db.ts`
- `src/lib/db/index.ts` 的当前实现
- `src/lib/embed.ts`
- `src/lib/embed/index.ts` 的当前实现
- `src/lib/llm.ts`
- `src/lib/llm/index.ts` 的当前实现
- 当前所有依赖双轨导出的 API route
- `ref/infidao---six-classics-annotate-me/services/geminiService.ts`
- `ref/infidao---six-classics-annotate-me/App.tsx` 中的自动续写与自动滚屏主循环

原因：
- 这些实现已经存在事实来源冲突。
- 直接继承会把旧问题带进新分支。

## 11. 统一接口契约

### 11.1 搜索接口

`POST /api/search`

请求：

```json
{
  "query": "如何面对困境",
  "topK": 5,
  "threshold": 0.35
}
```

响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "lunyu-1-1",
      "source": "论语",
      "chapter": "学而篇",
      "section": 1,
      "text": "学而时习之，不亦说乎？",
      "score": 0.86
    }
  ]
}
```

### 11.2 注释接口

`POST /api/annotate`

请求：

```json
{
  "query": "如何面对困境",
  "passageId": "lunyu-1-1",
  "passageText": "学而时习之，不亦说乎？",
  "style": "modern"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "passageId": "lunyu-1-1",
    "passageText": "学而时习之，不亦说乎？",
    "sixToMe": "从经典回应当下问题",
    "meToSix": "从当下反观经典原文",
    "links": [
      {
        "passageId": "lunyu-1-2",
        "label": "继续探索",
        "passageText": "有朋自远方来，不亦乐乎？",
        "source": "论语",
        "chapter": "学而篇",
        "section": 2
      }
    ]
  }
}
```

若当前节点已经是叶子节点，响应中的 `links` 返回空数组：

```json
{
  "success": true,
  "data": {
    "passageId": "lunyu-1-2",
    "passageText": "有朋自远方来，不亦乐乎？",
    "sixToMe": "此处已可暂住，不必急着再追。",
    "meToSix": "你可以回到上一层，也可以换一条经典重新进入。",
    "links": []
  }
}
```

原则：
- MVP 第一版中，`POST /api/annotate` 始终返回一次性完整 JSON。
- 页面上的“生成中”与“逐字出现”由前端展示层负责，不要求服务端真流式。
- 用户点击 link 后，前端直接复用当前 query 与 link 自带的 passage 信息再次调用 `POST /api/annotate`。
- `CorpusPort` 只在服务端内部用于组装 link 数据，不作为前端公开 endpoint。
- `links.length === 0` 表示当前探索已到叶子节点，而不是错误状态。

### 11.3 健康检查接口

`GET /api/health`

响应：

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

原则：
- 首阶段只返回 MVP 真正依赖的健康状态。
- 不伪造尚未接入系统的详细子服务列表。
- 开发期优先保证“是否可启动、是否可搜索、是否可注释”三个最小判断。

### 11.4 未来流式升级约定

phase 1 到 phase 4 不启用服务端流式，因此本节不是 MVP 阻塞项。

如果后续确实引入真实流式，新分支只允许一种协议：NDJSON。

理由：
- 前端解析简单。
- 比当前 SSE 混合实现更容易调试。
- 与 React 客户端按行更新状态更直接。

原则：
- 后端每行一个完整 JSON chunk。
- 前端统一按行消费。
- 不混用 `event:` 前缀和裸 JSON。

## 12. 实施阶段

### 阶段 0：冻结旧实现

目标：
- 保存当前历史资产
- 明确新旧边界

产出：
- 创建 `legacy/pre-reboot-2026-04-23`
- 创建 `codex/reboot-mvp`
- 将本方案文档落入 `docs/`

验收：
- 旧实现可随时切回查看
- 新分支从此只承接重启工作

### 阶段 1：清洁基线

目标：
- 恢复工程最小可信度

任务：
- 删除或隔离双轨服务入口
- 定义 Search / Annotation / Corpus / Health 四个逻辑边界，但不提前抽象为独立文件层
- 确定唯一 `src/lib` 结构
- 修复 `tsconfig` 与 lint 基线
- 建立最小 `health` route

旧代码隔离策略：
- phase 1 不追求“全仓历史问题一次修完”，只收口 MVP 主路径实际会 import 到的模块。
- 非 MVP 旧代码以“冻结、迁出调用链、停止被主路径引用”为优先，不以“全部改到 type-safe”为第一目标。
- 当前不属于 MVP 主路径的旧 API、cache、embed、responsive layout、无限 wiki 等模块，可保留在仓库中但不得继续被 `page.tsx`、`/api/search`、`/api/annotate`、`/api/health` 直接或间接引用。
- 若某旧模块导致全仓 `type-check` 无法通过，而它又不在 MVP 主路径中，优先采用隔离、排除、迁出或冻结策略，避免 phase 1 膨胀成全仓修复。

验收：
- `npm run type-check` 通过
- `npm run lint` 可运行并通过
- `GET /api/health` 返回成功
- MVP 主路径不再 import 非 MVP 旧模块，且旧实现已形成清晰冻结边界

### 阶段 2：搜索闭环 / 旧版设计照搬落地

目标：
- 跑通 `query -> search -> classic response list`
- 将旧版 `ref/infidao---six-classics-annotate-me` 中用户满意的 UI/UX 作为 Stage 2 设计稿，按 reference-faithful port 落入当前 Next.js 工程
- 让 Stage 2 的第一屏从“AI 搜索工具”转向“输入一念，经典回应”

视觉 thesis：
- 石墨暗场、纸色文本、Noto Serif SC/经典 serif 气质、单一青绿色 zen accent、克制印章红。
- 旧版的沉浸感、巨型主题字、出处/原文/注疏层级是设计资产；旧版的自动无限续写、自动滚屏、前端直连模型不是 Stage 2 架构资产。

内容 plan：
- 搜索前：照搬旧版 `IntroScreen` 的专注入口、暗场、标题层级、输入方式与“输入此刻一念”的仪式感；删除三卡片营销区与未接线导航。
- 搜索中：在固定舞台中展示“经典正在回应”的 skeleton/呼吸状态，不让页面跳动。
- 搜索成功：按旧版 `NodeCard` 的阅读层级展示 3 到 5 条 `ClassicResponse`：出处小字、原文大排版、简短回应/命中理由、一个明确的“请经典注我”动作。
- 搜索为空/失败：使用同一视觉系统中的空态与错误态，给出可重新输入或选择一念的路径。

交互 plan：
- 搜索函数仍必须接收显式 `query`，快捷词/随机词/建议词不得依赖刚写入的 state。
- 旧版交互意图照搬，但实现语义要修正：结果条目先提供可聚焦、可读屏的按钮动作；全字词 atom 分支在 Stage 3/4 接入注释与探索状态时实现，并使用 button/keyboard semantics。
- 动效只做入口淡入、搜索生成态呼吸、结果渐显三类；全部支持 `prefers-reduced-motion`。

任务：
- 用最薄的 `lib/search/service.ts` 落地 `SearchPort`
- JSON corpus loader
- embeddings loader
- 内存 Top-K 相似度检索
- 首页搜索提交，采用旧版“一念输入”的专注构图
- 结果页状态拆分：loading / empty / error / success
- 补齐或替换当前断裂的前端 design token：`font-classic`、`primary-*` 色阶必须与旧版 zen/paper/stone 方向对齐
- 移除或隐藏三卡片功能营销区、未接线导航、排序、加载更多、收藏等非 Stage 2 入口
- 移动端搜索入口不得使用 `pr-40 + absolute right-*` 挤压布局，改为输入与操作分层或图标按钮布局

验收：
- 输入一句话可返回 3 到 5 条结果
- 首页快捷词不会搜错旧 state
- 搜索失败与搜索为空在 UI 上可区分
- 第一屏应是旧版 `IntroScreen` 的忠实移植，不再呈现通用 AI SaaS 三卡片首页
- 结果项应是旧版 `NodeCard` 层级的忠实移植：出处、原文、简短回应/命中理由、进入注释动作
- 桌面与移动端截图中，搜索输入、结果动作、空态/错误态文本不重叠，主要触控目标不小于 `44x44px`

### 阶段 3：注释闭环

目标：
- 跑通 `result -> annotate -> panel`

任务：
- 用最薄的 `lib/annotation/service.ts` 落地 `AnnotationPort`
- 统一注释接口契约
- 注释面板接入首页
- 前端准流式文本更新
- 结构化返回 `sixToMe` 与 `meToSix`

验收：
- 点击“生成注释”后右侧面板可见
- 生成中、失败、完成三种状态清晰
- 前后端请求与返回 JSON 契约一致

### 阶段 4：探索闭环

目标：
- 跑通 `annotation -> linked exploration`

任务：
- 由 `lib/data/corpus.ts` 与 `lib/wiki/service.ts` 落地 `CorpusPort`
- 最小 wiki panel
- link 点击后复用 `/api/annotate` 更新当前探索节点
- 保留探索路径

验收：
- 用户可从一条注释继续点进下一条经典
- 至少支持 2 层连续探索
- 探索状态按栈式模型运行：点击 link 只向当前路径 push 一层，返回时只 pop 一层
- 用户重新选择新的搜索结果时，旧探索路径会整体重置
- `links` 为空时视为叶子节点而非错误态，UI 提供可返回但不伪造继续探索入口

### 阶段 5：体验优化

目标：
- 让主路径更流畅，而不是更复杂

任务：
- 结果卡片过渡动画
- 搜索输入交互优化
- 注释面板进场与更新动效
- 移除未接线控件

验收：
- 页面不再出现“能点但没反应”的入口
- 首屏到结果页切换不再生硬

## 13. 交互优化原则

新分支的交互优化只围绕主路径进行。

### 13.1 搜索输入

- 搜索函数必须接收显式 `query`
- 快捷词、建议词、随机词都不得依赖刚写入的 state
- 支持回车提交
- 支持独立错误反馈

### 13.2 结果列表

- 只展示真实可用的控件
- 加载中优先展示骨架屏
- 空态与错误态必须分离
- 结果卡片的信息层级不超过三层

### 13.3 注释面板

- 生成态必须占据固定区域，避免页面跳动
- 文本更新方式保持一致，不混合多个来源
- 切换 `六经注我` 和 `我注六经` 时不丢失上下文

### 13.4 探索视图

- 第一版优先侧栏/抽屉，不做复杂自由图谱
- 探索状态采用栈式模型：首次结果为根节点，每次点击 link 都向栈顶 push 一个新节点
- 点击返回时只 pop 一层，并恢复上一层的注释与链接状态
- 用户重新选择新的搜索结果时，旧探索栈整体重置
- 只在数据真实存在时展示探索入口
- 当 `links` 为空时，不显示“继续探索”入口，改为显示非报错的叶子节点文案，例如“已到当前探索末端，可返回上一层或更换段落”
- 当 link 目标数据缺失或组装失败时，前端展示“此处暂无后续探索”并保留返回上一层与重新选择结果的能力，不把它渲染成系统级错误页

## 14. 质量门槛

以下门槛必须恢复：

- `npm run type-check` 通过
- `npm run lint` 通过
- 搜索 API 至少有最小请求校验
- 注释 API 至少有最小结构校验
- 核心类型只保留一份
- 核心主路径至少有一组端到端验收清单

## 15. 风险与应对

### 风险 1：新分支仍然带入旧结构

应对：
- 明确禁止直接复制 `src/lib` 当前实现
- 所有迁移先过“资产还是架构”的判断

### 风险 2：范围再次膨胀

应对：
- 每新增一项功能，先判断是否服务于主路径
- 任何不影响闭环成立的功能默认延后

### 风险 3：照搬 reference 设计时误搬运行机制

应对：
- 明确区分“照搬 UI/UX”与“继承运行机制”。
- 所有迁移动作先判断其是否服务于 `query -> search -> annotate -> explore` 主路径。
- 自动续写、自动滚屏、前端直连 LLM 一律视为非 MVP 能力。

### 风险 4：端口与契约重新分叉

应对：
- 先定义 `src/types/index.ts` 中的唯一请求/响应结构，再写 route 和页面。
- route handler 先经由最薄 service 调用能力，不直接绕过边界访问底层实现。
- 所有新增接口先过“是否属于 MVP 公开端口”判断，不属于则不暴露。

### 风险 5：视觉做得太快，契约没对齐

应对：
- 先证明接口和状态机，再上动效
- 体验优化排在阶段 5，不提前插队

### 风险 6：JSON-first 路线后续迁移困难

应对：
- 第一阶段不提前抽象 `SearchProvider`
- 只有在第二种搜索后端真实进入时再提取抽象层
- 保证 `search` 接口对前端不变

## 16. 回滚策略

如果重启失败或方向调整：

- 历史资产仍在 `legacy/pre-reboot-2026-04-23`
- 新分支失败不会污染旧实现
- 产品讨论可继续基于本方案文档做范围收缩

## 17. 立即行动项

1. 创建 `legacy/pre-reboot-2026-04-23` 保存当前快照。
2. 创建 `codex/reboot-mvp` 作为唯一开发主线。
3. 在新分支中先完成阶段 1，不写新功能。
4. 阶段 1 通过后，再开始阶段 2 的 JSON 搜索实现。
5. 阶段 2 和阶段 3 完成后，再决定是否引入更完整的 wiki 视图。

## 18. 最终判断

这次重启不是否定旧项目，而是承认旧项目已经产出了足够多的“素材”，但还没有形成足够稳的“系统”。

`SUPERPOWERS` 流程的核心就是：
- 先冻结事实
- 再缩小范围
- 然后重建唯一主线
- 最后才做扩展

只要坚持这四步，新分支比继续修旧分支更有机会更快交付出真正可用的 MVP。

## 19. 数据文件附录

phase 1 到 phase 2 期间，运行时数据文件约定如下：

- runtime corpus：`data/sixclassics-sample.jsonl`
- runtime embeddings：`data/embeddings.json`
- `data/sixclassics/*.jsonl` 只作为离线整理原始语料的输入来源，不作为首页闭环的直接运行依赖

`data/sixclassics-sample.jsonl` 每行一个 JSON 对象，最小字段为：

```json
{
  "text": "学而时习之，不亦说乎？",
  "source": "论语",
  "chapter": "学而篇",
  "section": 1
}
```

运行时规范化后必须得到：

```json
{
  "id": "论语-学而篇-1",
  "text": "学而时习之，不亦说乎？",
  "source": "论语",
  "chapter": "学而篇",
  "section": 1
}
```

若源数据未显式提供 `id`，loader 必须用 `source + chapter + section` 生成稳定 `id`，避免 passage 与 embeddings 无法对齐。

`data/embeddings.json` 采用单文件 JSON 对象格式：

```json
{
  "model": "bge-m3",
  "dimension": 1024,
  "items": [
    {
      "id": "论语-学而篇-1",
      "vector": [0.123, -0.456, 0.789]
    }
  ]
}
```

约束：

- `items[].id` 必须与 runtime corpus 的稳定 `id` 一一对应。
- `dimension` 必须与 `vector.length` 一致。
- 若 embeddings 文件缺失、维度不一致或出现孤儿 `id`，phase 2 loader 必须返回结构化错误，而不是静默降级。
