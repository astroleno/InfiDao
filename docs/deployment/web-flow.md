# 六经注我网页发布与回滚

## 当前边界

公开预览入口为 [https://aitoshuu.me/infidao](https://aitoshuu.me/infidao)。2026-09-28 已在现有服务器启动独立 Node/Redis 服务，并仅为 `/infidao`、对应 Next 资源、版本化字体及 `/api/flow` 增加 Nginx 反向代理。DNS、首页和 `/lubirth` 没有切换。全站每日模型调用上限当前为 20 次，真机验收与长期额度仍待确认；此入口是可访问的预览，不代表 U6 全部通过。

## 发布产物

当前最新预览为 2026-10-01 的 `infidao-88cf58319e67fa6e`，来自已推送提交 `1c928041c6d897872871f5534f1e5b0216e24696`。修复旧首句恢复失败后反复补全，补充分享图与正确元信息，改善标题层级、窄屏触控和停驻亮度，并启用 JS/CSS 发布时 Brotli 预压缩。上一可回滚应用为 `infidao-39873a120c07071b`；回滚时同时恢复该版本对应的 Nginx 片段，备份位于新发布目录的 `nginx-before-recovery.inc`。见 [恢复、分享与压缩迭代记录](../qa/web-flow-migration/2026-10-01-recovery-sharing-iteration.md)。

前一预览 `infidao-39873a120c07071b` 移除网页固定 30fps 限制，降低折射缓冲开销，修复静读分支模式与输入提交/取消焦点，补齐就近等待提示和失败原因区分。见 [渲染与阅读连续性迭代记录](../qa/web-flow-migration/2026-10-01-rendering-reading-iteration.md)。

前一预览 `infidao-e5dbf587fa490062` 提高辅助文字可读性，修正标点换行、键盘选词和经轮前后浏览，补齐输入面板背景隔离及注脚删除焦点恢复。见 [阅读与键盘迭代记录](../qa/web-flow-migration/2026-09-30-reading-accessibility.md)。

前一预览 `infidao-219e8920dd17d801` 消除网页经轮两侧玻璃硬边、去掉阅读层侧框，加入倒排检索及访客语义索引持久化。模型配置与额度保留。实现、检索计时及 Redis 重启证据见 [索引与边缘迭代记录](../qa/web-flow-migration/2026-09-30-index-border-iteration.md)。

语义索引保存在原有访客会话的可选 `semantics` 字段中，最多 256 条、每条 1,200 字符、6 小时有效。只保存核验后经文释义和入口概念，不增加用户输入副本；按原文哈希、语料与提示词版本筛选。预留与完成事务同时读取/写入，无新增 Redis 往返，旧会话 schema 1 兼容。索引属于当前访客，不能跨访客复用。

前一预览 `infidao-0f1b26d1d65a7ad4` 补充字体清单预加载、分片并行和输入失败恢复。冷加载及错误恢复证据见 [加载迭代记录](../qa/web-flow-migration/2026-09-30-loading-recovery-iteration.md)。

2026-09-30 横屏修复已更新公网预览至 `infidao-c3f5393613ce1a8f`；上一可回滚应用为 `infidao-e40edebd06ab0a53`。此次还修复了宝塔全局 `proxy_cache` 导致普通入口继续返回旧 HTML 的问题：页面路由必须显式 `proxy_cache off`，只检查静态资源返回 200 不足以证明页面已更新。`/_next/static/` 的浏览器缓存头改为单个 immutable，上一版哈希资源继续保留。完整验证和 DS 内容实测见 [横屏与 DeepSeek 记录](../qa/web-flow-migration/2026-09-30-landscape-deepseek.md)。

`npm run build` 先核验共享精选与真实语料，再生成 `public/flow-assets/v-<字体版本>/` 和 `public/flow-releases/<发布编号>.json`，最后构建 Next standalone。发布清单绑定源码内容哈希、Git 修订、语料内容哈希与版本、精选版本、字体文件清单与存储 schema（浏览器 2、服务端会话 1）。容器构建时由 CI 将提交号放在 `INFIDAO_RELEASE_COMMIT`，本地未提交工作只以内容哈希识别。字体文件在生成时逐一校验大小和 SHA-256。网页引用固定字体版本；构建时配置 `NEXT_PUBLIC_FLOW_FONT_CDN_BASE` 后可优先读取 CDN，对清单版本或分片读取失败回退至同源版本目录。部署前必须先让 CDN 路径中的清单及每个分片可读，且配置跨域字体加载。

`Dockerfile` 的构建和运行阶段统一使用 Node 24 LTS，供有足够内存的容器环境使用。本次现有 1.6 GiB 主机按用户要求关闭并禁用 Docker，实际使用隔离的 Node 24.21.0 systemd 服务及 Redis 7.4.11。standalone 运行目录包含 `data/corpus-manifest.json` 及其全部引用语料、`public` 和 `.next/static`；重新组装时运行 `deploy/assemble-standalone.mjs`，会拒绝资源多套一层目录。Redis 使用独立命名空间、AOF 和 `noeviction`，仅监听回环地址；容量不足时内容服务拒绝新写入，不能淘汰未过期会话。`appendfsync everysec` 在机器突然断电时最多可能丢失最近约一秒的写入，目标服务器如需更高持久性可评估 `always`。旧版 `/flow-fonts` 资源仍保留供旧页面回滚。

可选的 PostgreSQL 配置必须显式提供密码，且不向宿主机公开端口。仓库中的 Nginx 配置仅含 HTTP 服务和 HTTPS 示例，不能直接作为预发布 HTTPS 入口；目标服务器应接入已有 TLS 网关或在获得证书和域名参数后配置并验证 HTTPS。

## 预发布配置

`deploy/assemble-standalone.mjs` 依赖同目录的 `precompress-static.mjs`，复制组装工具到服务器时需一并复制。它为新 JS/CSS 生成 `.br`；沿用上一版静态资源时允许没有 `.br`，Nginx 会回到 Next 原资源服务。压缩路由仅覆盖 `/_next/static/`，不安装全局模块，不修改模型流式 API 的压缩设置。

在私有环境文件或密钥管理器中配置，勿提交：

| 变量 | 用途 |
| --- | --- |
| `FLOW_PUBLIC_ORIGIN` | 预发布 HTTPS origin，精确匹配浏览器 Origin |
| `FLOW_SESSION_SECRET` | 至少 32 字符的随机会话签名密钥；同一预发布集群保持一致 |
| `FLOW_REDIS_URL`, `FLOW_REDIS_NAMESPACE` | 持久 Redis 和与现有业务隔离的命名空间 |
| `FLOW_API_KEY`, `FLOW_BASE_URL`, `FLOW_MODEL` | 仅服务器使用的模型凭据、地址和模型 |
| `FLOW_MAX_ACTIVE_SITE/OWNER/IP` | 同时进行的全站、访客、IP 上限 |
| `FLOW_REQUESTS_MINUTE_SITE/OWNER/IP` | 每分钟请求上限 |
| `FLOW_MODEL_CALLS_DAY_SITE/OWNER/IP` | 每 UTC 日实际模型调用上限，包括规划、纠错和释义调用 |
| `FLOW_NATIVE_HTTP_ENABLED` | 确认小程序 HTTPS 合法域名后再开启原生 HTTP Provider |
| `NEXT_PUBLIC_FLOW_FONT_CDN_BASE` | 构建时固定的 CDN 字体版本目录，留空时使用同源资源 |

九项限额在生产环境都必须显式填写；零会阻止相应请求或模型调用。应用的宿主机端口仅绑定 `127.0.0.1`，只信任由受控反向代理写入的 `X-Real-IP`，代理将原始客户端该标头覆盖。网页身份由同源、HttpOnly、SameSite Cookie 绑定；小程序使用 `/api/flow/session` 签发的短期 Bearer。原文和本地注脚不进入公开资源桶。

## 预发布检查顺序

1. 核对实际服务器的 Node/容器、HTTPS 证书、域名、Redis AOF/容量，以及 COS 桶和 CDN 前缀；保存当前应用镜像编号和静态资源清单作为回滚目标。构建所用源码必须与清单 `codeSha256` 一致。先上传并核验版本化字体，再发布应用镜像。
2. 使用独立预发布域名和 Redis 命名空间启动应用。核验镜像内 `data/corpus-manifest.json` 及全部引用文件；比较 `public/flow-releases/<发布编号>.json` 中的内容哈希。经 CDN 和同源分别请求字体清单及代表分片，检查状态、版本、CORS 和 SHA-256。
3. 经实际 Nginx/HTTPS 地址运行 `node scripts/verify-flow-http.mjs https://<预发布域名>`。应在模型完成前收到 `head`，随后是同一 `chainId` 的 `frame` 与 `done`。断开请求后占用应释放；重启应用后原访客的未完成链应能继续，同一请求完成结果应重放。再验证源文点词、返回、刷新、离线精选和注脚。
4. 在实际 iPhone Safari 与微信内置浏览器验收经轮、字体、地址栏伸缩、触点范围、加载和十分钟持续运行，并记录截图和设备版本。本地 Chromium 视口不计真机通过。小程序 124 项本地回归已通过；正式服务地址接入后仍需手机回归。
5. 将预发布地址、费用限额、验收结果和回滚镜像／资源清单交用户确认，再切换公开入口。切换后校验实际域名、边缘缓存和真实网关分段；异常时切回上一应用及对应字体清单，保留两版所需资源。不要清空 Redis、IndexedDB 或个人注脚。

## 2026-09-28 源站与 CDN 准备记录

- 参照相邻项目的分阶段发布方式，使用 `deploy/package-release.mjs` 冻结当前工作区为 `/tmp/infidao-next-release`，版本 `infidao-cec3fc72d90d46de`，源码 SHA-256 为 `cec3fc72d90d46deb3b9e56486e6bd3abcd5343095682f5dc6d70e127414e8e9`。当前修改尚未提交，`gitHead` 只是构建时基准提交，发布内容由源码哈希识别。
- 包内不含 `.env.local`、小程序私有配置或本机模型密钥。源站压缩包 SHA-256 为 `4a962a6b860cf2c6e78b2cdbce9dbcebd0b29a356e8b19a57ad1cc74eca2bb0e`，已在服务器校验并解压至 `/opt/infidao-releases/infidao-cec3fc72d90d46de/source`。此目录不在网站根目录下，也未对外路由。
- `deploy/upload-cos-release.py` 从本机钥匙串读取现有 COS 凭据，仅创建 `tongye-1327162705`、`ap-shanghai` 中 `releases/aitoshuu-me/infidao-cec3fc72d90d46de/` 前缀的 14 个字体对象及一份发布清单。`deploy/verify-cdn-release.mjs` 对最终 `assets.aitoshuu.me` URL 的 14 个对象逐一校验 HTTP 200、大小、SHA-256、MIME、长期缓存和跨域头，全部通过。私有语料、会话、模型密钥未上传 COS。
- 现有阿里云主机只有约 1.6 GiB 内存。Docker 服务原为 inactive，启动后自动恢复六个既有容器，剩余可用内存显著下降，因此未在共享主机执行 Next 镜像构建。已将 Docker 服务及 socket 恢复为 inactive，首页 HTTPS 检查仍为 200。需确定该机使用隔离 Node 进程，或改用有足够内存的容器主机，才能继续应用预发布。
- 目前没有可打开的公网 InfiDao 页面、真实网关逐事件验证或真机验收。版本化 COS 对象保持不可变；未引用的源站包和 CDN 资源无需改变现有站点即可留作后续发布。

上述记录是首次暂存时的状态。随后用户要求关闭本机 Docker 并继续使用该服务器，当前状态见下一节。

## 2026-09-28 公网预览部署与回滚

- 实际版本为 `infidao-e40edebd06ab0a53`，源码内容 SHA-256 为 `e40edebd06ab0a53b12b56bfa23a2065aaa81767d50940ff89104b6cee1a558f`，源站压缩包 SHA-256 为 `c389628dcf1c01aadc466d6bbeb86b85e7e2b7ade2e69c4c435d0335157b5b3a`。本地工作区未提交，Git HEAD 只记录基准提交，不能代替源码哈希。15 个 COS 对象（14 个字体对象加发布清单）位于 `releases/aitoshuu-me/infidao-e40edebd06ab0a53/`；最终 CDN 的 14 个字体对象逐一通过哈希、MIME、CORS、缓存验证。
- 本次原始冻结包是 `/tmp/infidao-next-release-v2`。部署后打包器增加去除 macOS 扩展属性和固定归档时间，两个新测试包的归档与清单逐字一致；由于旧 COS 清单不可覆盖，不要用新版打包器重新生成并覆盖这个已发布编号。后续源码有变化时生成新的内容编号。
- 源码暂存于 `/opt/infidao-releases/infidao-e40edebd06ab0a53/source`，构建后运行目录为同版本下的 `app`，`/opt/infidao-current` 指向该版本。`infidao-web.service` 仅监听 `127.0.0.1:3109`；`infidao-redis.service` 仅监听 `127.0.0.1:6389`。私有环境文件为 `/etc/infidao/app.env`，模型密钥只在服务端。Docker service/socket 均为 inactive 且 disabled。
- 该主机内存不足以稳定执行完整 Next 构建的内嵌类型检查。改为本地独立运行 `npm run type-check` 和 `npm run lint`，两者通过；目标主机在 `INFIDAO_CONSTRAINED_BUILD=1` 下以单个构建 CPU、900 MiB cgroup 上限生成 standalone，成功退出。该标志只影响构建时类型/代码检查的调度，不改变运行时逻辑。`deploy/assemble-standalone.mjs` 以单独的临时目录重新组装并校验 10 个 Next JS chunk、2 个语料文件和 13 个字体分片，通过。
- 首次目标机构建时曾因内存压力使 SSH/HTTPS 暂时无响应；重启后因把仅含 `location` 的文件误放为 vhost 目录的 `.conf`，Nginx 未启动。已将片段改为 `.inc`，恢复 Nginx，并在后续受限构建中持续检查现有站点。独立应用初次组装还发现 `data/data`、`.next/static/static` 的重复目录，已修正，发布脚本现会拒绝这种结构。
- HTTPS 实际域名上的 `/infidao` 页面、12 个页面引用的 Next 静态资源、同源字体清单、发布清单、CDN 字体及现有首页和 `/lubirth` 均返回 200。真实公网 `/api/flow` 连续观察到 `head` 约 1.1 秒到达，`frame`/`done` 约 4.6 秒到达；代理关闭缓冲并透传 `X-Accel-Buffering: no`。服务器本机的会话在应用重启后，同一请求只重放 `done` 与原 `chainId`。手机尺寸的 Chromium 浏览器显示经轮并可打开/关闭输入面板，文档宽度没有溢出；这不是 iPhone Safari 或微信内置浏览器真机验收。67 个公开静态文件中未出现服务器模型密钥。
- 当前 Nginx 原配置备份在 `/opt/infidao-releases/infidao-e40edebd06ab0a53/nginx-before-infidao.conf`。若需撤回预览路由，先将该备份恢复到 `/www/server/panel/vhost/nginx/html_aitoshuu.me.conf`，用 `/www/server/nginx/sbin/nginx -t` 验证后 reload；不要清空 Redis 或浏览器注脚。当前没有上一版 InfiDao 在线应用，旧的 `infidao-cec3fc72d90d46de` 仅为未上线的源码与 CDN 暂存，不能当作已验证的应用回滚目标。
- 尚未完成实际 iPhone Safari、微信内置浏览器和小程序对公网地址的回归，也未做公网故障注入与完整回滚演练。全站同时请求上限为 2、每日模型调用上限为 20；正式扩大开放前应确定长期额度。首页没有替换。

## 2026-09-27 本地证据

- 实际 Redis 7.4.11 的 AOF 重启、跨实例预留、过期租约、分叉合并和共享预算通过 `scripts/verify-flow-redis.ts`。这是隔离实例，不代表公网 Redis 已核验。
- 开发及独立 standalone 构建均通过真实模型的一次 `head → frame → done`，首句先于补全到达；本地生产构建复制语料和版本化字体后独立启动。完整记录见 `docs/qa/web-flow-migration/implementation-progress.md`。
- 更新后的独立生产预览运行于 `http://localhost:3101/infidao`。静读 6 秒未自动请求下一句；主动点词、返回和前进通过。应用进程重启后，同一会话已完成结果直接重放，未再次调用模型。
- 使用 `.dockerignore` 规则复制到无本机密钥和缓存的临时目录后，构建、类型检查和独立 standalone 的页面、健康接口、字体清单请求通过；这不等于 Docker 镜像或目标 HTTPS 网关验证。
- 本机没有 Docker；源站 Docker 的内存约束及现有容器自动恢复行为见上方现场记录。公网分段和设备验收尚待目标环境验证。
