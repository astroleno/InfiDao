---
title: InfiDao App 感交互迭代 · Emil 独立复审
date: 2026-10-28
reviewer: Emil 独立评审子 agent
scope: 已确认 App 感方案、工具层运动、焦点交接与连续心流
status: review-only-final-with-validation-gap
---

# InfiDao App 感交互迭代 · Emil 独立复审

后续说明（主线程）：本报告之后的意见复核、菜单补修和真实指针验证见[菜单修复与交付](2026-10-28-app-feel-menu-followup.md)。下文保留独立评审时的结论。

本轮已明显补上「动作之后发生什么」：自己的注脚拥有完整阅读宽度，打开注脚能接住注意力，新分支有主动进入的到达入口，来处开始成为可见的阅读关系。共享移动截图与结构化记录支持这些改善。

**结论：Flag，保留一项动态验收缺口。** 初查提出菜单动画重新抓取的 P2 问题及「回到来处」的 P2 历史时序候选，主线程均已修正；后续实测发现的 Next 历史状态竞争也已收束。当前没有已知未解决的 P1／P2 代码问题。关闭动画中段持有180ms后继续拖动已有有效样本；打开动画中段仍未捕获有效样本，完整动态矩阵尚未获得证实，不能写作全项通过。下文保留原定级和证据边界，198 项最终共享单测不替代这些判断。

## 1. Before / After / Why

| Before | After | Why |
| --- | --- | --- |
| 原 E7：注脚正文与导出、删除争用同一横行，390px 样本正文仅约 9.6px。 | 正文独占阅读列；编辑、纪念卡与删除另起可换行操作区。390px 共享样本正文宽 249.6px、20px 字号，320px 记录为 204.8px。 | 「注我」需要给自己的理解以正常阅读地位；不靠缩字或改动整体阅读列解决。 |
| 原 E2：从菜单打开注脚，焦点返回边缘把手，目标可能留在屏外。 | 注脚标题进入视口约 25% 处并获得焦点；输入框仍等待读者主动选择。 | 菜单动作与目的地连成一次交接；聚焦标题也避免主动召出触屏软键盘。 |
| 原 E1：分支追加并保留原位置，但等待消失后没有持续可见的回应。 | 主要阅读带之外的新首句显示「沿『词』已接续 · 去读」；点击后再定位并聚焦新经文。 | 保留读者原读点，同时把「这一念得到了回应」变成可发现的因果关系。 |
| 原 E4：Back 同时关闭释义并退阅读分支，来处依赖记忆。 | 临时任务登记独立浮层历史；共享样本第一次 Back 保留子路径，第二次再回父路径；菜单与温故补充来处。 | 用户可以预判一次返回会离开哪一层，也能追认自己的阅读选择。 |
| 原 E5：松手跨过阈值后才播放入场，退出立即隐藏。 | 连续 `progress` 跟随拖动，释放速度交给同一 spring；按下即接管未完成运动，保留退出表现状态，键盘走即时切换。 | 工具层开始与阅读场使用同一空间方向；F1 保留本轮复审发现与修正证据。 |
| 原 E6：hover 改变把手高度，触屏也可能留下 hover。 | 固定命中框，用内部 `scaleY` 强调，hover 限定精细指针。 | 去掉不必要的布局动画，保持触屏、键盘与指针各自清楚的反馈。 |
| 收藏反馈仅在已关闭菜单的隐藏状态里。 | 阅读层短暂显示真实存储结果；未持久化时明确标为「仅本次可用」或失败。 | 一次动作能确认结果，失败也不伪装成永久保存成功。 |

## 2. 独立性、来源与范围

本报告先读 `graphify-out/GRAPH_REPORT.md` 的 God Nodes 及社区结构，再按 Community 10 的阅读／快照／导航联系、Community 26 的注脚和 Community 7 的光学文本联系检查本轮变更。图报告为 2026-10-20 的导航线索，不作为最新源码证明；God Nodes 多为 `parse`、`trim` 等通用节点，也不代替模块审阅。

评审按 `emil` 路由读取 `emil-design-eng` 与 `apple-design`，以[用户已确认方案](../plans/2026-10-28-app-feel-iteration.md)和[原 Emil 独立前端报告](2026-10-28-frontend-emil-review.md)为基线。未读取另一视角报告或本轮主汇总，未开浏览器、运行测试、调用模型、制作手写任务、派发 agent、修改产品源码或发布。

源码基线为工作区 HEAD `480493827443e382434c825afdf58f69401d75f9` 上的本轮未提交改动，包含 `FlowExperience`、`FlowStream`、`FlowMenu`、`NotesPanel`、`EditableNote`、`LibrarySheet`、`useFlowDialog`、`flow.module.css`、`history.ts`、新增 `overlay-history.ts` 与直接相关的 `controller-host.ts` 来处接口。源码复核包含主线程在收到本报告反馈后的修订。不把既有 `package.json`、`package-lock.json` 或 `.tmp-shots` 改动计入本轮。

三种证据分开使用：

- **共享实测**：主线程在本机后台、固定内容条件下提供的截图、控件矩形和状态记录，本评审员实际查看初版共享图，补看最终320／390px注脚图与祖先来处图；不冒充本人亲手操作。
- **代码机制**：本轮工作区源码和 diff，可支持状态与控制流判断，不能据此证明动画体感、帧率、真机触摸或读屏通过。
- **待验证推断**：由明确代码路径推得的特殊时序，需要连续画面或真实浏览器轨迹才能确认实际影响。

[最终共享检查汇总][test-summary]报告18个测试组、198项全部通过，应用类型检查、改动文件ESLint与diff检查通过。本评审员只读取结果，没有执行测试；测试结果不能替代下列独立体验审阅。

## 3. 已解决及有边界的改善

### 注脚可读性与目的地交接：原 E7、E2 已有直接证据

[最终390px注脚图][notes-image]显示正文正常横排，操作在正文之后，未再挤成单字长列。初版[注脚记录][notes-data]给出正文宽249.59375px、字号20px；注脚标题y=210.90px，焦点为「自己的注脚」，阅读处于停驻。桌面1450×713的[补充记录][notes-feedback-data]中，标题y=178.40px、输入框y=238.40px，均在可读区域，焦点也到达标题。

结构修复见 [NotesPanel.tsx:88](../../src/components/flow/NotesPanel.tsx#L88)、[EditableNote.tsx:11](../../src/components/flow/EditableNote.tsx#L11)；整列、换行与输入框盒模型见 [flow.module.css:524](../../src/components/flow/flow.module.css#L524)、[flow.module.css:547](../../src/components/flow/flow.module.css#L547)。[FlowStream.tsx:178](../../src/components/flow/FlowStream.tsx#L178)的定位同时同步物理滚动、逻辑滚动、手动滚动状态和光学测量，[FlowStream.tsx:194](../../src/components/flow/FlowStream.tsx#L194)在下一帧交给标题，不强制聚焦 textarea。

[最终320px图][notes-320-image]中正文保持约204.8px宽，删除自然移到下一行，文字与操作均可辨。[最终边界复验][boundary-data]确认320／390px正文宽分别为204.796875／249.59375px，编辑与删除均为44×44px；它替代早期34px按钮矩形的证据，解决了初查的版本差异。390px的720字样例正文宽仍为249.6px，`scrollWidth=390`；该长文结论来自几何记录，最终两张图是短文样本，不把它们冒充720字全文截图。已有共享记录还覆盖编辑、取消、保存、删除、撤销；最终样例已清理。

### 分支回应与个人来处：原 E1 与 E4 的主要缺口被接住

[分支图][arrival-image]中，「沿『止』已接续 · 去读」清楚留在阅读场底侧，并未覆盖主要经文。[分支与历史记录][branch-data]显示首句到达前后 `top=0`，读者原位置不变；主动进入后新段标题 y=211.23px、焦点为 `BLOCKQUOTE`、`top=296.5`。这证明本样本中「保留位置 → 读者主动进入 → 新段接焦点」成立。

[FlowExperience.tsx:127](../../src/components/flow/FlowExperience.tsx#L127)只从已呈现的真实分支创建到达状态；[FlowStream.tsx:206](../../src/components/flow/FlowStream.tsx#L206)检查目标几何，[FlowStream.tsx:821](../../src/components/flow/FlowStream.tsx#L821)把导航留给「去读」。本轮没有把追加方式改为强制跳屏，也没有因此发起新请求。

[最终祖先来处菜单图][origin-image]把「沿『而后』而来／回到来处」放在眼前经句之前；其后再分「眼前经句」与「自己的阅读」，层级能解释动作作用域。来处来自已存记录；最终源码按当前所选经句的 `pathId` 匹配对应来处，见 [FlowExperience.tsx:502](../../src/components/flow/FlowExperience.tsx#L502)、[FlowMenu.tsx:28](../../src/components/flow/FlowMenu.tsx#L28)、[FlowMenu.tsx:185](../../src/components/flow/FlowMenu.tsx#L185)和 [LibrarySheet.tsx:65](../../src/components/flow/LibrarySheet.tsx#L65)。复验以实际保存的 `parentEntry` 为准，没有继续沿用脚本原先「点到止」的假设。菜单返回时序另见F2。

### 普通面板 Back 与工具层运动：改善成立，不能等同全部动态验收

[分支与历史记录][branch-data]中，第一次 Back 后子路径与 `trail=2` 保持、读点仍为 296.5；第二次 Back 回到父路径、`trail=1`、读点 0；再 Forward 到子路径时对话框数为 0。[手势与面板记录][gesture-data]还记录添一念、温故、纪念卡第一次 Back 保留原阅读分支，添一念和温故回到菜单把手焦点。

浮层模块只增加自己的 `flowOverlay` 标记，并保留原history状态；菜单到目标任务在同一次提交内替换浮层。相关机制见 [overlay-history.ts:27](../../src/lib/flow-browser/overlay-history.ts#L27)、[overlay-history.ts:84](../../src/lib/flow-browser/overlay-history.ts#L84)、[overlay-history.ts:130](../../src/lib/flow-browser/overlay-history.ts#L130)。[useFlowDialog.ts:44](../../src/components/flow/useFlowDialog.ts#L44)也避免旧菜单清理时强夺新任务焦点。

工具层已由 keyframe 改为持续的 MotionValue 与 spring，打开和关闭共用右侧路径，关闭后保留表现层直到结束，并及时设为 inert；见 [FlowMenu.tsx:43](../../src/components/flow/FlowMenu.tsx#L43)、[FlowMenu.tsx:53](../../src/components/flow/FlowMenu.tsx#L53)、[FlowMenu.tsx:83](../../src/components/flow/FlowMenu.tsx#L83)。共享记录的拖动中面板 x=240px、宽300px且尚未设 modal，支持「松手前已有中间状态」；还记录纵向不误开、快速重开、反向取消与键盘关闭通过。单张[菜单图][menu-image]只能判断静态布局，不能证明速度连续、60 FPS 或每个中断时刻都顺滑。

### 收藏反馈与小控件工艺

共享记录包含可见「已收藏」及取消收藏成功；[FlowExperience.tsx:456](../../src/components/flow/FlowExperience.tsx#L456)在实际存储结果之后区分已持久化、仅本次可用和异常，反馈不抢焦点，2.8 秒后退出。[flow.module.css:219](../../src/components/flow/flow.module.css#L219)的把手已改用 transform，并限制 hover 设备；[flow.module.css:419](../../src/components/flow/flow.module.css#L419)添加按压反馈，减少动态样式覆盖这些反馈。

## 4. 本轮复审问题、修正状态与建议验收

P1 表示阅读行动失去可用结果或下一步；P2 表示可恢复但破坏空间／路径预期；P3 为局部工艺改进。当前未新增 P1。

### F1 · P2：动画途中按住再拖会使用过时位置；机制已修，关闭样本通过、打开样本仍缺

**初查为源码确定，体感未实测。** 初版在 pointerdown 保存 `progress`，spring 要到移动超过 8px、方向成立之后才停止；随后又用按下时的 `start.progress` 计算新位置。该机制先前对应初版 `FlowMenu.tsx` 第90、97、111行，修订后这些行号已移动，不能把原编号链接误作当前实现。

如果读者在开关途中按住片刻、面板继续移动，然后才拖动，首次拖动会由较旧的表现位置计算，而非接住当前画面。这与「可以随时重新抓住并反向」的目标存在机制差距；已有快速重开与一般反向取消记录没有覆盖按住等待的这一时序，不据此宣称实际出现了多少像素跳变。

**修正源码复核。** 当前 [FlowMenu.tsx:92](../../src/components/flow/FlowMenu.tsx#L92)在pointerdown即停止未完成spring，再保存当前表现值；[FlowMenu.tsx:103](../../src/components/flow/FlowMenu.tsx#L103)、[FlowMenu.tsx:129](../../src/components/flow/FlowMenu.tsx#L129)和 [FlowMenu.tsx:137](../../src/components/flow/FlowMenu.tsx#L137)分别使纵向判定、未成拖的轻点及取消继续原目标。它消除了初查的「继续动画但保存旧基线」机制，未靠加速参数掩盖交接。

**共享动态补验。** [最终复验][boundary-data]使用实时按钮矩形上的直接鼠标坐标点击，再在动画帧边界注入DOM pointer事件。关闭途中按住180ms，`before=held=81.8264px`，继续拖动40px后为121.826px，停留漂移0、跟随误差约0.0004px，支持本样本接管位置正确。打开方向返回`No intermediate spring`，未形成有效中间帧样本，汇总也明确`heldSpring.passed=false`。不能据此声称打开方向必然跳变，也不能把它当作完整矩阵通过；这是本报告保留的验收缺口。主线程已停止本轮采样，本评审员没有扩大验证。

**验收。** 在入场和退出各约 1/3、2/3 处按住 150–300ms 后反向拖动，再松手；连续记录停留前、首次拖动和松手帧。面板须从接管时可见位置继续，不跳回按下时旧值；原文字按钮不误触，取消后焦点稳定。

### F2 · P2 候选：菜单「回到来处」的重复历史遍历风险；已修机制并取得单次返回轨迹

**初查为代码推断。** 菜单 `act` 先关闭菜单，再同步执行来处操作；初版 `history.returnTo()` 在当前仍有 overlay 时调用带额外浮层偏移的 `history.go()`。菜单随后卸载，其注销微任务若仍见旧 marker 且未进入 `returningFrom`，又会执行 `history.back()`。两个异步遍历的提交时间可能重叠，使「回到来处」多退出一段；本评审员没有把该推断写成修复前浏览器已经复现。

初版单测的父路径返回用例先 `returnTo`、等待遍历后才注销浮层，未模拟菜单动作同次提交的清理时序；普通 Back 面板关闭通过也不能消除此候选。

**修正源码与共享补验。** 当前 [history.ts:54](../../src/lib/flow-browser/history.ts#L54)明确向浮层模块报告真实遍历；[overlay-history.ts:158](../../src/lib/flow-browser/overlay-history.ts#L158)登记 `traversing`，注销微任务在 [overlay-history.ts:141](../../src/lib/flow-browser/overlay-history.ts#L141)避让已有遍历。[最终边界记录][boundary-data]的三层路径从 C 菜单返回 B，只记录一次 `go(-2)`，没有额外 `back`，最终 path/trail 正确。该轨迹支持修订版本的这条返回路径成立；不反推初版一定已发生多退。

**共享补充结果与验收边界。** 同一份最终记录还从叶路径的较早祖先经句打开菜单，显示该祖先的实际来词，返回其父根路径时只执行一次`go(-3)`。因此「当前叶路径来处」和「回读祖先的自身来处」均有有效轨迹。普通关闭、快速重开、Forward及首次进入的结果使用第3节证据，不把每种组合都扩大为已实测。

### F3 · P2：Next异步恢复可能覆写阅读路径／来路；已修并完成共享回归

此项来自主线程在真实后台浏览器中的共享排查反馈：返回后再次接续时，Next自身的popstate恢复会异步覆写`flowPathId`／`flowTrail`。本评审员未亲自复现原故障，也不把最终成功记录反写成原故障录像。

当前 [history.ts:28](../../src/lib/flow-browser/history.ts#L28)在capture阶段处理地址仍属于本阅读路由、state含字符串`flowPathId`的事件，阻止同一历史项再触发框架树恢复；离开阅读路由时仍交还框架。`dispose`以相同capture选项移除监听，见 [history.ts:69](../../src/lib/flow-browser/history.ts#L69)。这是对同一读者历史事件所有权的修复，没有新增生成或重置来路。

[最终复验][boundary-data]覆盖三层分支带菜单刷新、叶返回、再次接续后读取祖先来处及回根，均保留对应path/trail；[最终共享检查][test-summary]包含浏览器历史与浮层历史回归。本项按「共享实测发现＋源码复核修复＋共享回归」记录，不冒充本评审员自己操作验证。

## 5. 保留项与验收局限

已确认的自动奔流及「手动滚动恢复流动」继续有效。原 E3 的规则已由用户确认，本轮只把首次说明改为「点空白停驻」「上下滑动继续流动」，不再把保留规则列为设计违约，也不擅自增设速度或常驻播放条。

黑底、水膜、火彩、康熙经文字体、64% 阅读列、短句分行、交替入场、慢滚逐字显现，以及 20 / 16 / 12px 和 400 / 500 层级均应保留。[flow.module.css:115](../../src/components/flow/flow.module.css#L115)仍为 64%／最大692px 阅读列，首部字号 token 保持三档；本轮 diff 未以削减这些表现换取工具层改善。没有重新评定核心光学渲染或推导现有画质必然顺滑／必然掉帧。

共享`gesture-and-panel-observations.json`的第一轮刷新受本机磁盘满、IndexedDB不可写影响，记录中路径由原分支变成新根路径。该条不能写为「刷新恢复通过」，也不能据此认定本轮历史机制损坏。后补的[最终边界复验][boundary-data]显示C菜单打开时刷新，原三层path/trail和906.5px读点保持、`storageWarning=false`；本样本排除了该环境干扰。

尚未重做真实软键盘、iPhone Safari／微信真机、系统读屏、减少动态实际操作、连续慢放、几十轮长读或稳定60 FPS 验收。样例为固定内容，没有真实模型或付费手写调用；本报告也不是公网版本核验。

[notes-image]: assets/2026-10-28-app-feel/mobile-notes-final.png
[notes-320-image]: assets/2026-10-28-app-feel/mobile-notes-320-final.png
[menu-image]: assets/2026-10-28-app-feel/mobile-ancestor-origin-final.png
[arrival-image]: assets/2026-10-28-app-feel/mobile-branch-arrival.png
[origin-image]: assets/2026-10-28-app-feel/mobile-ancestor-origin-final.png
[notes-data]: assets/2026-10-28-app-feel/notes-observations.json
[notes-feedback-data]: assets/2026-10-28-app-feel/notes-and-feedback-observations.json
[branch-data]: assets/2026-10-28-app-feel/branch-and-history-observations.json
[gesture-data]: assets/2026-10-28-app-feel/gesture-and-panel-observations.json
[boundary-data]: assets/2026-10-28-app-feel/final-boundary-retest.json
[test-summary]: assets/2026-10-28-app-feel/test-summary.json
