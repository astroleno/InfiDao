# 六经注我 App 感交互迭代：lama 独立复审

日期：2026-10-28。对象为当前工作区本轮改动；本报告不代表公网版本或实体手机验收。

后续说明（主线程）：本报告之后的意见复核、菜单补修和真实指针验证见[菜单修复与交付](2026-10-28-app-feel-menu-followup.md)。下文保留独立评审时的结论。

## 结论

本轮方向符合已确认设计。注脚从挤在操作旁的一列恢复为可读的个人文字；菜单、接续到达提示与返回层级开始围绕同一条阅读路径工作。读者可以先留在原句，再主动进入接续，经文与“我”的联系更容易辨认，连续奔流的主体没有被新的页面结构拆散。

原 lama 评审的两个 P1——注脚排版／交接和面板返回吞掉分支——已在本轮源码及主线程共享的本机样本中得到改善。本次独立源码审阅发现三项 P2：连续流滚回祖先路径时来路入口遗漏，取消收藏持久化失败时仍使用成功措辞，菜单拖动时移动目标覆盖按下时的经句归属。主线程修复后，我再次独立检查了源码，并核对最终导航记录与新增用例，三项直接成因均已解除；下文保留原始定级和修复记录。当前未发现仍未解决的 P1／P2，但本机有限样本和源码复核不能替代完整动态及实体手机验收。

## 方法与证据

使用 `lama → appllama-app-design-skill`，采用其中的导航语义、手势连续性、焦点交接、按压反馈及完整状态循环原则。现有 Next.js／React 网页、水膜渲染、黑底、康熙字体、64% 阅读列和既定字号层级均为前提。本次没有迁移 Expo，没有外部竞品研究，也没有要求恢复已删除的正文小标题。

按要求先阅读本机 `graphify-out/GRAPH_REPORT.md` 的 God Nodes 和社区结构，再读 [本轮确认方案](../plans/2026-10-28-app-feel-iteration.md)、[原 lama 评审](2026-10-28-frontend-lama-review.md)，最后追踪目标组件和历史模块。图谱中的 God Nodes 多为通用函数，Community 3／7／10 提供控制器、光学与阅读状态的导航线索，不能直接替代当前源码。检查了本轮目标文件的 `git diff`；既有 `package.json`、`package-lock.json`、`.tmp-shots` 不纳入本轮评价。

证据分为：

- **本人查看的共享截图**：已实际打开本轮归档的[390px 注脚](assets/2026-10-28-app-feel/mobile-notes-final.png)、[320px 注脚](assets/2026-10-28-app-feel/mobile-notes-320-final.png)、[分支到达](assets/2026-10-28-app-feel/mobile-branch-arrival.png)及[祖先菜单](assets/2026-10-28-app-feel/mobile-ancestor-origin-final.png)。此前还查看了原样本 mobile-notes.png、mobile-menu.png、mobile-menu-with-origin.png；这些未归档截图来自主线程本机共享目录 `/Users/aitoshuu/.codex/visualizations/2026/09/23/01a0ce68-325a-7800-8109-3a9b252ac7a3/app-feel-20261028`。静态图可证明对应布局，不能证明动态顺滑。
- **主线程共享的交互记录**：下表记录由主线程采集，我读取并核对其与源码的对应关系；我本人未操作浏览器。
- **代码确认／代码推断**：能由状态和条件直接确定的问题标为代码确认；涉及浏览器异步时序和实体设备表现的风险单独列为待复验。
- **共享自动化结果**：读取[归档测试摘要](assets/2026-10-28-app-feel/test-summary.json)，18 套、198／198 项通过、失败 0；摘要还记录应用类型检查、改动文件 ESLint 和差异格式检查通过。我阅读了与本次问题对应的新增用例，没有运行测试；该结果不等于本人逐项操作复验，也不等于帧率、真实模型、实体手机或公网通过。

| 共享资料 | 本次使用范围 |
| --- | --- |
| [注脚布局记录](assets/2026-10-28-app-feel/notes-observations.json) | 390px 注脚标题交接、正文宽度、字号、横向溢出 |
| [窄屏与反馈记录](assets/2026-10-28-app-feel/notes-and-feedback-observations.json) | 320px 操作换行、编辑／取消／保存／删除／撤销，桌面定位，收藏及取消可见结果 |
| [分支与历史记录](assets/2026-10-28-app-feel/branch-and-history-observations.json) | 屏外接续、主动去读、面板 Back、下一次分支 Back、Forward |
| [手势与面板记录](assets/2026-10-28-app-feel/gesture-and-panel-observations.json) | 跟手位置、纵滑不误开、快速重开、反向取消、键盘关闭、添一念／温故／纪念卡 Back；首轮刷新处于磁盘满及 IDB 不可写期间，刷新结论排除，以最终补验为准 |
| [最终边界补验](assets/2026-10-28-app-feel/final-boundary-retest.json) | 三层路径刷新、叶／祖先各自来路及直接返回；720 字长注脚无横向溢出；320／390px 编辑和删除均为 44×44px；关闭弹簧中段持有及跟手有有效样本，打开中段未捕获，完整中断矩阵未通过 |

## 已解决及有证据支持的改善

| 项目 | 本轮判断与证据 | 界限 |
| --- | --- | --- |
| 原 L2：注脚正文被操作挤成单字列（P1） | `EditableNote` 将正文与 `noteActions` 分开；`noteItem` 改为块布局，操作可换行。共享 390px 样本正文宽 249.59px、20px 字号；320px 正文宽 204.80px，横向滚动宽仍为视口宽。两张最终截图中正文独占完整阅读列；390px 操作同行，320px 删除自然换到下一行。[NotesPanel:88](../../src/components/flow/NotesPanel.tsx#L88)、[EditableNote:11](../../src/components/flow/EditableNote.tsx#L11)、[样式:547](../../src/components/flow/flow.module.css#L547) | 最终记录另含 390px 下 720 字注脚：正文宽 249.59px、高 2160px，scrollWidth=390；320／390px 编辑和删除均为 44×44px，纪念卡为 114×44px。尚无 1000 字上限、XL 字号和真实软键盘的完整可视证据。 |
| 原 L2：打开注脚没有目的地交接（P1） | 注脚标题可聚焦，打开后一次定位到视口约四分之一，重置逻辑滚动并重新测量光学层。390px 标题 y=210.90；桌面标题 y=178.40、输入 y=238.40，焦点均为“自己的注脚”。定位对象是标题，未强制输入。[NotesPanel:81](../../src/components/flow/NotesPanel.tsx#L81)、[FlowStream:178](../../src/components/flow/FlowStream.tsx#L178) | 键盘出现后的遮挡、iOS 焦点滚动及不同高度仍需真实环境复验。 |
| 原 L1：一次 Back 同时关闭释义并退出分支（P1） | 临时工具使用独立的 `flowOverlay` 历史标记；共享样本第一次 Back 保持分支、trail=2、top=296.5，第二次才回根路径、top=0；Forward 回分支且 dialogs=0。添一念／温故／纪念卡的共享 Back 样本也保留原分支。最终补验又覆盖三层路径、直接返回及刷新。[useFlowDialog:11](../../src/components/flow/useFlowDialog.ts#L11)、[overlay-history:84](../../src/lib/flow-browser/overlay-history.ts#L84) | 这是指定本机路径的通过证据；真实浏览器系统返回手势及跨路由离开仍缺实体设备证据。 |
| 原 L3：收藏确认仅在不可见状态区（P2） | 成功／取消结果进入阅读层可见 `role=status`，2.8 秒后消退；成功文案等待存储结果。共享记录确认“已收藏”可见及取消反馈。异常写入有单独提示。[FlowExperience:119](../../src/components/flow/FlowExperience.tsx#L119)、[FlowExperience:456](../../src/components/flow/FlowExperience.tsx#L456)、[样式:792](../../src/components/flow/flow.module.css#L792) | 下文保留初审取消失败的措辞问题及其修复；正常成功样本不能覆盖失败分支。 |
| 屏外接续的主动到达 | 仅当真实分支首句不在主要阅读区时给出“沿某词已接续 · 去读”；去读明确定位、聚焦经句，不在请求开始时提前滚走。共享样本分支到达时 top 仍为 0，点击后 top=296.5，焦点为 BLOCKQUOTE，目标 y=211.23。[FlowExperience:131](../../src/components/flow/FlowExperience.tsx#L131)、[FlowStream:206](../../src/components/flow/FlowStream.tsx#L206)、[FlowStream:821](../../src/components/flow/FlowStream.tsx#L821) | 支持保留读点再主动转向；没有据此宣称全部流式失败／取消时序通过。 |
| 菜单跟手及任务交接 | 动作使用同一个进度值控制位移和遮罩，松手后弹簧收束，新的按下可捕获并停止现有动画；菜单动作直接交给新目的地。共享记录含 300px 面板拖至 x=240、纵滑不误开、快速重开、反向取消及键盘关闭。[FlowMenu:53](../../src/components/flow/FlowMenu.tsx#L53)、[FlowMenu:87](../../src/components/flow/FlowMenu.tsx#L87)、[useFlowDialog:44](../../src/components/flow/useFlowDialog.ts#L44) | 关闭中段的最终采样支持按下冻结、持有和跟手，见下文精确记录；打开中段未捕获，仍不能证明完整中断矩阵、连续帧无跳变或稳定 FPS。 |
| 原 L4／L5：第一步及个人来路更明确（P2） | 首次提示明确“点空白停驻”；现有菜单分出“自己的阅读”。分支菜单和温故列表显示词／一念来路，祖先来路的源码修复见 LA1；未把导航常驻到正文。[FlowExperience:549](../../src/components/flow/FlowExperience.tsx#L549)、[FlowMenu:185](../../src/components/flow/FlowMenu.tsx#L185)、[LibrarySheet:65](../../src/components/flow/LibrarySheet.tsx#L65) | 没有以此宣称陌生访客理解度已验证；相同一念重复造访同句时，用户辨认成本仍需研究，不能凭新增标签断言已解决全部回找情景。 |

## 本次发现与修复复核

严重度沿用原评审：P1 使当前意图或位置实质偏离；P2 增加辨认、验证或寻找成本，影响持续阅读。以下三项原始定级均为 **P2**；修复后记录为已解决，不改写初审时的判断。

### LA1 · P2 · 连续流滚回祖先路径时，菜单遗漏该路径自己的来路

**初审证据：代码确认，未由本人操作浏览器。** 初版只从 `recordRef.current` 构造来路；该引用表示当前控制器的末端路径。滚回流中更早的经句时，[handleReadEntry:302](../../src/components/flow/FlowExperience.tsx#L302) 只切换 `activeEntryRef` 和经句。初版菜单又以 `reading.pathId === origin.pathId` 限制显示，因此 A→B→C 后滚回 B，B 的菜单没有 B 已保存的词／一念及回 A 入口。B 的记录仍在 `recordsRef`，没有数据丢失。

这使“回到来处”只覆盖最新路径；读者沿同一条连续流往回阅读时，自己的选择链又变得不可见。修复应同时处理显示及返回目标，不能只取消路径判断，或继续把按钮绑定到末端路径的无参数返回。

**建议与验收：** 按菜单所属 `pathId` 解析已加载记录及其父路径，让返回动作也明确针对该路径。用 A→B→C 固定数据，在 C、B、A 分别打开菜单；C 标识 C 来路并回 B，B 标识 B 来路并回 A，根 A 没有伪造来路。再用两条不同一念经过同一句经文，确认按访问路径区分。

**修复复核：** [FlowExperience:502](../../src/components/flow/FlowExperience.tsx#L502) 现从全部 connected records 生成 `readingOrigins`；[FlowMenu:28](../../src/components/flow/FlowMenu.tsx#L28) 按当前菜单 `reading.pathId` 选对应来路，回调在 [FlowExperience:507](../../src/components/flow/FlowExperience.tsx#L507) 显式带父路径，最终由 [controller-host:94](../../src/lib/flow-browser/controller-host.ts#L94) 返回。新增祖先菜单匹配用例通过；[最终记录](assets/2026-10-28-app-feel/final-boundary-retest.json) 中，叶菜单显示“本末”来路，以一次 `go(-2)` 回直接父级；后来滚回祖先，其菜单按实际保存的“而后”来路显示，以一次 `go(-3)` 回该祖先的父级，没有额外 `back()`。已实际查看[祖先菜单截图](assets/2026-10-28-app-feel/mobile-ancestor-origin-final.png)。此项在源码、用例和共享本机轨迹范围内已解决。

### LA2 · P2 · 取消收藏持久化失败时，仍先告诉读者“已取消收藏”

**初审证据：代码确认，未做故障注入。** 初版在 `persisted=false` 时给取消操作返回“已取消收藏，本机存储暂不可用。”；保存失败则正确说明“仅本次可用”。[storage:110](../../src/lib/flow-browser/storage.ts#L110) 先更新会话内存，再尝试持久化；删除失败后磁盘旧收藏可能仍在，刷新后会再次出现。临时内存中的取消有效，不等于已经持久取消。

该文案没有说明取消的实际寿命，读者可能认为已完成永久取消，和确认方案“持久化失败不显示成功”不一致。笼统的全局存储提示不足以解释哪一次操作可能恢复。

**建议与验收：** 例如改为“取消仅本次生效，刷新后可能恢复，请稍后重试。”。让 `deleteBookmark` 单独返回 `persisted:false`，断言不显示无条件成功，并说明刷新后可能恢复；正常取消仍只给一次安静确认。初审时反馈测试只覆盖新增收藏失败，因此要求补齐取消失败分支。

**修复复核：** [FlowExperience:473](../../src/components/flow/FlowExperience.tsx#L473) 现明确显示“取消仅本次生效，刷新后可能恢复，请稍后重试。”，没有无条件“已取消”承诺。已阅读新增的取消失败用例，主线程告知通过。该文案问题已解决；本人未进行实际存储故障注入。

### LA3 · P2 · 菜单拖动的移动目标覆盖按下时已经确定的经句

**初审证据：代码确认归属优先级有误，实际发生频率未测。** [FlowStream:727](../../src/components/flow/FlowStream.tsx#L727) 在按下时通过 `opticalHit` 决定视觉命中的经句，并把结果放进 `pointer.current.key`。初版开始拖菜单时虽然取回这份 press，却优先使用移动事件的原始 `event.target.closest('[data-stream-key]')`，之后才回退 press 的 `key`。

当指针从按下的段落边缘移动到另一段，或水膜视觉命中与未变形 DOM 所属文章不同，菜单就可能使用另一段经句的释义、收藏和注脚。归属应在按下时确定；需要保留视觉命中映射已经完成的工作。原实现使用 `start.key`，本轮跟手改造引入了这个覆盖关系。

**建议与验收：** 当前阅读 surface 内优先使用 `start?.key`，无有效 press 时再从目标或当前段降级。用两个可区分经句，从 A 按下后在 B 上越过菜单拖动阈值，菜单仍属于 A；同时覆盖水膜视觉命中和原 DOM 不一致的 press，及从把手打开的正常当前段。验收不需要新增模型调用。

**修复复核：** [FlowStream:841](../../src/components/flow/FlowStream.tsx#L841) 现优先使用 `start?.key`。该覆盖关系已解除；已阅读新增交叉经句 press 用例，主线程告知该用例及 flow-stream 共 40 项通过。真实水膜区域的指针命中仍不等同于已在实体手机逐项操作。

## 剩余真实问题

截至最终源码及共享证据复核，没有新确认且仍未修复的 P1／P2。上列三项已修直接成因；未取得有效动态样本的部分仍保留验证限制，不将其改写为产品无缺陷的证明。

## 验证结果与后续验收

区分已经补齐的边界和仍需补采的证据；未实测项不冒充产品故障，也不写成已通过。

| 路径 | 当前证据与下一步 |
| --- | --- |
| 菜单内直接“回到来处”：已补验 | 初审提出 `go(...)` 后 cleanup 再发 `back()` 的时序风险，未冒充浏览器复现。当前 [history:58](../../src/lib/flow-browser/history.ts#L58) 显式返回正在遍历历史的状态，[overlay-history:140](../../src/lib/flow-browser/overlay-history.ts#L140) 跳过额外关闭返回；deferred 导航同样统一处理。新增 close-first／navigate-first 三层路径用例通过，最终实际菜单轨迹为各自一次 `go(...)` 且返回目标准确。仍不把初审假设改写为曾在浏览器复现的 P1。 |
| 框架与阅读历史归属：已修复并补验 | 主线程后续浏览器复验定位到 Next 在 `popstate` 后异步覆写 path／trail，和前一项 cleanup 风险是不同成因。已独立复核 [history:22](../../src/lib/flow-browser/history.ts#L22) 的深链 metadata 补全，以及 [history:28](../../src/lib/flow-browser/history.ts#L28) 的捕获处理：只接管合法阅读 pathname 且带 `flowPathId` 的 entry，跨 route 不截断框架监听，保留 Next 原有 state；移除监听时沿用 capture 参数。对应边界用例与最终本机三层返回记录支持该范围的修复。 |
| 刷新：以有效补验为准 | 第一轮刷新样本处于磁盘满／IDB 不可写状态，其 path／trail 改变排除为无效样本。最终记录中进入叶路径和刷新后 `path`、三层 `trail`、top=906.5 完全一致，storageWarning=false。另一次脚本曾在到达提示下一帧之前跳过“去读”，保存的是祖先原读点；该结果符合保留读点的设计，不能判为刷新丢失来路。 |
| 完整动作质量：部分有证据 | 最终记录中关闭弹簧的位移在按下前和持有 180ms 后均为 81.8264，漂移为 0；再移动 40px 后为 121.826，与预期相差约 0.0004px。该单一关闭样本支持捕获当前值及跟手。打开中段仍为 No intermediate spring，记录总项 passed=false，完整中断矩阵未通过。尚无本人观看的全流程录像、逐帧检查或稳定帧率测量，不能将这一个样本扩展为全部开关、反向、取消及减少动态效果通过。 |
| 长文本与键盘 | 最终共享记录已覆盖 390px 下 720 字注脚，正文无横向溢出；320／390px 短样本及操作触区也有最终截图和测量。1000 字上限、横屏、XL 字号、真实 iOS／Android 软键盘仍未完整覆盖。现有标题交接不自动弹键盘是已批准取舍，应继续保留。 |

## 保留项与后续精修

- 保留一条连续经文流、黑底、水膜火彩、康熙字体、64% 阅读列与既定短句分行；本轮工具改动没有给出降低核心画质或改成普通文章页的理由。
- 保留“原地等待结果，再主动去读”的空间关系。到达入口属于读者选择，不应改成每次接续自动跳走。
- 保留“自己的注脚”正文独占一行及标题交接；保存、导出、删除应该服务于文字，不应再次挤压正文。
- 保留按需来路和现有菜单中的“自己的阅读”，不新增常驻面包屑、强制开场输入或回合边框；生成内容的身份仍按已确认规则在原文等按需位置说明。
- 可选精修：当前 [统一按压样式:419](../../src/components/flow/flow.module.css#L419) 也缩放整条菜单选项。lama 的列表行原则更偏向背景高亮或不改变字形的反馈；建议以后单独处理菜单行，避免高频选择时整行文字缩放。本次没有动态录像证明其造成可见故障，不将其提高为阻塞项。

## 局限与完成条件

本报告是独立 lama 源码及共享本机证据复审；没有读取另一位评审报告或主汇总，没有启动子 agent，没有改产品代码、测试或其他报告，没有运行浏览器、测试、真实模型或付费手写任务，也没有提交、推送或发布。

三个 P2 已完成独立源码复核，对应新增用例通过；菜单“回到来处”、刷新、720 字长注脚及 320／390px 操作触区得到共享本机证据支持。关闭弹簧中段持有及跟手已有有效样本，打开中段未捕获，完整中断矩阵仍未通过。实体手机系统返回、软键盘、读屏、字体放大、低性能设备连续动画、几十轮长读和公网部署也未由本评审通过，不能声明稳定 60 FPS 或把本机固定内容结果扩展为真实服务质量证明。
