# 现有材质分光增强验收

> 此版本的技术检查通过，但用户随后否决视觉结果，并指出手机中央过宽。该记录不代表用户认可视觉效果；后续按计划 012 修正。

日期：2026-10-21。用户确认在当前效果上加强；保持柔焦、Bend、逐字浸染、白色阅读区及现有导航。

## 修改

- `miniprogram/flow/renderer.js` 保留原八次粗糙玻璃透射及前后玻璃通道。连续流最终玻璃增加屏幕空间的光谱采样：6 个波长位置，正负主光谱，16% 强度的二级光谱；减去共同白光，增强彩边而不增加可读白字副本。
- 通过 `u_diffractionStrength` 显式开启，`u_diffractionBend` 接收同一次 `drawSource` 的 Bend 参数。读取已完成浸染遮罩的现有文字缓冲，再与前景一起经过原 Bend；没有新增可见画布、图形上下文、纹理或绘制通道。
- `src/lib/flow-browser/stream-glass.ts` 使用增强强度 3.6。外围分离距离随曲面转角增加，中央关闭新增颜色，侧缘继承原材质的平滑淡出。原轮式渲染默认不启用，减少动画时关闭。
- 不修改页面布局、字体、导航、正文副本或点词命中逻辑。

## 自动检查

8 组、82 项测试通过：

- `flow-render-passes`：原通道顺序、一次 Bend、显影纹理复用；分光显式开启、强度边界、减少动画关闭、Bend 参数一致。
- `flow-stream-glass`：当前文字和位置、源模糊与衰减、前景和显影、大小变化、图形丢失恢复。
- `flow-stream`、`flow-entrance-motion`、`flow-bend`、`flow-ribbon-optics`、`flow-reading-continuity`、`flow-stream-actions`。

`npm run type-check`（app 与 scripts）、涉及 3 个 TypeScript 文件的 ESLint、渲染器 JavaScript 语法检查及 `git diff --check` 通过。

## 实际页面

使用已有 4 段保存内容，所有检查的 `/api/flow` 请求为 0，新增模型调用为 0。预览服务使用零调用上限，未修改持久额度配置。

| 视口 | 保存段落 | 光学状态 | 横向溢出 | WebGL 错误 |
|---|---:|---|---:|---:|
| 390×844 | 4 | ready | 0 | 0 |
| 320×740 | 4 | ready | 0 | 0 |
| 844×390 | 4 | ready | 0 | 0 |
| 1440×900 | 4 | ready | 0 | 0 |

同位置前后截图：手机 scrollTop=1041，桌面 scrollTop=1009。中央 38%–62% 高度范围（横向各排除 20px）逐像素差值为 0；外围颜色通道最大值与最小值之差的累计量，手机由 303559 增至 713129，桌面由 2296396 增至 3734483。该数值用于证明新增光谱实际出现，不代表感知亮度或物理能量。

交互结果：

- 浸染进行到 350ms 时触摸暂停，3 段显影暂停；推进受控时钟至 900ms 后画布 SHA-256 完全一致。继续流动后像素变化。
- 动画过程中触摸实际投影的“先”，只命中原生按钮一次，所属 frame 保持，焦点进入同一按钮并完整显字；右箭头移动至同段下一按钮。
- 减少动画时无显影标记、原生文字 opacity=1、transform=none，切回后不重播。
- 实际触发 `WEBGL_lose_context` 后原生文字可见；恢复后同一按钮保留，WebGL 错误为 0。
- 原生触摸滚动和已读内容回访通过，旧字不重新显影。

## 预览与边界

本地素材位于 `.codex-screens/2026-10-21-diffraction/`：

- `mobile-before.png` / `mobile-final.png`、`desktop-before.png` / `desktop-final.png`。
- `narrow-final.png`、`landscape-final.png`。
- `diffraction-ink.mp4`：1.55 秒真实页面逐帧捕获，展示新增光谱与浸染同步；为 50ms 间隔的受控时钟捕获，不用于设备帧率测量。
- `final.json`、`pixel-comparison.json`、`motion-final.json`、`interaction-final.json`。

手机覆盖为 Chromium 设备模拟，未进行实体 iOS Safari 或低端设备性能测试。本轮没有提交、推送或发布。浏览器检查结束后恢复原 434.5px 阅读位置与暂停状态，关闭本轮检查页面。
