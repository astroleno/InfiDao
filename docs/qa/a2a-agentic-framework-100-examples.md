# A2A Agentic Framework 100 Test Examples

Date: 2026-06-16
Status: test design

## Scope

这份清单用于后续补齐 A2A 与整体框架测试。设计边界沿用
`docs/architecture/a2a-agentic-growth.md`：A2A 是服务端内部 typed object
编排，不是公开远程 agent 网络。

每 10 条由一个独立测试设计 agent 负责一个风险面，共 100 条。用例编号
保留为稳定引用，便于后续转成 Jest、route integration、UI component 或人工 smoke。

## Agent A: Protocol Contract

A01. **最小合法 Envelope 识别**

- 输入/前置条件：对象含 `id`、`traceId`、`from`、`to`、`act`、`createdAt`、`payload`，`act` 为 `encounter`。
- 执行动作：调用 `isAgentMessage` 和 `assertAgentMessage`。
- 期望结果：返回 `true`；断言不抛错。
- 覆盖风险：基础 envelope 字段缺失或类型漂移导致 A2A 路由误接收或误拒绝。

A02. **空白字符串 Envelope 拒绝**

- 输入/前置条件：`id`、`traceId`、`from`、`to` 或 `createdAt` 任一为 `""` 或 `"   "`。
- 执行动作：调用 `isAgentMessage`。
- 期望结果：返回 `false`。
- 覆盖风险：空 id、空 trace、空 agent 地址进入协议链路，后续追踪不可用。

A03. **非法 Act 拒绝**

- 输入/前置条件：完整 envelope，但 `act` 为 `notify`、`search` 或大小写错误如 `Encounter`。
- 执行动作：调用 `isAgentMessageAct` 和 `isAgentMessage`。
- 期望结果：返回 `false`。
- 覆盖风险：外部领域动作或旧枚举混入 A2A 协议，破坏契约边界。

A04. **六类合法 Act 全量覆盖**

- 输入/前置条件：分别构造 `encounter`、`interpret`、`grow`、`reflect`、`link`、`memory_delta` 消息。
- 执行动作：逐一调用 `createAgentMessage` 后再调用 `isAgentMessage`。
- 期望结果：全部生成合法消息并通过识别。
- 覆盖风险：新增或重排 act 时遗漏兼容测试，某类合法协议动作被误判。

A05. **自动 TraceId 格式与稳定性**

- 输入/前置条件：相同 `from/to/act/payload/createdAt`，不传 `traceId`。
- 执行动作：调用两次 `createAgentMessage`。
- 期望结果：两次 `traceId` 相同，格式为 `trace:` 前缀加 18 位 hash 片段。
- 覆盖风险：trace 生成不稳定，导致同一协议事件无法关联或去重。

A06. **显式 TraceId 保留并参与 Message Id**

- 输入/前置条件：传入固定 `traceId`，其他字段相同。
- 执行动作：调用 `createAgentMessage`。
- 期望结果：返回消息保留该 `traceId`；`id` 为 `msg:` 前缀，并由显式 trace 与 envelope 内容共同决定。
- 覆盖风险：跨步骤链路 trace 被覆盖，或者 id 未绑定 trace 导致错误合并。

A07. **Message Id 对 Payload 变化敏感**

- 输入/前置条件：两条消息 `from/to/act/createdAt/traceId` 相同，但 `payload` 中一个字段不同。
- 执行动作：分别调用 `createAgentMessage`。
- 期望结果：`id` 不同；payload 原样保留。
- 覆盖风险：不同协议内容产生相同消息 id，导致缓存、存储或审计误判。

A08. **Payload 字段存在性边界**

- 输入/前置条件：构造 envelope 缺少 `payload`；另构造 `payload: null` 或 `payload: undefined`。
- 执行动作：调用 `isAgentMessage`。
- 期望结果：缺少 `payload` 返回 `false`；存在 `payload` 字段时通过 envelope 检查。
- 覆盖风险：把 envelope 校验误当 payload schema 校验，或遗漏 payload 字段导致下游处理异常。

A09. **时间戳创建与透传**

- 输入/前置条件：一条消息不传 `createdAt`；另一条传固定 ISO 字符串。
- 执行动作：调用 `createAgentMessage`。
- 期望结果：未传时生成非空 ISO 风格时间字符串；传入时原样透传，并影响 `traceId/id`。
- 覆盖风险：时间戳不稳定或不参与 hash，造成排序、追踪、复现困难。

A10. **旧客户端忽略可选 AgentTrace**

- 输入/前置条件：模拟 `POST /api/annotate` 响应，分别包含与不包含可选 `agentTrace`；旧客户端只读取原有 annotation 字段。
- 执行动作：用旧客户端解析逻辑读取响应。
- 期望结果：两种响应都不报错；旧客户端忽略 `agentTrace`；A2A 内部消息不泄露为公共 API 必需字段。
- 覆盖风险：可选公共字段变成强依赖，破坏旧客户端兼容。

## Agent B: Router Behavior

B01. **Intent 优先级**

- 输入/前置条件：`intent[0].label = "seek_guidance"`，同时 `emotion[0].label = "pressure"`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`enabled: true`；`relationTheme = "寻求指引"`；`branchLabel = "求取分寸"`。
- 覆盖风险：防止情绪信号错误覆盖意图信号。

B02. **Emotion 回退**

- 输入/前置条件：`intent = []`，`emotion[0].label = "pressure"`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`relationTheme = "压力中求定"`；`branchLabel = "先稳其心"`。
- 覆盖风险：验证 `primaryLabel` 的第二优先级。

B03. **Persona 回退**

- 输入/前置条件：`intent = []`，`emotion = []`，`personaHints[0].label = "nostalgia"`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`relationTheme = "旧忆回身"`；`branchLabel = "旧事新读"`。
- 覆盖风险：避免 persona 信号被忽略。

B04. **默认 Interpret**

- 输入/前置条件：`intent = []`，`emotion = []`，`personaHints = []`，可有或无 `memoryAnchors`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`relationTheme = "理解其义"`；`branchLabel = "照见其义"`。
- 覆盖风险：确认 memory anchor 不参与 `primaryLabel` 选择。

B05. **未知 Primary Label**

- 输入/前置条件：`intent[0].label = "unknown_need"`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`relationTheme = "此刻互注"`；`branchLabel = "由问生枝"`。
- 覆盖风险：覆盖映射表外 label 的 fail-soft 行为。

B06. **SignalLabels 顺序**

- 输入/前置条件：`intent = ["seek_guidance", "compare"]`，`emotion = ["pressure"]`，`memoryAnchors = ["remember"]`，`personaHints = ["settling"]`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`encounterMessage.payload.signalLabels` 等于 `["seek_guidance", "compare", "pressure", "remember", "settling"]`。
- 覆盖风险：防止信号来源顺序被重排，影响下游解释。

B07. **SignalLabels 截断**

- 输入/前置条件：构造 10 个以上 label，分布在 `intent/emotion/memoryAnchors/personaHints`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`signalLabels.length === 8`，且是拼接顺序的前 8 个。
- 覆盖风险：避免 payload 过大或截断位置漂移。

B08. **Confidence 计算与四舍五入**

- 输入/前置条件：`intent[0].confidence = 0.82`；`workAgent.affectField[0].confidence = 0.7`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`growthEvent.confidence === 0.76`；`growthMessage.payload.confidence === 0.76`。
- 覆盖风险：确认取的是首个用户信号和首个作品信号，不是最大值或全部平均。

B09. **Summary 截断**

- 输入/前置条件：`growthPolicy.maxSummaryLength = 40`，`title/frame` 保持足够长。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：`summary` 以 `...` 结尾，不包含原始 `utterance`。
- 覆盖风险：覆盖隐私和摘要长度控制；也可断言实际长度以暴露是否超过上限。

B10. **WorkAgent Fail-Open**

- 输入/前置条件：分别覆盖 `id = ""`、`growthPolicy.canGrow = false`、`allowedActs` 不含 `grow`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：返回 `{ enabled: false, reason: "work_agent_disabled" }`，不生成 `growthEvent`。
- 覆盖风险：确保不可用 work agent 不抛错、不半生成消息，保持 fail-open。

## Agent C: User-State Extraction

C01. **中文压力求助**

- 输入/前置条件：`最近压力很大，我该怎么办，才能安顿下来？`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`emotion` 包含 `pressure`、`settling`；`intent[0]` 为 `seek_guidance`；`privacyMode` 默认 `ephemeral`。
- 覆盖风险：多情绪命中、意图排序、中文求助表达。

C02. **英文焦虑引导**

- 输入/前置条件：`I'm anxious and overwhelmed. What should I practice next?`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`emotion` 包含 `pressure`；`intent` 包含 `seek_guidance`；`personaHints` 包含 `learning_oriented`。
- 覆盖风险：英文情绪词、英文 guidance 意图、学习型 persona。

C03. **中英混合不确定继续探索**

- 输入/前置条件：`I feel lost，但我想继续 explore 下一句。`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`emotion` 包含 `uncertainty`；`intent` 包含 `continue_exploration`。
- 覆盖风险：中英混合、大小写不敏感、继续探索意图。

C04. **解释型请求**

- 输入/前置条件：`这句话是什么意思？Can you help me understand it?`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`intent` 包含 `interpret` 和 `seek_guidance`，且 `seek_guidance` 置信度高于 `interpret`。
- 覆盖风险：多意图同时命中、置信度排序。

C05. **家庭记忆锚点隐私标签化**

- 输入/前置条件：`我记得小时候和父母在家里吵架的那段话。`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`intent` 包含 `remember`；`memoryAnchors` 只包含标签化的 `family`，不包含原始私密片段如“吵架”。
- 覆盖风险：隐私文本不泄露、家庭 anchor 提取。

C06. **朋友与学校双锚点**

- 输入/前置条件：`I remember my friend from school and the teacher who helped us.`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`memoryAnchors` 包含 `friendship` 和 `school`。
- 覆盖风险：英文记忆触发、多 memory anchor 并存。

C07. **故乡怀旧**

- 输入/前置条件：`最近很怀念故乡那座城市。`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`emotion` 包含 `nostalgia`；`intent` 包含 `remember`；`memoryAnchors` 包含 `hometown`。
- 覆盖风险：中文怀旧情绪、地点类记忆锚点。

C08. **泛化过去经验**

- 输入/前置条件：`I miss that old experience, but I don't want to name details.`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`emotion` 包含 `nostalgia`；`intent` 包含 `remember`；`memoryAnchors` 为 `past_experience`。
- 覆盖风险：无具体实体时的兜底 anchor、隐私友好泛化。

C09. **PersonaHints 组合**

- 输入/前置条件：`我在反思和朋友的关系，也想通过练习继续成长。`
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`personaHints` 包含 `reflective`、`relational`、`learning_oriented`。
- 覆盖风险：persona 多标签、中文关系/成长/反思表达。

C10. **Saved 隐私模式与稳定 ID**

- 输入/前置条件：同一 `utterance/sessionId/createdAt/privacyMode: "saved"` 连续调用两次。
- 执行动作：比较两次 snapshot。
- 期望结果：两次 `id` 相同；`privacyMode` 为 `saved`；敏感内容仍只进入标签化字段，不进入 `memoryAnchors.label`。
- 覆盖风险：保存模式不会破坏确定性，隐私模式参与 ID，标签化边界一致。

## Agent D: Work-Agent Manifest

D01. **标准 ClassicPassage Manifest 构造**

- 输入/前置条件：构造合法 `PassageRecord`，`textHash = buildTextHash(text)`。
- 执行动作：调用 `createClassicPassageWorkAgent(passage)`。
- 期望结果：返回非空 manifest；`kind` 为 `classic_passage`；`id` 为 `work:classic:{passage.id}:{hash前12位}`；`canonicalRef`、`contentRef.passageId/chapter/section/textHash` 与 passage 一致。
- 覆盖风险：字段映射错误、`canonicalRef/id` 不稳定、classic 适配基础回归。

D02. **ExpectedTextHash 不匹配时拒绝**

- 输入/前置条件：passage 本身合法，但传入 `expectedTextHash = buildTextHash("stale text")`。
- 执行动作：调用 `createClassicPassageWorkAgent(passage, { expectedTextHash })`。
- 期望结果：返回 `null`。
- 覆盖风险：客户端传入旧文本仍生成 agent，导致 `passageText` 与 manifest 绑定失真。

D03. **Passage 内部 TextHash 损坏时拒绝**

- 输入/前置条件：`passage.text` 未变，但 `passage.textHash` 改成错误 hash；不传 `expectedTextHash`。
- 执行动作：调用 `createClassicPassageWorkAgent(passage)`。
- 期望结果：返回 `null`。
- 覆盖风险：索引或语料被污染时仍生成 manifest。

D04. **PassageText 首尾空白不应造成误拒**

- 输入/前置条件：registry 中存在 passage；调用参数 `passageText` 为原文前后加空格或换行。
- 执行动作：调用 `resolveWorkAgentByPassageId(id, { passageText })`。
- 期望结果：返回非空 manifest，因为 `buildTextHash` 对 `text.trim()` 哈希。
- 覆盖风险：hash 校验边界误判，用户复制文本带空白导致不可解析。

D05. **PassageText 正文差一字时拒绝**

- 输入/前置条件：registry 中存在 passage；`passageText` 与原文仅一字不同。
- 执行动作：调用 `resolveWorkAgentByPassageId(id, { passageText })`。
- 期望结果：返回 `null`。
- 覆盖风险：文本漂移、前端传错 `passageText` 仍生成错误 work agent。

D06. **AffectField 多信号命中**

- 输入/前置条件：passage 的 `source/chapter/text` 包含“学”“朋”“愠”“省”等关键词，且 hash 合法。
- 执行动作：调用 `createClassicPassageWorkAgent(passage)`。
- 期望结果：`affectField` 包含 `learning`、`trust`、`settling`、`self_correction`；每项 `source` 均为 `passage`，confidence 符合适配器设定。
- 覆盖风险：情感/意图线索漏提取，多个信号互相覆盖。

D07. **AffectField 默认兜底**

- 输入/前置条件：passage 文本、source、chapter 都不包含任何规则关键词。
- 执行动作：调用 `createClassicPassageWorkAgent(passage)`。
- 期望结果：`affectField` 至少包含 `classic_resonance`，confidence 为 `0.58`，source 为 `passage`。
- 覆盖风险：无关键词 passage 生成空 `affectField`，后续路由缺少可用信号。

D08. **InterpretiveFrames 完整且隔离**

- 输入/前置条件：同一个合法 passage。
- 执行动作：连续两次调用 `createClassicPassageWorkAgent(passage)`，修改第一次返回值里的某个 frame label。
- 期望结果：第二次返回的 frames 不受影响；frame id 精确包含 `liu_jing_zhu_wo`、`wo_zhu_liu_jing`、`contrast`、`echo`、`silence`。
- 覆盖风险：frames 被共享引用污染，解释框架缺失或内容漂移。

D09. **GrowthPolicy 精确约束**

- 输入/前置条件：合法 classic passage。
- 执行动作：生成 manifest 并检查 `growthPolicy`。
- 期望结果：`persist` 为 `ephemeral_only`；`canGrow` 为 `true`；`allowedActs` 为 `["encounter", "interpret", "grow", "reflect", "link"]`；不包含 `memory_delta`；`maxSummaryLength` 为 `120`。
- 覆盖风险：隐私持久化策略误改、允许 agent 写入记忆类动作、摘要长度约束丢失。

D10. **未知 Passage 与索引异常 Fail-Open**

- 输入/前置条件：传入不存在的 `passageId`；另设一例 mock `loadSearchIndex` 抛错。
- 执行动作：调用 `resolveClassicPassageWorkAgent` 或 `resolveWorkAgentByPassageId`。
- 期望结果：两种情况都 resolve 为 `null`，不抛异常。
- 覆盖风险：未知 passage、索引加载失败导致调用链崩溃，而不是安全地不生成 manifest。

## Agent E: Growth Event And Store

E01. **Append 后可 Read**

- 输入/前置条件：`createGrowthSessionStore()`；事件 `id = "e1"`、`act = "grow"`、`sessionId = "s1"`。
- 执行动作：`append("s1", event, 1000)`，再 `read("e1", 1000)`。
- 期望结果：返回事件字段完整一致；不是 `null`。
- 覆盖风险：基础 `append/read` 链路失效，事件字段丢失。

E02. **List 按插入时间排序**

- 输入/前置条件：`s1` 下追加 `e1@1000`、`e2@3000`、`e3@2000`。
- 执行动作：`list("s1", 3000)`。
- 期望结果：顺序为 `e1, e3, e2`。
- 覆盖风险：列表顺序不稳定，影响前端 timeline 或 session replay。

E03. **Session List 隔离**

- 输入/前置条件：追加 `s1/e1`、`s2/e2`。
- 执行动作：分别 `list("s1")`、`list("s2")`。
- 期望结果：`s1` 只返回 `e1`；`s2` 只返回 `e2`。
- 覆盖风险：跨 session 数据泄漏。

E04. **Read 按 EventId 全局读取**

- 输入/前置条件：追加 `s2/e2`。
- 执行动作：`read("e2")`。
- 期望结果：可读到 `e2`，即使没有 session 参数。
- 覆盖风险：误把 read 实现成 session-scoped，导致按事件详情读取失败。

E05. **TTL 未到期仍可读/List**

- 输入/前置条件：`createGrowthSessionStore({ ttlMs: 100 })`；`append("s1", e1, 1000)`。
- 执行动作：`read("e1", 1099)` 与 `list("s1", 1099)`。
- 期望结果：`read` 返回 `e1`；`list` 包含 `e1`。
- 覆盖风险：TTL 过早清理，造成短会话事件丢失。

E06. **TTL 到期边界清理**

- 输入/前置条件：`ttlMs: 100`；`append("s1", e1, 1000)`，过期点为 `1100`。
- 执行动作：`read("e1", 1100)`；再 `list("s1", 1100)`；可检查 `size(1100)`。
- 期望结果：`read` 返回 `null`；`list` 返回空数组；`size` 为 `0`。
- 覆盖风险：TTL 边界 off-by-one，过期事件残留。

E07. **单 Session 最大事件数裁剪**

- 输入/前置条件：`createGrowthSessionStore({ maxEventsPerSession: 2 })`；追加 `e1@1000`、`e2@2000`、`e3@3000` 到 `s1`。
- 执行动作：`list("s1", 3000)`，`read("e1", 3000)`。
- 期望结果：list 只剩 `e2, e3`；`read("e1")` 为 `null`。
- 覆盖风险：单会话无限增长、最老事件未被淘汰。

E08. **最大 Session 数裁剪**

- 输入/前置条件：`createGrowthSessionStore({ maxSessions: 2 })`；追加 `s1/e1@1000`、`s2/e2@2000`、`s3/e3@3000`。
- 执行动作：`list("s1", 3000)`、`list("s2", 3000)`、`list("s3", 3000)`。
- 期望结果：`s1` 为空；`s2` 包含 `e2`；`s3` 包含 `e3`。
- 覆盖风险：session 淘汰策略错误，旧 session 占用内存或误删新 session。

E09. **GrowthService 吞掉 Store 异常**

- 输入/前置条件：构造 fake store：`append/list/read` 分别抛异常；`new GrowthService(fakeStore)`。
- 执行动作：调用 `service.append(...)`、`service.list(...)`、`service.read(...)`。
- 期望结果：不抛异常；`append` 返回 `null`；`list` 返回 `[]`；`read` 返回 `null`。
- 覆盖风险：growth 异常冒泡影响主业务链路。

E10. **事件不可变拷贝**

- 输入/前置条件：创建事件 `e1.summary = "original"`；使用 store 或 `GrowthService`。
- 执行动作：`append` 后修改原始 `event.summary = "mutated"`；再 `read/list`；修改 `read` 返回对象；再次 `read`。
- 期望结果：存储中的 `summary` 仍为 `"original"`；每次 `read/list/append` 返回对象内容相同但引用不同。
- 覆盖风险：外部对象引用污染 session store，导致事件被调用方意外篡改。

## Agent F: Annotation Integration

F01. **已知选中段落生成 AgentTrace**

- 输入/前置条件：`passageId = lunyu-1-7`，`passageText` 与语料一致，未配置 LLM。
- 执行动作：POST `/api/annotate`。
- 期望结果：`200 success=true`；返回原 `passageId/passageText/sixToMe/meToSix/links`；`agentTrace.workAgentId` 包含 `work:classic:lunyu-1-7`，且只暴露 `workAgentId/relationTheme/branchLabel/growthSummary`。
- 覆盖风险：A2A 字段越界泄露 `traceId/userStateId/utterance/confidence` 等内部状态。

F02. **未知外部段落 Fail-Open**

- 输入/前置条件：`passageId = external-note-1`，非本地语料。
- 执行动作：POST `/api/annotate`。
- 期望结果：`200`；响应仍有注解正文和语料 links；`agentTrace` 不存在。
- 覆盖风险：work-agent 解析失败导致接口失败，而不是按 A2A 文档 fail-open。

F03. **已知 ID 但 PassageText 不匹配**

- 输入/前置条件：`passageId = lunyu-1-1`，但提交篡改或截断后的 `passageText`。
- 执行动作：POST `/api/annotate`。
- 期望结果：`200`；响应回显提交的 `passageText`；`agentTrace` 缺失；links 不包含当前 `passageId`。
- 覆盖风险：选中 passage 文本 hash 不一致时错误绑定经典 work agent。

F04. **旧响应兼容**

- 输入/前置条件：使用 F01 的已知段落请求。
- 执行动作：按旧客户端 schema 只读取 `passageId/passageText/sixToMe/meToSix/links`。
- 期望结果：这些字段完整可用；新增 `agentTrace` 不改变 `success/data/error` 外层结构。
- 覆盖风险：可选字段加入后破坏旧 UI 或 SDK 的响应解析。

F05. **选中 Passage 优先于查询命中**

- 输入/前置条件：`query = 吾日三省如何自省`，但选中 `passageId = lunyu-1-8`。
- 执行动作：POST `/api/annotate`。
- 期望结果：`data.passageId = lunyu-1-8`；`agentTrace.workAgentId` 包含 `lunyu-1-8`；links 可包含相关自省段落，但不能把 trace 绑定到 link。
- 覆盖风险：A2A 使用 query 最相关 passage，而不是用户实际选中的 passage。

F06. **缓存命中仍重建 Links 与 AgentTrace**

- 输入/前置条件：配置有效 LLM mock；同一 query/passage 连续请求，第二次带更多 `visitedPassageIds`。
- 执行动作：POST 两次。
- 期望结果：LLM 只调用一次；第二次正文来自 cache；第二次 links 排除新增 visited；仍返回当前可用的 `agentTrace`。
- 覆盖风险：缓存把 links 或 `agentTrace` 一起冻结，导致探索栈回访污染。

F07. **Provider Error Fallback 不缓存**

- 输入/前置条件：配置 primary LLM，但 mock 返回 `503`。
- 执行动作：同一请求 POST 两次。
- 期望结果：两次均 `200`；返回 deterministic copy；已知 passage 仍有 `agentTrace`；fetch 被调用两次。
- 覆盖风险：失败 fallback 被缓存，掩盖后续 provider 恢复。

F08. **LLM Prompt 接收 GrowthContext**

- 输入/前置条件：配置 LLM mock 成功；已知 passage 可生成 `agentTrace`。
- 执行动作：POST 并检查 fetch body。
- 期望结果：prompt 包含 `关系倾向/关系枝条/关系摘要`；不包含 raw user-state JSON、memory anchor 原文、prompt reasoning；响应正文采用 LLM copy。
- 覆盖风险：A2A 上下文未进入 LLM，或隐私边界被 prompt 泄露。

F09. **无 LLM 配置 Deterministic Fallback 携带关系枝条提示**

- 输入/前置条件：清空所有 LLM env；已知 passage。
- 执行动作：POST `/api/annotate`。
- 期望结果：`200`；`sixToMe/meToSix` 为 deterministic 文案；若有 `agentTrace`，文案包含“系统读到的倾向/关系枝条”语义。
- 覆盖风险：A2A 只对 LLM 路径生效，deterministic fallback 丢失集成。

F10. **VisitedPassageIds 规范化与 A2A 会话稳定**

- 输入/前置条件：`visitedPassageIds` 含重复、空白修剪后等价 ID，并包含当前 passage。
- 执行动作：POST `/api/annotate`。
- 期望结果：`200`；links 不包含 visited/current；`agentTrace` 正常生成或按 fail-open 缺失；不因重复 visited 产生错误。
- 覆盖风险：探索深度、cache key、A2A session id 因 visited 列表顺序或重复产生不稳定行为。

## Agent G: UI Agent Trace

G01. **完整 AgentTrace 只展示用户可读信息**

- 输入/前置条件：传入含 `workAgentId`、`relationTheme`、`branchLabel`、`growthSummary` 的 trace。
- 执行动作：render `<GrowthTrace trace={trace} />`。
- 期望结果：存在 `role="region"` 且名称为“关系枝条”；展示主题、枝条名、摘要；不展示 `work:classic`、`confidence`、JSON 或内部 id。
- 覆盖风险：内部 agent/work 元数据泄漏到 UI。

G02. **无 AgentTrace 时显示安静空状态**

- 输入/前置条件：不传 `trace`。
- 执行动作：render `<GrowthTrace />`。
- 期望结果：仍有“关系枝条”region；显示“此处暂未生枝。”；不出现任何旧 trace 文案。
- 覆盖风险：旧数据缺字段导致崩溃或残留上一次 trace。

G03. **AnnotationPanel 兼容旧 AnnotationResult 无 AgentTrace**

- 输入/前置条件：`AnnotationResult` 只有 `passageId/passageText/sixToMe/meToSix/links`，没有 `agentTrace`。
- 执行动作：render `<AnnotationPanel annotation={annotationWithoutTrace} ... />`。
- 期望结果：正文正常出现；`GrowthTrace` 区域显示空状态；后续“此处暂止”或“下一句”区域仍正常。
- 覆盖风险：历史缓存或旧 API 响应没有 trace 时面板不可用。

G04. **超长 RelationTheme 不撑破布局**

- 输入/前置条件：`relationTheme` 使用很长中文或无空格字符串。
- 执行动作：render `<GrowthTrace trace={longThemeTrace} />`。
- 期望结果：主题文本节点存在；主题容器包含 `max-w-32`、`truncate`、`text-right`；branch 与 summary 仍完整展示。
- 覆盖风险：主题标签过长导致桌面或移动横向溢出。

G05. **超长 BranchLabel/GrowthSummary 不被误截断**

- 输入/前置条件：`branchLabel` 和 `growthSummary` 使用多句长文本，`relationTheme` 正常。
- 执行动作：render `<GrowthTrace trace={longCopyTrace} />`。
- 期望结果：长 branch 和 summary 全部在 DOM 中；branch/summary 节点不带 `truncate`；summary 保持 `leading-7`。
- 覆盖风险：主要解释文本被意外套用截断样式，信息不可读。

G06. **关系枝条区域具备稳定 A11y 入口**

- 输入/前置条件：有 trace。
- 执行动作：render `<GrowthTrace trace={trace} />` 并按 role 查询。
- 期望结果：`screen.getByRole("region", { name: "关系枝条" })` 成功；区域内没有多余按钮、链接或 `aria-hidden` 包住可读内容。
- 覆盖风险：屏幕阅读器无法定位 growth trace 或误读为交互控件。

G07. **移动端使用 Compact 样式且 Trace 不被隐藏**

- 输入/前置条件：`AnnotationPanel placement="mobile"` 且有 `agentTrace`。
- 执行动作：render mobile 面板。
- 期望结果：无 desktop `tablist`；存在“关系枝条”region；region class 含 `py-3`、`border-stone-800/70`；branch/summary 可见。
- 覆盖风险：移动布局分支漏渲染 trace 或使用桌面间距。

G08. **桌面切换 Tab 后 Trace 保持单例可见**

- 输入/前置条件：`AnnotationPanel placement="desktop"`，有 trace。
- 执行动作：render 后点击或键盘切到“我注六经”。
- 期望结果：页面始终只有一个“关系枝条”region；trace 不在 hidden tabpanel 内；branch 仍可见。
- 覆盖风险：trace 被错误放入某个 tabpanel，切换后隐藏或重复。

G09. **有下一句时 Trace 位于正文之后、下一句之前**

- 输入/前置条件：`AnnotationPanel` 有 `agentTrace` 且 `links.length > 0`。
- 执行动作：render 面板，比较正文状态节点、trace region、“下一句”标题/按钮的 DOM 顺序。
- 期望结果：正文先出现，随后是“关系枝条”，最后才是“下一句”。
- 覆盖风险：信息层级错位，用户在看到关系解释前就被引导跳转。

G10. **旧/异常字段不进入 UI**

- 输入/前置条件：构造带额外 legacy 字段的 annotation，例如根级 `workAgentId`、`agent_trace`、`growthContextHash`，但没有有效 `agentTrace`。
- 执行动作：用类型断言 render `<AnnotationPanel />`。
- 期望结果：面板不崩溃；显示空状态；不展示 legacy 字段名和值。
- 覆盖风险：旧数据迁移期把兼容字段或诊断字段泄漏给用户。

## Agent H: Privacy And Fail-Open

H01. **A2A Growth Event 不携带 Raw Utterance**

- 输入/前置条件：`UserStateSnapshot.utterance` 含唯一敏感串，workAgent 有效。
- 执行动作：调用 `routeA2AEncounter`，序列化 `growthEvent`、`encounterMessage`、`growthMessage`。
- 期望结果：结果 `enabled: true`；序列化内容不包含 raw utterance，只出现 `userStateId`、`workAgentId`、`signalLabels`、主题/枝条/摘要。
- 覆盖风险：A2A/growth 内部消息把用户原话或长记忆文本带入持久事件。

H02. **公开 AgentTrace 只暴露四个安全字段**

- 输入/前置条件：`createAnnotation` 请求 query 含手机号、邮箱或唯一私密短语，`passageId` 为可生成 workAgent 的语料。
- 执行动作：调用 `createAnnotation`，检查 `annotation.agentTrace`。
- 期望结果：`agentTrace` 仅有 `workAgentId`、`relationTheme`、`branchLabel`、`growthSummary`；不含 `query`、`utterance`、`userStateId`、`sessionId`、`memoryAnchors`、私密短语。
- 覆盖风险：公开响应把内部用户状态或原话泄露给客户端。

H03. **Memory Anchor 只保存短标签**

- 输入/前置条件：utterance 为“我想起小时候和父母在某次很长家庭争执里说过的具体话……”。
- 执行动作：调用 `extractUserStateSnapshot`。
- 期望结果：`memoryAnchors` 为 `family`、`friendship`、`hometown`、`school`、`past_experience` 这类短标签，且每项有 `confidence` 和 `source`；不包含“小时候”“具体话”等原文片段。
- 覆盖风险：记忆锚点从标签化退化为长私密记忆存储。

H04. **Annotation Cache Key 不含 Raw Utterance 或 Raw User-State**

- 输入/前置条件：`buildAnnotationCacheKey` 输入 query 和 passageText 均含唯一敏感串，并传入 `growthContextHash`。
- 执行动作：生成 cache key 并序列化检查。
- 期望结果：key 只含稳定 hash、模式、样式、`passageId` 等必要非敏感标识；不含 raw query、raw passageText、`memoryAnchors`、`personaHints`、完整 user-state JSON。
- 覆盖风险：内存 cache key、日志或 dump 中泄露 raw utterance。此项是隐私目标型用例，可能用于暴露当前实现差距。

H05. **Telemetry 只记录 QueryHash**

- 输入/前置条件：query 含唯一敏感串，`NODE_ENV = development`，开启 telemetry，spy `console.info`。
- 执行动作：调用 `recordAnnotationTelemetry`，读取 `getAnnotationTelemetryEvents` 和 console 输出。
- 期望结果：事件中只有短 `queryHash`，没有 `query` 字段；console JSON 不含 raw query、passageText、memory anchor 文本。
- 覆盖风险：telemetry 事件或服务端日志泄露用户原话。

H06. **LLM Runtime Status 不泄露 API Key 值**

- 输入/前置条件：设置 `LLM_API_KEY_PRIMARY = sk-secret-primary-unique`、`LLM_API_KEY_SECONDARY = sk-secret-secondary-unique`，并设置 model/baseUrl。
- 执行动作：调用 `resolveAnnotationLlmRuntimeStatus` 并序列化。
- 期望结果：只显示 env key 名称和 `apiKeyConfigured: true`；不出现任何 `sk-secret-*` 值；warnings 也不包含 key 值。
- 覆盖风险：健康或诊断配置接口泄露 API key。

H07. **User-State 提取或 Session-Store 失败不阻断 Annotation**

- 输入/前置条件：mock `extractUserStateSnapshot` 抛错，或 mock `userStateSessionStore.put` 抛错。
- 执行动作：调用 `createAnnotation`。
- 期望结果：仍返回正常 annotation、links；`agentTrace` 可缺省；无未捕获异常；telemetry 正常记录且不含 raw query。
- 覆盖风险：用户状态链路故障导致主注释接口 500。

H08. **Work-Agent 缺失或解析失败 Fail-Open**

- 输入/前置条件：`passageId` 不存在，或 mock `resolveWorkAgentByPassageId` 返回 `null`/抛错。
- 执行动作：调用 `createAnnotation`。
- 期望结果：annotation 正常返回；`agentTrace` 为 `undefined`；fallback/LLM 注释和 links 不受阻断。
- 覆盖风险：work-agent registry、语料 hash、adapter 故障拖垮 annotation。

H09. **Growth Storage 失败被吞掉**

- 输入/前置条件：mock `growthService.append` 抛错或返回 `null`。
- 执行动作：调用 `createAnnotation`，同时检查响应和 telemetry。
- 期望结果：请求 resolve，不抛出；主 annotation 字段完整；不把 storage 错误信息、sessionId、raw utterance 写入响应或 telemetry。
- 覆盖风险：增长事件持久化异常阻塞用户路径，或错误对象泄露内部状态。

H10. **LLM Provider 错误/超时 Fail-Open 且不泄露 Key**

- 输入/前置条件：配置真实形态的假 API key，mock `fetch` 返回 503、非法 JSON、空 choices、reject，或触发 timeout。
- 执行动作：调用 `createAnnotation`。
- 期望结果：返回 deterministic fallback；telemetry 标记 `fallbackHit: true`，`fallbackReason` 为 `provider_error` 或 `timeout`；响应、telemetry、console 不含 Authorization bearer、API key、provider 原始错误体。
- 覆盖风险：上游模型失败阻断注释，或 provider 错误路径泄露密钥/遥测敏感信息。

## Agent I: End-To-End Framework Flow

I01. **标准主路径含 AgentTrace 闭环**

- 输入/前置条件：`query = 如何面对压力`；搜索返回至少 1 条结果；所选结果可解析为 classic work agent。
- 执行动作：提交搜索；选择第一条结果进入注释；等待 `/api/annotate`；点击第一条 `links`；再点“返回上一层”。
- 期望结果：流程完成 `query -> search -> annotate -> links -> explore -> back`；根注释与二层注释均含 `passageId/passageText/sixToMe/meToSix/links`；若 A2A 成功，二者各自显示对应 `agentTrace`；返回后恢复根节点的 annotation 与 `agentTrace`。
- 覆盖风险：探索栈和 A2A trace 状态不同步，返回后显示了二层 trace 或二层段落。

I02. **搜索阶段不引入 A2A 公共字段**

- 输入/前置条件：`query = 朋友相处要诚信`。
- 执行动作：调用 `/api/search`，再用返回结果进入 `/api/annotate`。
- 期望结果：`/api/search` 响应只含搜索结果字段，不含 `agentTrace`、A2A message、growth event；`agentTrace` 只可能出现在 `/api/annotate` 的 annotation data 中。
- 覆盖风险：A2A 层污染搜索契约，破坏“search ranking 不被 A2A 改变”的边界。

I03. **根注释 AgentTrace 与所选 Passage 绑定**

- 输入/前置条件：`query = 我很焦虑，想把心安顿下来`；搜索结果中选择某条 `result.id/text`。
- 执行动作：搜索后点击该结果进入注释。
- 期望结果：annotation 的 `passageId` 等于所选结果 id；`agentTrace.workAgentId` 若存在，应包含或稳定指向该 passage 的 work agent；`relationTheme/branchLabel/growthSummary` 展示在“关系枝条”，不替换 `六经注我/我注六经` 正文。
- 覆盖风险：`agentTrace` 来自错误段落、旧缓存或上一轮选择，导致“关系枝条”与当前经典段落错配。

I04. **点击 Link 探索时 AgentTrace 切换到 Link Passage**

- 输入/前置条件：根 annotation `links.length > 0`，第一条 link 带 `passageId/passageText/source/chapter/section`。
- 执行动作：点击第一条 link，触发二次 `/api/annotate`，请求体使用同一 query、link passage 数据和 `visitedPassageIds`。
- 期望结果：二层 annotation 的 `passageId` 等于 `link.passageId`；wiki stack 层级 +1；`agentTrace.workAgentId` 若存在，应对应 link passage，而不是根 passage。
- 覆盖风险：探索复用根 `passageText` 或根 workAgent，造成注释内容、链路和 trace 三者漂移。

I05. **返回上一层不重新生成 Trace**

- 输入/前置条件：已进入第二层探索；根节点和二层节点均已有 annotation 快照。
- 执行动作：点击“返回上一层”。
- 期望结果：只 pop 一层 wiki stack；UI 恢复根节点的 `passageId/passageText/sixToMe/meToSix/links/agentTrace`；不发起新的 `/api/annotate`；active tab 回到 `sixToMe`。
- 覆盖风险：返回操作触发重算，导致 `agentTrace`、links 或注释文案不稳定。

I06. **深层探索后选择新搜索结果清空旧链路**

- 输入/前置条件：已在第 2 层或更深层；搜索结果列表仍可见。
- 执行动作：点击另一条搜索结果进入注释。
- 期望结果：旧 wiki stack 立即清空；新结果成功后从第 1 层重新开始；旧 link trace、旧 `selectedPassage`、旧 `visitedPassageIds` 不影响新根注释。
- 覆盖风险：旧探索路径残留，导致新结果被误判为深层探索或复用旧 `agentTrace`。

I07. **叶子节点 Links 空数组与 AgentTrace 共存**

- 输入/前置条件：构造或命中一个 annotation 返回 `links: []`，A2A 可成功或失败。
- 执行动作：进入该节点注释。
- 期望结果：UI 展示“此处暂止/暂无后续探索”类叶子态，不渲染假的下一句按钮；若 `agentTrace` 存在仍正常显示关系枝条；若不存在则显示“此处暂未生枝”。
- 覆盖风险：叶子态被当成错误；或没有 links 时连带隐藏/破坏 `agentTrace` 展示。

I08. **A2A Fail-Open 不阻断注释与探索**

- 输入/前置条件：使用未知或 stale passage，例如 `passageId` 不在本地 corpus，或 `passageText` hash 不匹配。
- 执行动作：直接调用 `/api/annotate` 或通过模拟 link 进入该 passage。
- 期望结果：`/api/annotate` 仍 `success: true`，返回 deterministic annotation 与 links 逻辑可用；`agentTrace` 可缺省；UI 不报错，显示空关系枝条。
- 覆盖风险：work agent 解析失败把主路径打断，违反 A2A 文档的 fail-open 规则。

I09. **AgentTrace 隐私边界**

- 输入/前置条件：query 含敏感记忆语义，如 `我想起家里的事，很焦虑，不知道怎么办`。
- 执行动作：搜索、注释、点击 link 探索；检查 API 响应和 UI 文本。
- 期望结果：公开 `agentTrace` 只含 `workAgentId/relationTheme/branchLabel/growthSummary`；不暴露 raw query、traceId、userStateId、memoryAnchors、confidence、payload、prompt 或 model reasoning；UI 不展示 JSON。
- 覆盖风险：内部 A2A envelope 或用户状态推断泄露到公共响应和页面。

I10. **并发切换时旧 Annotate 响应不能覆盖当前 Trace**

- 输入/前置条件：根 annotation 有多个 links；可控制两个 `/api/annotate` 响应先后返回。
- 执行动作：点击 link A 后立刻点击 link B 或选择新结果；让 A 的响应晚于 B 返回。
- 期望结果：页面最终只显示最新目标的 annotation、links 和 `agentTrace`；旧请求被 abort 或因 request id 失效而不写入状态；wiki stack 不混入 A 节点。
- 覆盖风险：异步竞态导致旧 `agentTrace` 覆盖新节点，用户看到“段落是 B、关系枝条却是 A”。

## Agent J: Future Extensibility And Non-Regression

J01. **A2A 不成为 Public API**

- 输入/前置条件：路由树中只有现有 `/api/search`、`/api/annotate`、`/api/health`；构造 `/api/a2a`、`/api/agents`、`/api/work-agents` 请求。
- 执行动作：扫描 `src/app/api` 并对不存在的 A2A 路由做 route-level smoke。
- 期望结果：不存在公开 A2A endpoint；公开响应只允许 `/api/annotate` 的可选 `agentTrace`。
- 覆盖风险：内部 typed object 协议被误扩成公共远程 agent API。

J02. **Search 拒绝 A2A 字段注入**

- 输入/前置条件：`POST /api/search` body 含合法 `query`，外加 `agentMessage`、`workAgentId`、`allowedActs`、`privacyMode`、`remoteAgentUrl`。
- 执行动作：调用 search route。
- 期望结果：返回 `400 VALIDATION_ERROR`；正常 search body 的排名和响应 shape 不变。
- 覆盖风险：搜索接口被 A2A/个性化字段污染，导致 ranking 漂移或契约膨胀。

J03. **Painting WorkAgent Manifest 可路由但不泄露**

- 输入/前置条件：构造 `kind: "painting"` 的 `WorkAgentManifest`，含 `contentRef.artworkId`、稳定 `canonicalRef`、`growthPolicy.allowedActs` 含 `grow`。
- 执行动作：直接调用 `routeA2AEncounter`。
- 期望结果：可生成稳定 growth；`agentTrace` 只含 `workAgentId/relationTheme/branchLabel/growthSummary`，不暴露 artwork manifest 原始字段。
- 覆盖风险：未来 painting 被 classic passage schema 卡死，或公开泄露作品 manifest 内部结构。

J04. **Artifact Manifest 版本/签名边界**

- 输入/前置条件：未来 `kind: "artifact"` manifest 含版本、签名、provenance；另准备缺签名、错版本、含 raw prompt/local file path 的恶意 manifest。
- 执行动作：通过 artifact adapter/registry 解析，再进入 A2A router。
- 期望结果：合法 artifact 只产出稳定 work agent；非法 manifest fail-open 为 null/disabled；公开响应不含签名、路径、prompt。
- 覆盖风险：生成物 artifact 被当作可信公共数据源，造成隐私或供应链污染。

J05. **AllowedActs 缺少 Grow 时禁止增长**

- 输入/前置条件：`canGrow: true`，但 `allowedActs` 只有 `encounter/interpret/link`。
- 执行动作：调用 `routeA2AEncounter`。
- 期望结果：返回 `{ enabled: false, reason: "work_agent_disabled" }`；不生成 `growthMessage` 或 `GrowthEvent`。
- 覆盖风险：`allowedActs` 闸门失效，作品 agent 执行未授权动作。

J06. **MemoryDelta 识别不等于可执行持久记忆**

- 输入/前置条件：agent act 枚举允许 `memory_delta`，但 work agent policy 为 `ephemeral_only` 或 `disabled`，用户未显式授权持久化。
- 执行动作：构造含 `memory_delta` 的消息和 encounter 流程。
- 期望结果：message guard 可识别枚举，但当前 router 不执行 memory mutation；growth store 不保存 raw memory。
- 覆盖风险：未来 `allowedActs` 扩展时把“协议可表达”误当成“产品可执行”。

J07. **Saved PrivacyMode 不绕过持久化同意**

- 输入/前置条件：`UserStateSnapshot.privacyMode = "saved"`，utterance 含敏感私密文本，work agent 仍是 `persist: "ephemeral_only"`。
- 执行动作：路由 encounter、写入 session growth/cache。
- 期望结果：encounter payload 可透传 `saved`；`GrowthEvent`、`agentTrace`、cache key、session store 均不含 raw utterance/persona/memory 原文；不落盘。
- 覆盖风险：`saved` 被误解为自动跨会话保存。

J08. **A2A Router 性能与确定性基线**

- 输入/前置条件：固定 `createdAt`、同一 user state，分别用 classic/painting/artifact manifest 跑多轮。
- 执行动作：重复调用 `routeA2AEncounter`，并 mock/spy `fetch`。
- 期望结果：同输入输出完全相等；不调用网络/LLM；summary 长度受 `maxSummaryLength` 约束；耗时保持本地同步级别。
- 覆盖风险：remote agents 或 LLM 被悄悄引入 router，造成慢、非确定、难复现。

J09. **A2A 注释链路不影响 Search Golden Ranking**

- 输入/前置条件：使用 `tests/fixtures/search-golden-queries.json`；先跑 golden search，再执行多次 annotation/A2A growth。
- 执行动作：再次跑 `searchPassages` golden gate。
- 期望结果：Top1/Top3/ban-list 断言与 A2A 前一致；search result 不含 `agentTrace/workAgentId/privacyMode`。
- 覆盖风险：A2A session state 反向污染搜索排序。

J10. **Work Agent 不可变更 Corpus/Search Graph Artifact**

- 输入/前置条件：记录 `data/corpus-manifest.json`、`data/search-graph.json`、搜索结果 source attribution 的快照；构造 painting/artifact/remote-agent-adjacent manifest。
- 执行动作：解析 work agent、路由 encounter、生成 annotation links。
- 期望结果：corpus manifest、graph artifact、source attribution、search graph edges 均不变；未知或 stale work agent fail-open。
- 覆盖风险：未来作品 agent 或远程 agent 修改 canonical corpus、graph 边或搜索来源，造成非回归破坏。
