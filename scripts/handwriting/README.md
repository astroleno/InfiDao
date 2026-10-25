# 手写纪念卡后台

## 运行

Web 和独立 Worker 使用相同的服务器环境：

```dotenv
INKO_API_KEY=仅在服务端配置
HANDWRITING_DATA_DIR=/var/lib/infidao/handwriting
HANDWRITING_PYTHON=/opt/infidao-handwriting-venv/bin/python
# 生产环境继续使用既有 FLOW_SESSION_SECRET 和 FLOW_PUBLIC_ORIGIN。
```

在专用虚拟环境安装 `requirements.txt`，项目根目录运行 `npm run worker:handwriting`。
本地开发自动读取项目 `.env.local`；未指定目录时使用已忽略的 `.tmp/handwriting`。
生产环境必须显式指定持久目录，不可放在随发布替换的源码目录或公开静态目录。
本地也应配置至少 32 字符的固定 `FLOW_SESSION_SECRET`，以保持 Web 进程重启后的任务归属。
本地 Web 进程的 `FLOW_PUBLIC_ORIGIN` 应与浏览器访问地址一致；使用 `127.0.0.1` 和自定义端口时，请在启动 Web 进程时明确指定完整地址。

Worker 单独运行，由进程管理器恢复。HTTP 创建接口仅事务写入 SQLite，不依赖请求结束后的临时任务。
一个数据目录通过操作系统锁只运行一个 Worker；进程异常退出会自动释放锁，最多 60 秒后领取过期租约。
Web 与 Worker 需要访问同一块支持 SQLite 锁的本机持久磁盘；多主机或无服务器环境需要先替换任务存储适配器，不可将 SQLite 放在共享网络盘。

Linux systemd 示例（按现有站点运行用户调整）：

```ini
[Unit]
Description=InfiDao handwriting worker
After=network-online.target
[Service]
Type=simple
User=infidao
WorkingDirectory=/opt/infidao-current
EnvironmentFile=/etc/infidao/infidao.env
ExecStart=/usr/bin/node scripts/handwriting/start.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/infidao/handwriting
[Install]
WantedBy=multi-user.target
```

## 边界

- `/quote` 与 `/layout` 的 `price.list_cents` 必须明确为数字零，`unplaced` 必须明确为零；否则绝不创建生成。
- 只使用账号实际可用的 `lyric-1` 字迹，始终保留可见 AI 标识；不更改账号常用字迹，不调用 DeepSeek、不充值、不训练字迹。
- SQLite 事务保留请求、内容摘要、稳定上游幂等键和已确认任务 ID；网络不确定时继续核对原任务。
- 下载或整理失败后复用原生成任务；不会为修复本地成品而重复生成。清理操作通过请求撤销记录防止晚到 POST 重新建任务。
- 默认单 Worker、单会话一个未完成任务、每天最多 20 个新任务、站点排队上限 40。恢复与缓存复用不创建新的上游生成。
- 后台素材和选中文字保留七天；取消、清理、过期任务均屏蔽晚到结果。取消上游请求是尽力同步；上游未确认的网络写入不会通过新幂等键重新提交。
- 本机 IndexedDB 缓存独立于阅读数据库，图像按 80 MiB 预算收敛；草稿、来源修订与待清理任务保留用于恢复。用户可以在面板清理全部手写记录。
- 来源修订只保存时间与 SHA-256 摘要；清理标记和标签页同步防止晚到结果恢复旧图片。原注脚仍由阅读数据库管理。
- `scene.zip`、原始 PNG/PDF 和元数据只保存在私有目录。HTTP 素材必须验证当前会话归属，前端不接触服务端密钥或上游签名链接。
- 引用上游渲染器的 MIT 许可证与固定版本见 `vendor/inko/`。仅载入其渲染函数，不运行上游 CLI 或编辑器。

公网部署时，需让既有站点代理将 `/api/handwriting/` 同源请求转发至 InfiDao Web 服务，并保持不缓存；增加独立 Worker 与持久目录后再发布。此接入未自动修改公网代理。

## 验证

```sh
python3 -m unittest discover -s scripts/handwriting -p 'test_handwriting.py' -v
npx jest --runInBand tests/unit/handwriting-contracts.test.ts
npm run type-check:app
```

真实生成、浏览器合成和主阅读性能分别记录；后台或无界面运行的帧率不代表真实前台 60 FPS 验收通过。
