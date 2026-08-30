# InfiDao Playwright E2E 设计

日期：2026-08-30  
状态：已确认

## 背景

仓库已有 Jest 单元、集成和 UI 回归测试，以及针对生产 API 的 release smoke；但没有可在真实浏览器中重复执行的正式端到端测试。当前 Reboot MVP 的公开主流程是：

```text
query -> search -> result -> annotate -> links -> explore -> back -> select new result reset -> leaf state
```

本设计新增一套 Playwright E2E 子系统，使用真实本地语料、真实 Next.js API 路由和无凭据时的 deterministic annotation fallback，验证用户从浏览器进入应用后的发布主路径。

## 目标

- 使用官方 `@playwright/test` 运行器建立可重复执行的 E2E 测试。
- 覆盖 Chromium 桌面视口 `1280x720` 和移动视口 `390x844`。
- 本地执行时自动启动 Next.js 开发服务，保持快速反馈。
- 支持通过显式 `E2E_BASE_URL` 对已构建的 standalone production server 手动执行同一套测试。
- 真实调用 `/api/search` 和 `/api/annotate`，不拦截或伪造主流程网络请求。
- 捕获浏览器页面异常和 Console error，并在失败时保留截图与 trace。

## 非目标

- 不用 Playwright 重复覆盖 Jest 已有的搜索错误、重试、空结果等细粒度组件状态。
- 不在真实 E2E 中构造 leaf state。当前真实语料的 lexical fallback 会持续提供未访问链接，leaf state 继续由现有 Jest 用例精确覆盖。
- 不在本轮加入 Firefox 或 WebKit。
- 不依赖外部 LLM 凭据，也不验证第三方模型输出文案。
- 不修改产品交互、搜索排序、API 契约或发布产物结构。
- 不把浏览器 E2E 接入 GitHub Actions；现有 workflow 继续只运行 release smoke。
- 不提交 Playwright 生成的截图、trace 或 HTML 报告。

## 方案选择

### 采用：本地开发服务 + 手动生产服务

Playwright 配置根据 `E2E_BASE_URL` 选择运行方式：

- 未设置 `E2E_BASE_URL`：通过 Playwright `webServer` 自动运行 `next dev`，监听 `127.0.0.1:3100`。
- 设置 `E2E_BASE_URL`：不启动额外服务，直接连接指定地址。发布复核人员可将其指向 standalone production server `http://127.0.0.1:3001`。

这样日常本地执行无需先构建，发布复核时仍能手动验证真实发布构建；两种环境共享相同 spec，避免形成两套行为契约。

### 未采用：始终运行生产构建

发布一致性最高，但每次本地执行都需要构建并准备 standalone 文件，反馈周期过长。

### 未采用：始终运行开发服务

配置最简单，但无法覆盖生产构建、静态资源路径和 standalone 运行时差异。

## 文件与职责

### `playwright.config.ts`

- 定义统一 `baseURL`、超时、重试、worker 和失败证据策略。
- 设置标准 `CI` 环境变量时使用单 worker 和一次重试，便于任何外部自动化环境稳定调用，但仓库自身不接入 GitHub Actions。
- 定义两个 Chromium project：desktop 和 mobile。
- 默认启用 `trace: "retain-on-failure"`、`screenshot: "only-on-failure"`；不录制成功用例视频。
- 本地模式通过 `webServer` 启动 `npm run dev -- --hostname 127.0.0.1 --port 3100`。

### `tests/e2e/reboot-mvp.spec.ts`

仅负责用户可观察行为，不依赖 React 内部状态或实现类名。定位优先使用 role、accessible name、heading 和可见文案。

测试路径：

1. 打开 `/`，验证 URL、标题、主标题和输入框。
2. 输入“如何面对困境”并点击“请经典回应”。
3. 验证出现 5 则真实搜索结果，并确认第一条为当前质量门禁期望的《孟子》结果。
4. 选择第一条“用这一句回应我”，验证“注我卷轴”和当前经文出现。
5. 进入第一条“下一句”，验证探索层级出现“返回上一层”。
6. 返回上一层，验证根注语恢复。
7. 选择第二条搜索结果，验证当前经文切换，并确认旧探索栈已重置，不再显示“返回上一层”。
8. 点击“回到一念”，验证回到初始输入状态。
9. 每个 project 检查页面没有横向溢出。

用例监听 `pageerror` 和 Console `error`。已知、明确允许的浏览器噪声如存在，必须按精确消息过滤；初始实现不设置宽泛忽略规则。

### `package.json` 与 `package-lock.json`

- 添加 `@playwright/test` 开发依赖。
- 添加 `test:e2e` 脚本，执行 `playwright test`。

### `.github/workflows/reboot-mvp-ci.yml`

- 不修改现有 GitHub Actions 门禁。
- Chromium 安装、浏览器 E2E 和失败报告上传均不进入仓库 workflow。
- Workflow 继续保留原有类型、Lint、Jest、质量、构建和 release smoke 门禁。

### `README.md`

- 在验证命令和 Active Commands 中加入 `npm run test:e2e`。
- 说明首次本地执行需要安装 Chromium：`npx playwright install chromium`。
- 说明本地默认使用开发服务，并给出 production standalone 的显式手动执行方式。

## 数据与环境

- 搜索使用仓库提交的本地 corpus、embeddings 和 graph artifact。
- 注语使用项目现有 deterministic fallback。Playwright 自动启动的本地服务会显式清空受支持的 annotation API key 环境变量，避免开发者 `.env.local` 改变测试路径。
- E2E 不要求 `.env.local`，也不断言模型生成的完整文案。使用 `E2E_BASE_URL` 连接自管服务时，调用方负责保证该服务没有启用远程 annotation provider。
- E2E 不访问外部网络，Playwright 浏览器安装除外。

## 稳定性策略

- 使用可访问性定位器，避免基于视觉位置或 CSS class 点击。
- 等待明确的页面状态，不使用固定长时间 sleep。
- 搜索和注语使用较宽的 expect timeout，以容纳首次加载本地语料的冷启动。
- 标准 `CI` 环境变量下单 worker 执行两个 project，避免同时请求同一外部服务造成不必要竞争。
- 成功执行不产生仓库文件；失败证据落入已被 `.gitignore` 排除的 `test-results/` 和 `playwright-report/`。

## 验证标准

实现完成后必须通过：

```text
npm run type-check
npm run lint
npm test -- --runInBand --no-cache
npm run test:e2e
npm run build
```

还需以 `E2E_BASE_URL` 模式对 standalone production server 手动运行一次 `npm run test:e2e`，证明生产路径可用。桌面和移动两个 project 均通过、无未解释 Console error、工作区无测试产物污染，才视为完成。

## 风险与边界

- 真实搜索排序是 E2E 契约的一部分；如果质量门禁有意调整“如何面对困境”的第一条结果，E2E 期望需随经过评审的新契约更新。
- 两个真实浏览器 project 会增加本地或手动发布复核时间和 Chromium 下载体积，但范围限制为单浏览器引擎和一条主流程。
- E2E 无法替代独立 frozen holdout、Jest 细粒度回归或 release smoke；它们继续作为互补门禁存在。
- Leaf state 不能在当前真实语料主路径中以有限步数稳定到达，因此仍由 `tests/ui/home-page.search.test.tsx` 的确定性 fixture 覆盖；本轮不会为追求浏览器覆盖而违背“真实接口、不 Mock”的数据策略。
