# 手写纪念卡公网发布与 tongye 入口

## 已确认目标

用户于 2026-10-25 要求提交、推送本次接入并同步公网；`https://tongye.me/InfiDao` 应显示同一阅读应用，地址栏保留该域名和路径。沿用已经批准的零生成费用、水膜画质、经文字体和 20 / 16 / 12 字号。稳定 60 FPS 继续按此前决定单独迭代。

## 模块与接口

- 沿用现有 InfiDao Web 服务及原子发布目录，增加独立 Python 制作 Worker、专用虚拟环境和 `/var/lib/infidao/handwriting` 私有持久目录。Web 和 Worker 访问同一 SQLite 数据库。
- Nginx 在目标域名代理阅读页、静态资源及 `/api/flow`、`/api/handwriting`；Next 内部将 `/InfiDao` 及子路径重写到已有 `/infidao` 页面，浏览器地址保持原样。
- `session-identity.ts` 从 `FLOW_PUBLIC_ORIGIN` 与显式的 `FLOW_ALLOWED_ORIGINS` 识别允许的站点；写请求的 Origin 必须与请求 Host 对应，不改写浏览器 Origin。生产允许域名为 `https://aitoshuu.me` 和 `https://tongye.me`。
- `ReadingClosingCards` 返回阅读时沿用当前入口大小写。两个域名的 Cookie 和本机阅读记录分别保存，不新增跨域个人记录同步。
- `INKO_API_KEY` 通过私有文件传入后台环境，源码、公共资源与提交中不包含密钥。

## 发布验收

- 生产构建、standalone 运行与 Python 素材准备依赖可用；Worker 和 Web 均持续运行。
- 两个 HTTPS 入口、字体、脚本、手写素材接口及静态纪念卡可以取回；`tongye.me/InfiDao` 没有跨域跳转。
- 两个允许域名分别取得会话；跨域 Origin、未知 Host 和另一会话的私人任务访问被拒绝。
- 同源真实公开样本生成、成品取回和清理通过，报价与实际费用均为零。
- 切换前保存原发布目录、服务和代理配置，失败时恢复；既有个人站点继续可用。

发布结果与具体检查数据在实际切换后补充。
