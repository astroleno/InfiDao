# U2 本地回归与上线状态

日期：2026-09-26

## 范围

按已批准迁移计划复核 `/infidao` 的浏览器渲染、输入、字体与生命周期。首页 `/` 仍是旧版入口，不能用首页截图判断新版经轮。

本轮未修改公网服务器、COS/CDN 或公开域名，未读取钥匙串。3003 上已有的旧生产预览保持运行；新的验证包使用独立构建目录与 3101 端口。

## 已修复

- 页面隐藏和 pagehide 时停止动画，清除触摸捕获与惯性；恢复时保留暂停状态，重置时间基准。
- 手势锁定 initiating pointerId，忽略第二根手指的移动、抬起和取消；在丢失捕获、切链、销毁时清理手势。
- pointerup 也检查位移，避免浏览器合并最后一次 move 后把拖动当作选词。
- WebGL 丢失时进入完整静读，并在 context 丢失期间释放旧 GPU 资源；成功重建后清除错误遮层。旧包实测会残留 `Glyph upload failed`。
- 暂停或恢复快照的首次绘制采用正确阅读状态；resize 中断暂停动画时保留用户的暂停意图。
- 原生非 passive wheel 监听支持像素、行、页三种单位，避免 React 被动事件中的 preventDefault 问题。
- Canvas 分辨率上限包含整数取整，并适用于 8K 尺寸。
- 宽屏/横屏按经轮前侧可读宽度调整字形大小，避免长句只压缩字距后重叠；竖屏与小程序字号保持原值。投影测试覆盖十字长句在三种横屏尺寸中的实际字形间距。
- 字体清单按资源基址隔离；并发调用等待同一分片和 FontFace 完成，损坏分片不会进入成功缓存。
- 字体加载失败时直接开放静读。恢复旧播放快照时，当前“减少动态效果”偏好优先，仍允许用户主动继续。

## 自动检查

- 六个相关 Jest 文件累计 25 个测试通过：runtime parity 7、renderer 3、pointer 2、fonts 1、font loading 3、host 9。
- `npm run type-check` 通过；随后生产构建再次通过 lint 和类型检查。
- `npm run lint` 通过。
- `npm test --prefix miniprogram`：109/109 通过。
- `npm run check --prefix miniprogram`：通过。
- 生产构建采用 `INFIDAO_BUILD_DIR=.tmp/u2-production npm run build`，避免覆盖正在运行的旧 `.next/standalone`。构建工具自动加入的临时 TypeScript 配置路径已还原。
- Next 仍提示 Browserslist/Baseline 元数据过期；本轮没有为消除提示更新依赖。

## 浏览器复核

验证脚本：`output/infidao-qa-2026-09-26/check-browser.mjs`，由 ego-browser TaskSpace 38 执行，日志与截图在同目录。使用桌面 Chromium 的实际 WebGL；移动尺寸和生命周期事件由 CDP/脚本模拟，不能当作真实 iPhone 验收。

最终生产包脚本全部通过，随后逐张检查截图：

| 检查 | 结果 |
| --- | --- |
| 390 × 844 启动、减少动态效果下静读 | 通过 |
| 本地「本末」分叉及返回父链 | 通过 |
| 两次 WebGL 丢失/恢复、保留静读、清除错误 | 通过 |
| 原生滚轮、模拟 pagehide/pageshow | 通过；后台 0 条 RAF、0 次 tick、画布像素不变，恢复 1 条 RAF |
| 1280 × 720、844 × 390、390 × 844 连续 resize | 通过；横屏长句不再重叠 |
| 已保存的播放快照在减少动态效果偏好下恢复 | 通过；静读层可见且暂停状态正确 |
| 阻断字体清单网络请求 | 通过；仍可查看完整经文和解释 |
| 正常路径的 console.error、页面错误及未处理拒绝 | 0 |

截图：

- [桌面](../../../output/infidao-qa-2026-09-26/production-desktop.png)
- [横屏](../../../output/infidao-qa-2026-09-26/production-landscape.png)
- [竖屏经轮](../../../output/infidao-qa-2026-09-26/production-mobile-wheel.png)
- [竖屏静读](../../../output/infidao-qa-2026-09-26/production-mobile-reading.png)
- [字体失败后的静读](../../../output/infidao-qa-2026-09-26/production-font-failure.png)

当前生产预览：本机 `http://localhost:3101/infidao`，同一网络 `http://172.20.10.4:3101/infidao`。地址取自本轮实际网卡，网络变化后需要重新确认。3100 临时开发服务已停止，3003 原服务未重启或替换。

检查过程也纠正了验证脚本的时序：等待原生 wheel 实际送达，再检查后台像素冻结；进入独立新页面建立可重复初始状态，并另外验证已保存播放快照的恢复。没有通过删除失败断言或放宽产品要求来宣称通过。

## 后续门槛

原计划明确要求在真实 iPhone Safari 和 iPhone 微信内置浏览器验证触摸词范围、字体、地址栏伸缩、画布位移和横竖屏，再开始 U1b。当前机器未提供这两种真机浏览器的可控环境，此门槛仍未通过。

U1b 共享链控制器、U3 完整阅读与持久化适配、U4 浏览器在线内容服务/会话生命周期、U5 资源发布以及 U6 联调与发布验收仍未完成。现有本地精选 UI 是验证支架，不能据此宣称公网迁移已具备发布条件。
