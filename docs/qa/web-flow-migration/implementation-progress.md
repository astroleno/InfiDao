# 迁移实施记录

## 授权与边界（2026-09-26）

用户确认先推进共享控制器、阅读适配和在线服务，实际 iPhone Safari／微信验收留在上线前。复用当前工作空间，不派发 agent、不建分支、不提交或发布。3101 为当前独立页面的生产预览；公网发布与公开入口切换仍按计划单独确认。

2026-09-28 后续用户明确要求继续部署，指定在现有机器关闭 Docker，并允许使用本机钥匙串保存的部署凭据。当前公网预览已挂载 `/infidao`；首页未替换。前述 2026-09-26 边界为当时状态。

2026-09-30 预览 `infidao-219e8920dd17d801` 已修复经轮左右玻璃硬边及桌面阅读侧框，并按用户确认范围加入访客隔离、6 小时有效的持久语义索引和预建词法倒排表。110 项相关回归、类型/lint、隔离真实 Redis 重启及公网资源/画面检查通过；具体指标和未完成边界见 [索引记录](2026-09-30-index-border-iteration.md)。

随后用户确认界面审阅意见的修正方向，并明确授权 commit、push。2026-09-30 预览 `infidao-e5dbf587fa490062`、实现提交 `29c6691` 已推送现有分支；补齐文字对比度、标点换行、键盘选词/回看、弹窗背景隔离和注脚删除焦点恢复。115 项网页相关测试、124 项小程序回归、类型/lint 及窄屏/横屏检查通过。实际 iPhone、微信和 VoiceOver 仍未验收；详见 [阅读与键盘迭代](2026-09-30-reading-accessibility.md)。

2026-10-01 最新预览为 `infidao-39873a120c07071b`，提交 `252ab06`。网页按浏览器刷新绘制，折射缓冲宽高减半，正文保持原分辨率；新分支继承静读模式，新增就近等待提示、提交与取消焦点恢复，以及超时/核验失败区分。120 项网页相关测试、124 项小程序回归、类型/lint、候选服务及公网资源检查通过。短时自动化采样改善不代表真实设备持续 60fps；完整真机验收仍未完成。详见 [渲染与阅读连续性迭代](2026-10-01-rendering-reading-iteration.md)。

## U1b / U3 模块接口

- `shared/flow/controller.js`：纯 JavaScript 协调器，拥有当前阅读记录、操作代数、可取消请求、首句/补全队列、切链和恢复。Provider 保留原 `open/branch/next/resume` 及事件接口。
- 存储端口提供异步 `get/put/commitBranch/child/latest/activate`；记录包含稳定路径 ID、父路径、chain、snapshot 和完成状态。浏览器事务失败保留磁盘旧记录，并在当前会话的内存记录中继续；小程序同步 API 由适配器包成相同契约。
- 平台端口只负责 `capture/present/update/state/history` 和字体准备。首句在准备和存储后呈现一次；frame/done 合并同一记录，完整帧不得被晚到首句降级。
- 返回未完成记录只在其状态允许自动恢复时调用 resume；主动停止和明确失败提供手动重试，过期提供重新展开。取消或切页后的旧事件不能改变当前记录或追加历史。
- 原生 `chain-page` 保留渲染、捕获和阅读层适配，生成目录从共享源构建。浏览器 `controller-host` 连接 IndexedDB、历史与 React，组件不再维护另一套请求状态机。

## 待完成

- [x] 共享控制器及生命周期测试：13 项，包含十层来路、首句分叉后返回补全、取消与晚到字体、存储故障和首次失败回退。
- [x] 浏览器 IndexedDB、历史、注脚故障恢复与页面接入：实际浏览器十层往返、草稿刷新、注脚撤销、键盘弹层、原文位置和存储故障注入通过。
- [x] 小程序控制器适配及原有行为回归：124 项通过，语法和页面结构检查通过；保留已有临时存储改动。
- [x] 浏览器 NDJSON Provider、匿名归属、全站／访客／IP 限额和持久 Redis session store。
- [x] 原子首句/完成提交、版本锁、重放、restartFrom；隔离真实 Redis AOF 重启与旧租约测试通过。
- [x] 16 段共享精选核验真实语料身份；生成版本化字体和绑定源码、语料、存储 schema 的发布清单。
- [x] 本地开发与独立生产构建通过实际模型的逐段返回，真实浏览器打开远程经句与点词分叉。
- [x] 当前公网预览版本的目标 COS/CDN 字体和发布清单已上传，最终 CDN 的 14 个字体对象逐项验证通过；源站源码包已校验并构建。
- [x] 目标服务器的独立 Node/Redis 服务、HTTPS 路由、真实分段返回、应用重启后的会话重放及公网页面静态资源检查通过。
- [ ] 实际 iPhone Safari／微信内置浏览器、小程序公网地址、故障注入和完整回滚演练尚未验收；首页保持原样。

## 当前实现与验证（2026-09-26）

- 浏览器和小程序共享 `shared/flow/controller.js`，小程序适配器保留原画面捕获、转场、预取和历史窗口；网页不再自带另一套请求状态机。
- `shared/flow/curated-provider.js` 与 `curated-data.js` 为两端共同精选来源，`scripts/build-flow-curated.ts` 用服务端语料核验身份，随共享运行时一起生成。
- IndexedDB v2 添加最近阅读和一念草稿；失败写入和删除保留本次会话覆盖层，旧磁盘读取不得覆盖新状态。持久化成功的路径缓存最多 8 条。
- `npm run type-check`、`npm run lint`、小程序 124 项与结构检查通过。U4 核心 36 项、共享控制器及浏览器专项单测均通过；当前生产构建包含 `/infidao`、`/api/flow`、`/api/flow/session`。
- 浏览器十层来回脚本 `output/infidao-qa-2026-09-26/check-u3-browser.mjs`，生产 Redis 与模型流式证据见 `docs/qa/web-flow-migration/2026-09-27-u4-u5-local.md`。当前本机生产预览为 `http://localhost:3101/infidao`；3104、3105 和 3107 为已停止的历史联调端口。
- U4 已连接真实 Redis 与模型；网站首句采用远程 Provider，首次远程失败才回退到精选。上述记录为 2026-09-26 本地阶段；2026-09-28 已部署独立公网预览。

## U4 存储实施接口

- 会话存储以访客为私有命名空间，提供 `reserve / commitHead / commitComplete / renew / release / getChain`。请求 ID 绑定规范化请求摘要，词分叉按父链、节点和规范化入口去重。
- 每次修改读取最新文档并按版本比较后原子提交；模型生成不持有文档事务。提交完成时合并最新分叉映射，保留解释生成期间从首句创建的子链。
- 操作租约包含持有者、递增代数及过期时间。Redis 适配在原子比较提交中再次检查租约；内存适配执行相同语义，供端上预览和确定性测试使用。过期工作者不能写入或释放新租约。
- 生产适配单独连接 Redis，内容核心只依赖存储接口；端上构建不打包 Redis、Cookie 或服务器密钥。匿名身份与全站预算由服务端适配处理，生产缺少必要配置时拒绝新模型调用。
- 核对资料：Redis 官方 node-redis 连接文档及事务说明，https://redis.io/docs/latest/develop/clients/nodejs/connect/ 、https://redis.io/docs/latest/develop/using-commands/transactions/ 。

## U5 本地构建边界

- Node 24 双阶段镜像保留为容器发布选项；当前内存受限主机按用户要求关闭 Docker，改用 Node 24.21.0 和 Redis 7.4.11 systemd 服务。Redis 使用 AOF、`noeviction`、私有命名空间和本机隔离端口。Nginx `/api/flow` 禁缓冲及压缩，真实 HTTPS 网关分段已验证。
- `scripts/build-web-flow-assets.ts` 输出固定字体版本和 `public/flow-releases/<发布编号>.json`；浏览器使用固定版本字体，CDN 分片故障时回退同源。2026-09-28 已完成目标 COS/CDN 版本上传和逐对象 CORS、哈希验证，记录见 `docs/deployment/web-flow.md`。
- 独立 standalone 目录复制 `.next/static`、`public`、`data` 后通过真实模型。小程序与网页未读取本机钥匙串；发布参数和真机门槛见 `docs/deployment/web-flow.md`。

## U5 公网预览证据（2026-09-28）

- 发布编号 `infidao-e40edebd06ab0a53`。本地类型检查和 lint 通过；受限的目标机 Next standalone 构建退出码 0。`deploy/assemble-standalone.mjs` 在单独临时目录验证完整运行资源，防止静态文件与语料多套目录。
- 最终 CDN 的 14 个字体对象哈希、MIME、缓存及 CORS 通过。`https://aitoshuu.me/infidao`、12 个页面引用的 Next 静态资源、同源字体和发布清单均为 200；现有首页与 `/lubirth` 仍为 200。公开静态资源共 67 个文件未包含模型密钥。
- HTTPS 流式请求收到 `head → frame → done`，首事件比完成早约 3.5 秒；服务端应用重启后，同一会话同一请求仅重放 `done` 与原链 ID。模拟手机尺寸的 Chromium 经轮和输入面板可用且无横向溢出；不能据此标记真机通过。
- 构建期间曾出现内存压力和一次 Nginx 启动失败，均已恢复并修正发布步骤。当前 Docker service/socket inactive、disabled；Nginx、网页应用及 Redis active。当前全站限额为同时 2 个请求、UTC 日模型调用 20 次。
