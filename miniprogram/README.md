# InfiDao · 六经注我

原生微信小程序，WXML/WXSS + Canvas WebGL，无 web-view。测试 AppID：`wx5f0a423b84cafbef`。

## 当前交互

- **流动时只见全屏经轮**。五层水平经文共用竖轴，邻行交错、以不同速度缓慢旋转；中心放大清晰，上下逐渐缩小、模糊、隐去。沿用康熙字形、黑场材质与玻璃色散。
- **持续向上、无限环流**。内容批次不是流动终点；后续未到或没有合适新内容时，已加载的经文继续流动。新内容在向前阅读边界接入。后台、用户停驻和减少动态效果仍按既有规则暂停。
- 点可读经句，让所选句归中；点空白停驻。短解随原有阅读层展开，其中带下划线的字词可进入新经文链。流动态没有底部短解区。
- 点击入口即锁定当前句和词义。等待时保留原画面，可取消；新句与字体准备好后同场景承接，再继续流动。新链仍可停驻、分叉。
- 停驻层提供「返回上条经文链」和「来路」；恢复原链的位置、行相位、停驻状态、原文展开状态与滚动位置。
- 一念、原文、自己的注脚均沿用原有入口。注脚只保存在本机，可删除和撤销。原文与人工整理/模型生成的联系明确区分。

上述布局与无限流动规则为用户 2026-09-23 的最新确认，覆盖早期提案中常驻短解和批次末尾等待的设想。

## 运行和服务

开发者工具直接导入此目录、编译 `pages/flow/index`，无需构建 npm。`flow/config.js` 的 `serviceOrigin` 留空时使用本地精选内容，可直接体验分叉与返回；精选内容不是个性化模型输出。

在线模式使用仓库已有的 Next.js 服务端：`POST /api/flow`，操作为 `open / branch / next`。服务端默认模型为 `deepseek-flash`，显式关闭 thinking；密钥只从服务端环境读取，支持 `FLOW_API_KEY / FLOW_BASE_URL / FLOW_MODEL`，否则复用 `DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL`。旧 `/api/search` 和 `/api/annotate` 接口保持原合同。

本机联调可在开发者工具中设置 `wx.setStorageSync('infidao-flow-service', 'http://127.0.0.1:3000')` 后重新进入页面；该覆盖只对 `platform === 'devtools'` 生效。用项目私有配置临时关闭 URL 校验，验证后恢复。移除该 storage key 即回到默认精选模式。手机端须在 `flow/config.js` 配置实际 HTTPS 服务，并配置微信合法域名；仓库不会自动发布服务。

服务端从本地语料选择和逐字校验引文、原文范围、来源与版本。模型负责检索线索、短解和候选联系；另一次校验过滤牵强关系、重复引文分叉及替用户作判断的解读。技术预测等不适合用古文回答的请求明确拒绝。无合适联系时不伪造新经文；原有流动继续。

服务端会话目前保存在进程内，最多 256 条、6 小时过期；重启后本机已保存的阅读仍可恢复，新的在线请求会提示会话失效。多实例正式部署需要共享会话存储。客户端内容/字体总并发为 2，预取仅一层，缓存 24 个准备结果；后台和卸载取消请求。

## 字体和资源

页面和 Canvas 使用同源字体：「润植家康熙字典美化体」及 Noto Serif SC 补字。Canvas 直接解析字体轮廓，不依赖 iPhone 的 Canvas 字体匹配，不会静默切换黑体。随包子集覆盖精选内容与界面文案。

动态经文使用 `public/flow-fonts/` 的 13 个 WOFF 分片，约 2.42 MiB，共 6,165 个有效字符。分片按需下载、字形缓存，动画不逐帧绘字。语料另含 51 个无对应字形的私用区编码，服务端不选择含这些编码的段落，不能猜字替换。全部 6,165 字已验证存在有效轮廓。

字体可由自己的 HTTPS 服务提供，**不要求 CDN**。分片文件名带内容哈希，与语料和字体版本一起记录。字体请求失败保留原生静读，不悄悄改换经轮字体。

重建需 fonttools 和原字体源：

```sh
python miniprogram/scripts/build-font.py /path/to/康熙.ttf /path/to/NotoSerifSC.ttf
python miniprogram/scripts/build-flow-fonts.py /path/to/康熙.ttf /path/to/NotoSerifSC.ttf
```

来源与许可记录保存在 `assets/fonts/NOTICE.txt`、`OFL.txt`、`manifest.js` 以及分片目录。正常运行和构建不依赖相邻 CoScroll 工作区。

## 验证

```sh
npm run check --prefix miniprogram
npm test --prefix miniprogram
npm run type-check:app
npx jest tests/unit/flow-service.test.ts tests/unit/flow-relations.test.ts --runInBand
```

`node scripts/check-flow-live.mjs` 是手动真实模型验证，会调用已配置的本地服务；默认不在 CI 中运行。测试语境见 `tests/fixtures/flow-contexts-v1.json`，输出默认在 `/tmp/infidao-flow-live.json`。

本轮验证记录及尚未完成的真机、网关、语义验收见 [BRANCHING-IMPLEMENTATION.md](docs/BRANCHING-IMPLEMENTATION.md)。模拟器成绩不能代替 iPhone/Android 真机结果。
