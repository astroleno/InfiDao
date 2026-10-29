# 诗词篇 · 精选 1,000 首

用户于 2026-10-29 确认将本轮内容量改为精选 1,000 首；作品展开、点词、跨典籍阅读与历史记录功能保持。

| 类别 | 作品数 |
| --- | ---: |
| 唐诗 | 550 |
| 宋词 | 280 |
| 宋诗 | 60 |
| 五代词 | 25 |
| 元曲 | 35 |
| 楚辞 | 20 |
| 汉诗 | 10 |
| 清词 | 20 |

共 182 位署名作者（按资料原样），1,051 个连续原文片段。唐宋诗词的选本标签构成骨架，再补充作者、体裁和情境；排除存目、未解码私用字、剧本文段及同作者相同开头的重收。35 首元曲按 `yuan-selections.json` 从六条组曲记录中逐首界定原文范围，保留组曲原名和来源坐标。不是学术定本，也不宣称作品归属已经独立考订。逐条作者、篇名、来源位置、Git blob、原文哈希及选择理由见 `selection.json`。

数据来自 [palemoky/chinese-poetry](https://github.com/palemoky/chinese-poetry/tree/041b8ab50bdf07bf498bba2d1666b1d1fd707f4e)，固定提交 `041b8ab50bdf07bf498bba2d1666b1d1fd707f4e`（fix-typo）。72 个实际正文来源文件均经 Git blob 核对。保留原字与规范换行；例如李白《静夜思》使用该来源的“牀前看月光……舉頭望山月”版本，不改成其他通行异文。现代译文、注释、序言、作者传记与 GPL API 服务代码未纳入；数据 MIT 声明保留在版本目录的 LICENSE。

`data/content-packs/manifest.json` 的首项为当前包，其后可登记旧归档。已发布目录不可原地修改；新修订生成到新目录，完整校验后切换。保留旧目录才能按指定修订读取旧全文。停用偏好不删除归档、已读片段、收藏与注脚。整包不是浏览器下载资源；首屏仅取目录，全文按作品按需读取并缓存最多 32 首。

运行时要求 Node 22.13+（腾讯使用 24.22.1），使用内置只读 SQLite，不新增数据库服务。16 个分片共 4,337,664 字节，含压缩作品与片段、FTS5 字词/规则意象索引、64 维本地派生向量及来源定位。向量不是外部语义模型；主题规则只是检索依据，不能当成作者本意。分片格式 `poetry-ngram-v2:64:deflate-1`，JSON 压缩字典见 `shared/content/codec.cjs`。核心语料、核心向量及 `guji-core-v1` 身份不变。

`related-texts.json` 保存机械近文线索，运行 `node scripts/poetry/audit-related.mjs` 可复核。检索避免同文或高度相近的原文同时占据结果，作品详情仍保留各自原字和上游归属；这些线索不是作者考证或思想传承结论。精确原句统一繁简、标点与换行检索，展示和引用坐标始终使用规范原文。

## 重建与校验

1. 获取上游 Git 元数据；按照 `sources.json` 的固定提交与范围运行 `node scripts/poetry/acquire.mjs <git目录> <临时来源目录>`。脚本校验每个文件 Git blob；来源池仅用于离线选编，不随应用发布。
2. 已发布选集使用现有 `selection.json` 重建；不要重新运行选编来替换发布清单。编辑下一版清单时先核定 `yuan-selections.json` 的逐曲范围（工具 `curate-yuan.mjs`），再运行 `node scripts/poetry/select.mjs <临时来源目录>`，审阅后固定新的选集版本。
3. 在新目录运行 `node scripts/poetry/build-corpus.mjs <临时来源目录> data/poetry/<新目录>`。脚本拒绝覆盖已有 manifest，核对每一条所选原文与来源，任何漏收、重复或排除都会失败。保留 `identity-map.json`，无上游 ID 且正文校勘的歧义需人工核实后显式迁移；不凭标题相同推断身份。
4. 字体仅补所选原文、篇名和作者需要的新字。使用任务内 FontTools/Brotli 环境，按 `font-coverage.json` 的地址与 SHA-256 核对源字体，再运行 `scripts/poetry/build-fonts.py <字体> <quality.json> <来源URL>`；不改原有字体轮廓，保留对应许可证。
5. 切换内容目录后运行 `node scripts/poetry/validate.mjs <临时来源目录> <报告.json>`，逐作品核验原文、修订、UTF-16 片段、向量及全部可见字形；运行 `node_modules/.bin/tsx scripts/poetry/measure-runtime.ts <报告.json>` 检查冻结预算。运行 `node scripts/poetry/check-rebuild.mjs <临时来源目录> <报告.json>`，确认相同 Node/SQLite/zlib 环境重建逐分片字节一致。

部署使用构建好的不可变分片，不在生产重新选编。回退切回完整应用及其内容目录组合；来源暂不可用时保留当前已读片段，不能换最新版冒充旧全文。索引与字段不兼容时隔离可选包并继续核心阅读。

检索繁简映射派生自 OpenCC 1.1.9 的 TSCharacters 字典，Apache 2.0 声明见 `shared/content/OpenCC-LICENSE`；不改作品原文。新增字体许可证见 `public/flow-fonts/Noto-OFL.txt`、`Hanazono-LICENSE.txt` 与 NOTICE.txt。代码依项目 MIT 许可，第三方数据和字体依各自声明。
