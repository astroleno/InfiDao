# InfiDao · 六经注我

原生微信小程序。黑底、玻璃折射与色散，采用用户指定的竖直转经筒结构，结合持续向上流动。五层水平经文共用一根竖轴：中心清晰，上下渐隐、渐模糊。WXML/WXSS + Canvas WebGL，字体解析器随包内置，无 web-view。

## 运行

微信开发者工具导入本目录，项目类型「小程序」，已配置用户指定的测试 AppID `wx5f0a423b84cafbef`。不需要构建 npm、不需要云环境、不需要 API key，直接编译 `pages/flow/index`。

## 体验

- 打开即进入示例经文流；常态只显示经文，提示自动淡出。
- 初始念头选择安顿/相处/起步中的一条 mock 路径，之后自动持续上升。
- 轻点停驻，当前短句归中并保持原来的字号、位置；其他经句退暗，下方展开完整经句、句意与此刻解读，底部出现「一念 / 原文 / 继续」。
- 上下拖动回看；所有文字只绕竖轴旋转，中心短句保持水平，无整体倾斜。
- 点「原文」，同一句经文连同解读一起向上移动，露出出处和原文；原文末尾可切换前后完整段落。阅读和流动共用一个场景。
- 「继续」先收回解读和原文，再逐渐恢复流速，保留原进度；输入抽屉有进入和退出过渡，弹出后才唤起键盘。
- 后台和卸载停止动画与未完成的过渡。WebGL 或画面承接失败时保留原生静读、完整解读和前后段切换，支持恢复流动。
- 黑场保留极淡的中心渐晕与静态墨颗粒，叠加亮度不超过约 3%。呼吸随经轮位移缓慢推进，停驻和后台冻结，继续时接续；开启系统减少动态效果时，新背景只保留静态材质。

## 内容与接口

mock 包含三组各八段的阅读路径，按组回环。经典摘录来自仓库 `data/rysxguji/guji-core-v1.jsonl`；每段有 `sourceId`、原文与出处。`meaning` 是人工整理的句意，`reflection` 是主题相关的示例解读，均与原文分开。拆分的流动短句保留所属完整经句，阅读序号以段落计。mock 不根据用户全文生成个性化分析，不调用任何线上服务。

`flow/provider.js` 是唯一的内容入口，返回结构化经文帧。未来 DeepSeek 接入放在自己的服务端/云函数，小程序不携带凭证。V4.1 Flash 的官方 API 模型名为 `deepseek-flash`；配置与接口设计见 [DESIGN.md](docs/DESIGN.md)。本轮没有接入或调用 DeepSeek。

## 字体

流动经文按距中心的连续距离缩放：中间最大，上下逐渐缩小，并按实际手机透视限制字距，避免放大后裁字。原生阅读层、输入和 Canvas 字形统一使用用户指定的 CoScroll 默认字体「润植家康熙字典美化体」（400 字重），不请求 CDN。页面字体的 WOFF 共约 214 KiB，内嵌数据约 286 KiB，覆盖当前 mock 内容与界面文案；任意新输入中未收录的字仍按系统衬线字体回退。

流动经文使用随包的 OpenType.js 2.0.0 解析同一份 WOFF 字体，按字符查找字形并缓存，只在建立或更换图集时绘制；动画逐帧继续使用原有 WebGL 纹理。不调用 `fillText`、不查询 Canvas 字体名称，不依赖 `wx.loadFontFace` 的 native 作用域，因此画布不能将字形替换成系统黑体。已移除单独的 91 字轮廓表；增加字体内已有的字不需要生成轮廓或调整渲染代码。实际 iPhone 显示仍待复验。

主字体来自相邻 CoScroll 项目实际使用的 `public/fonts/润植家康熙字典美化体.ttf`；原文件缺少的「慥殀烝脩蹞」五个古字以 [Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc) 补齐。来源与版权记录见 `assets/fonts/NOTICE.txt`、`manifest.js`；`OFL.txt` 仅适用于补字字体。要扩充离线子集，可用 fonttools 运行 `python scripts/build-font.py /path/to/润植家康熙字典美化体.ttf /path/to/NotoSerifSC[wght].ttf`。正式构建无需安装 fonttools，也不依赖 CoScroll 工作区。

[微信 `wx.loadFontFace`](https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html) 支持 HTTPS 和 Data URL，后者要求基础库 3.7.9 起。目前只为原生页面文字注册 webview 字体；画布解析同一字体文件的字形。`createGlyphSource(sources)` 可接收 WOFF/TTF/OTF 的 ArrayBuffer、字节视图或 base64，不依赖 mock 字表。自定义字体并非只能走 CDN：完整字库或分片可由自己的 HTTPS 服务、对象存储或 CDN 提供。当前随包字库仍限于 665 个用字；接入动态内容时需要提供足够覆盖的字体文件及其加载逻辑，不再需要逐句导出轮廓。缺字会明确进入原生阅读降级，不会悄悄改用黑体。

## 验证

```bash
cd miniprogram
npm run check
npm test
```

`node scripts/build-content.cjs` 从仓库本地语料重新生成 mock 选文，同时验证引文。原生编译、视觉和触摸交互必须在微信开发者工具验证，不能用浏览器预览替代。
