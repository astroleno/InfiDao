# 六经注我 · 原生小程序

## 已确认目标

用户于本次任务明确授权：结合所提供 React/Three 参考的黑底、玻璃透射与色散，以及 Simon Rogers 的持续上升运动，原生实现微信小程序。后续视觉反馈将形体明确为**竖直转经筒**：五层水平经文环绕同一根竖轴，中间清晰，上下逐层渐弱、渐隐、渐模糊。初始一念之后持续流动，不逐轮要求输入。本轮使用 mock 内容，DeepSeek V4.1 Flash 留待后续接入。

## 设计与模块

- `pages/flow`：单屏阅读、一次输入、轻触停驻/继续、拖动回看、原文抽屉；原生 WXML/WXSS，没有网页嵌套。
- `flow/scene`：横轴「布带」结构——经文短句绕一根水平轴（X 轴）依次倾斜排布，位置曲率平缓、逐行倾斜更强，远离中心的行自然透视压缩；每段经文拆为短句，一屏约五到七行连续可见。
- `flow/renderer`：原生 Canvas WebGL 1；白色字形图集、两个带深度缓冲的离屏场景，分别计算背面和正面的体积折射；不同波长使用不同折射率。逐行倾斜由顶点着色器按行位置计算（angle ∝ y），色散主要由字形着色器的色差采样携带，阅读行清晰、远离行彩虹边渐强。绘制频率上限约 30 fps，DPR 上限 2。
- `flow/timeline`：独立时钟；按时间推进，触摸暂停推进、隐藏停止、恢复不快进。
- `flow/provider`：mock provider；`open(seed)` 返回 `{kind, seed, journey, frames, cursor}`，展示层不依赖模型、凭证或网络协议。
- `content/passages`：从项目本地语料选取并保留 sourceId/fullText；三个主题各八段，解读为明确的人工示例。mock 按整组自然回环，不声称无限生成。

视觉：纯黑空间、白色宋体经文、字面色差（chromatic fringe）与玻璃折射。经文如一条竖直布带持续向上流过一根水平轴：中心行水平清晰，上下行逐行向深度倾斜、透视压缩、渐隐。画面不显示标题、品牌副标题、念头摘要、桥接语或解读。首次提示「轻点停驻」自动消失；停驻后只出现「一念 / 原文 / 继续」。轻点停驻时当前短句用 420 ms 回到画面正中。输入和原文、示例解读仅按需展开。

结构沿革：初版为竖直转经筒（五层水平环带共竖轴），参考 [Met 藏品](https://www.metmuseum.org/art/collection/search/32640)；本版改为 Simon Rogers 式的横轴 ribbon——逐行向 +Z 深度倾斜（[参考](https://loadmo.re/posts/simon-rogers)），行间构成连续曲面而非独立环带，解决环带结构的稀疏离散感。原生 WebGL canvas 会遮盖同区域 DOM，页脚与提示条位于画布下方的 DOM 带，抽屉打开时隐藏画布。

实际参考来源：用户提供的 `src/ring.tsx`（圆柱、白字、MeshTransmissionMaterial，thickness=2/backsideThickness=5），[Simon Rogers 原站](https://www.simonrogers.info/) 的逐行 rotateY + translateY 动画，以及用户新指定的转经筒结构；结构核对参考 [Met 藏品](https://www.metmuseum.org/art/collection/search/32640)。最终按用户要求取消斜向/螺旋升角，采用水平文字带和固定竖轴。

本轮在当前仓库增加独立 `miniprogram/`，不需要分支或工作树。使用微信开发者工具原生模拟器验证。用户已指定测试 AppID `wx5f0a423b84cafbef`；当前阶段不上传、不发布、不请求 LLM。

## 验收

1. 原生小程序直接编译运行；无 web-view 和 React 运行时依赖。
2. 冷启动自动进入示例流；可输入一念并切换主题；之后无需反复输入。
3. 画面为同轴的五层经文，只显示经典短句；中间清晰，上下对称衰减；中心短句水平对齐。解读、出处和原文位于按需阅读层。
4. 点击停驻并居中/继续，拖动回看，查看原文并关闭后保持原阅读进度；后台不继续推进；整个 mock 周期首尾连续。
5. mock 跨主题有连续语义，经典出处可追溯；不把示例解读当作原文。
6. WebGL 不可用时保留静读与换段能力；故障可重试；静读可由用户主动选择。
7. 测试覆盖时间步进、拖动/回环、生命周期、内容真实性与 provider 边界；记录模拟器视觉与交互结果。

## 后续 DeepSeek

2026-09-22 核对官方文档 https://api-docs.deepseek.com/zh-cn/ ：V4.1 Flash 使用模型名 `deepseek-flash`，OpenAI 兼容地址 `https://api.deepseek.com/chat/completions`。

后续通过自己的服务端/云函数转发，服务端保存 `DEEPSEEK_API_KEY` 和模型配置。小程序只请求经文帧；服务端检索已验证原文，让模型生成 reflection/bridge，返回经过校验的结构化数据。切换 provider 时仍须处理缓存、预取、取消、重试、费用边界与内容审核；本轮不伪造线上接入。
