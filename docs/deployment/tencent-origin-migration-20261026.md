# InfiDao 腾讯运行服务与阿里双入口

本文记录 2026-10-26 的迁移基线。2026-10-28 已发布 `9dd9a94`，最新运行版本及两域复审见[腾讯同步与公网 App 感复审](../reviews/2026-10-28-tencent-public-app-feel-review.md)。

2026-10-26 已将正式 Node、Redis 和手写后台迁到腾讯上海 `122.51.59.89`。`tongye.me`、`aitoshuu.me` 的 DNS、证书和 HTTPS 网关继续在阿里 `47.103.120.24`；两个 `/InfiDao` 入口保持各自域名。旧阿里三个服务已停止并禁用自启，原目录与回滚配置保留。

冻结运行版本为 `infidao-570e028e8b3ee676`。先前域名和驼峰路由同步的四个源码文件与该版本 provenance 中的摘要一致，本次一并归档；没有把工作区其他功能重新构建上线。

## 腾讯运行环境

| 项目 | 正式位置 |
| --- | --- |
| 应用链接 | `/opt/infidao-current/app` |
| Node | `/opt/infidao-runtime/node-v24.22.1/bin/node`，回环 `3109` |
| Redis | `/opt/infidao-runtime/redis-7.4.11/bin/redis-server`，回环 `6389` |
| 手写 Python | `/opt/infidao-runtime/handwriting-venv/bin/python`，Python 3.10.12 |
| systemd | `infidao-web`、`infidao-redis`、`infidao-handwriting` |
| 私有环境 | `/etc/infidao/app.env`、`handwriting.env`、`redis.conf` |
| 持久数据 | `/var/lib/infidao/redis`、`handwriting`、`app` |

环境文件的字节摘要与迁移前一致，未修改会话密钥、服务商密钥、Redis 口令、命名空间或每日模型限额：访客 30、IP 60、全站 200。Redis AOF 和手写 SQLite 状态在停止写入后复制，6 个状态文件、27,369,866 字节逐文件核验一致；手写库完整性为 `ok`，保留原有 2 条任务与 2 条请求记录。

目录权限必须按目标机账户重新设置，不能直接沿用源机器的数字 UID/GID：`/etc/infidao` 为 `root:infidao-redis`、`0750`；`redis.conf` 同组 `0640`；私有 `.env` 为 root 的 `0600`，由 systemd 读取。应用和手写数据归 `infidao`，Redis 数据归 `infidao-redis`。本轮验收已修复目录属组造成的 Redis 读取失败，随后以实际服务身份、认证 `PING`、服务状态和公网接口复验。不能以启动命令成功或 HTML 200 代替 Redis 就绪检查。

## 两端路由

- 腾讯 http 上下文安装一次 `deploy/nginx/tencent-public-host-map.conf`；`aitoshuu.art` 的 HTTPS 扩展配置引入 `deploy/nginx/tencent-infidao-origin.inc`。白名单只接受两个公网域名，来源只允许阿里 IP 与回环。
- 阿里原 `infidao-locations.inc` 引入 `snippets/infidao-tencent-gateway.inc`，对应 `deploy/nginx/aliyun-infidao-gateway.inc`。上游固定腾讯 IP，开启并验证 `aitoshuu.art` 的 TLS/SNI；原始公网 Host、HTTPS 和客户端地址由受控网关重写。
- `/InfiDao`、其子路径、现有 `/_next/`、`/flow-assets/`、`/flow-releases/`、`/api/flow` 及 `/api/handwriting/` 均转到腾讯。根级 Next 资源仍由本应用独占，新增项目不得抢占这些既有路径；其他项目使用自己的前缀。
- 纯小写和大小混写以同域 308 归一，只修改项目前缀。页面分享信息、阅读返回、历史导航均使用 `/InfiDao`，保留当前域名、其他查询参数和片段。
- 两端流式代理关闭缓冲与缓存；腾讯保留 Brotli 静态资源、真实 404 和正确 MIME。Cookie 维持 Secure、HttpOnly、SameSite=Strict 及 host-only，不跨域共享浏览器数据。

## 发布、验证与回滚

候选先在隔离 Redis、零模型额度环境完成 19 项检查，再停止原站写入、复制最终状态、启动腾讯正式服务。必须等待实际账户可读取配置、Redis 认证 `PING` 返回 `PONG`、三个服务稳定运行及会话/存储接口正常后，才切换阿里 include。共享配置修改前重新读取现网，通过 `nginx -t` 后重载，保留邻站改动。

最终九项目公网回归 219/219，通过 54 个入口、94 个脚本样式引用、26 个深层/404/私有路径、14 个接口守卫、18 个 HTTP 升级、4 个首页/WWW 和 9 个两域内容等价比较。浏览器确认两域阅读画面和各自 canonical；手写能力、无效请求及私有任务查询已通过，模型服务的认证 TLS 连接返回 200。未重新验收完整付费内容生成质量、真机与压力负载。

阿里受影响配置备份在 `/var/backups/nine-projects-migration-20261026/`。生产切换后若要回滚，先停止腾讯写入，将最新 Redis 与手写持久状态核对并同步回阿里，再启动相同兼容版本、验证服务后恢复网关。不能直接启用迁移前的旧数据库，避免丢失新会话、任务或重置额度。静态项目可独立回滚，但不得覆盖其他项目的最新配置。

临时探针、私有测试环境和迁移 SSH 访问在验收后清理。正式服务、生产私有环境及必要回滚材料保留；网站名称、个人网站属性、页面内容及备案材料没有修改。
