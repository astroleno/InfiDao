# Annotation Eval 与 DeepSeek 提示词迭代设计

**日期：** 2026-08-30  
**状态：** 待实施  
**目标：** 将现有一次性提示词实验升级为仓库内可复现的 annotation eval 子系统，并在不污染最终 holdout 的前提下继续优化 `deepseek-v4-flash`。

## 1. 背景与结论

现有实验已经验证了以下事实：

- DeepSeek 能稳定返回合法 JSON，流式技术指标可完整采集。
- v1–v3 提示词能显著优于生产基线，但 v3 在 golden12×3 中仅得 21.028/25，未达到生产晋级门槛。
- v3 的主要失败不是缺少规则，而是把权益、安全、拒绝和可逆性规则无差别套用到所有问题，形成通用模板并挤占核心语义。
- 当前运行器、提示词版本、盲包构建器和聚合器位于 `.tmp/`；该目录被忽略，不适合承载长期维护的评测基础设施。

因此，本阶段不直接修改生产提示词，而是先建立正式 eval 子系统，再以“固定语义骨架 + 条件化约束”的 v4 路线继续实验。只有新 holdout 全部门槛通过后，才允许修改 `src/lib/annotation/llm.ts`。

## 2. 范围

### 2.1 纳入范围

- 持久化 annotation eval 的数据契约、提示词注册、DeepSeek 流式运行、匿名包构建、评分导入、聚合和晋级判断。
- 将 dev case、冻结 holdout、golden case 与可提交汇总结果纳入版本管理。
- 新增统一的 npm 命令和单元测试。
- 继续执行 v4 及必要的后续提示词迭代。
- 记录 TTFT、总时长、prompt/completion/total tokens、reasoning tokens、可见字符数和 JSON 有效率。
- Codex/Kimi 只作为参考答案生成器；Luna max、Terra max、Sol xhigh 子 agent 只作为匿名裁判。

### 2.2 不纳入范围

- 不新增 GitHub Actions 或其他 CI workflow。
- 不把 API key、Provider 私有配置、原始请求头写入仓库。
- 不提交完整模型输出、盲评包、身份映射或子 agent 原始评分全文。
- 不修改 annotation UI、缓存、服务路由或 Provider 选择逻辑。
- 未通过晋级门槛时不修改生产提示词。

## 3. 目录设计

```text
scripts/
  annotation-eval/
    contract.ts
    prompt-registry.ts
    provider.ts
    blind-packet.ts
    aggregate.ts
    artifacts.ts
    cli.ts
tests/
  fixtures/
    annotation-eval/
      dev-v2.json
      holdout-v2.json
      golden-v1.json
  unit/
    tooling/
      annotation-eval-contract.test.ts
      annotation-eval-blind-packet.test.ts
      annotation-eval-aggregate.test.ts
docs/
  qa/
    annotation-eval/
      README.md
      deepseek-v4-flash-v4-summary.json
      deepseek-v4-flash-v4-report.md
artifacts/
  annotation-eval/
    <run-id>/
```

`scripts/annotation-eval`、fixture、测试和汇总报告进入版本管理；`artifacts/annotation-eval` 只保存本地原始生成、匿名包、身份映射和裁判全文，并由 `.gitignore` 忽略。

## 4. 组件职责

### 4.1 `contract.ts`

定义并校验以下稳定契约：

- eval case：id、scenario、query、source、passage、style、约束和数据分区。
- prompt variant：id、system、instructions、SHA-256、父版本和变更理由。
- generation：模型参数、输出、流式指标、有效性和错误摘要。
- blind packet：匿名标签与待评分内容，不含模型身份。
- judgment：五维整数分、hard fail、failure tags、完整 ranking。
- aggregate result：候选排名、维度均值、case/round 稳定性、技术指标和晋级门槛。

所有输入在运行前校验，任何缺字段、重复 case、非法分数、身份泄漏或 hash 不一致都必须使命令失败。

### 4.2 `prompt-registry.ts`

保存 v0–v4 的正式提示词定义和 hash。冻结后的 variant 不允许原地修改；新实验必须新增版本并声明：

- 父版本；
- 观察到的失败模式；
- 本次只改变的假设；
- 预期改善指标；
- 可能退化的指标。

### 4.3 `provider.ts`

封装 OpenAI-compatible 流式调用，但只允许从环境变量读取凭据。固定记录：

- headers、first event、first reasoning、first content、total 时间；
- prompt、completion、reasoning、total tokens；
- finish reason、重试次数、JSON 解析结果；
- model、temperature、max tokens、thinking 状态和 prompt hash。

日志与错误必须脱敏，结果中不得出现 API key。

### 4.4 `blind-packet.ts`

使用 eval id、round、case id 和候选 id 的 SHA-256 派生顺序，为每个 case/round 独立匿名化。输出前检查：

- 标签全集完整且无重复；
- 映射条数正确；
- blind packet 不含模型名、提示词 id、referenceAnswer、expectations 或 prompt hash；
- 评分文件不能读取 mapping。

### 4.5 `aggregate.ts`

统一计算：

- 五维均值、总分、hard-fail 评审数和 flags；
- 每轮分数、case 级稳定性、匿名排名；
- paired wins/losses/ties 与双侧精确二项检验；
- TTFT、总时长、tokens、可见字符的 mean/p50/p95/min/max；
- 相对参考生成器汇总均值的差距；
- 晋级决定与逐项失败原因。

聚合逻辑必须是纯函数，单元测试不访问网络。

### 4.6 `cli.ts`

提供以下命令：

```bash
npm run validate:annotation-eval
npm run evaluate:annotation -- --partition dev --variant v4
npm run evaluate:annotation -- --partition holdout --variant v4
npm run test:annotation-quality
```

dev 命令可以重复运行和断点续跑；holdout 命令要求 prompt hash 已冻结，且运行前不存在该 holdout 的历史结果。

## 5. 数据分区与防污染

### 5.1 dev-v2

建立新的 18-case dev 集，覆盖但不复用已见 golden12 的文本和问题：

- 证据不确定性；
- 目标排序与机会成本；
- 制度设计与执行；
- 环境塑造与主体能动性；
- 关系、支持与互惠边界；
- 变化、试错与方法失效。

每类至少 3 个 case。dev 可以用于失败分析和提示词改写。

### 5.2 holdout-v2

建立新的 12-case sealed holdout，与 dev-v2、旧 dev、golden12 在 normalized query 和 passage clause 上零重合。holdout 在 v4 生成前冻结并记录 SHA-256；提示词迭代期间不能读取期望答案或裁判结果。

旧 golden12 保留为已知回归集，只用于观察是否出现严重倒退，不再作为新一轮晋级依据。

### 5.3 原始产物

每次运行写入 `artifacts/annotation-eval/<run-id>/`：

- `generations.json`；
- `blind-round<N>.json`；
- `mapping.json`；
- `judge-<name>-round<N>.json`；
- `aggregate.json`。

这些文件默认忽略。只有经过聚合与脱敏的 summary JSON 和 Markdown 报告写入 `docs/qa/annotation-eval/`。

## 6. v4 提示词设计

v4 不继续增加全局禁令，而采用两层结构。

### 6.1 固定双向骨架

- `sixToMe`：从原文可支持的最小义理出发，直接回答问题，处理题目中的张力，并给出与问题相关的可观察判断标准。
- `meToSix`：从现代处境返回原文，只增加一个相关机制、条件或适用边界，不重复前向建议，不贬称原文简单、静态或缺失现代概念。
- 两个字段均禁止虚构史实、动机、因果、现代术语来源和无依据数值。

### 6.2 条件化约束

模型先静默识别问题类型，只激活相关模块：

- `uncertainty`：区分事实、推测、未知；允许可验证和可更新行动。
- `resource-priority`：识别阶段主目标、边际收益、机会成本与系统瓶颈。
- `institution-execution`：同时保留制度安排、执行条件、反馈和可复核例外。
- `agency-environment`：同时保留环境塑造、人的选择与持续学习。
- `relationship-consent`：只在问题涉及关系压力、支持或互惠时处理意愿、能力和停止边界。
- `change-experiment`：区分方法、目标和环境变化；旧方法失效时选择有证据的替代方案。

未命中的模块不得出现在最终回答中。输出前静默删除与问题无关的安全、拒绝、权益、证据或试错套话。

## 7. 迭代协议

1. 先冻结 dev-v2、holdout-v2、评分协议和门槛。
2. 运行 v3 作为新 dev 基线，每个 case 两轮。
3. 运行 v4，每个 case 两轮；固定 `deepseek-v4-flash`、thinking disabled、temperature 0.35、max tokens 240、stream true。
4. Luna max、Terra max、Sol xhigh 子 agent 对 v3/v4 匿名评分。
5. 只有当 v4 相对 v3 没有新增 hard fail，且质量有明确改善时，才允许一个失败定向的 v5；最多再迭代两版。
6. 冻结最优 prompt hash 后，才运行 holdout-v2×3。
7. holdout 由 Codex/Kimi 参考答案与冻结 DeepSeek 候选共同组成匿名包，三个子 agent 独立评分。
8. holdout 运行后不得继续基于它调参；失败时记录结果并建立下一版 holdout。

## 8. 晋级门槛

生产晋级必须同时满足：

- JSON 有效率 100%；
- 平均质量 ≥24.2/25；
- passage fidelity ≥4.7/5；
- semantic precision ≥4.7/5；
- hard-fail 评审数为 0；
- 相对 Codex/Kimi 参考生成器汇总均值差距 ≤0.75；
- 相对 v3 已知回归集没有超过 0.5 分的平均倒退；
- 所有契约、匿名化、聚合与提示词 hash 测试通过。

任何一项失败都禁止自动或手动写入生产提示词。

## 9. 测试策略

采用测试驱动方式实现：

- contract：缺字段、重复 id、非法分数、错误 hash 和分区重合必须失败；
- prompt registry：冻结版本不可变，hash 稳定；
- blind packet：映射完整、顺序确定、匿名包无身份泄漏；
- aggregate：维度均值、分位数、paired test、hard fail 和门槛边界正确；
- artifact writer：只允许 raw 写入忽略目录，summary 必须脱敏；
- CLI：缺凭据、错误模型、holdout 未冻结、结果已存在时明确失败；
- secret scan：提交资产不得包含实际 API key。

相关 Jest、TypeScript、ESLint 与格式检查全部通过后，才开始真实 Provider 运行。

## 10. 错误处理与恢复

- 网络错误最多重试三次，保留 attempt 数和脱敏错误摘要。
- 每个 case/round/variant 使用稳定 key，支持断点续跑。
- 任一非法 generation 或 judgment 不进入聚合，聚合命令返回非零。
- holdout 中途失败可以从已有有效行恢复，但不能更换 prompt hash 或模型参数。
- 子 agent 输出格式差异在导入边界规范化，原始分数不被改写。

## 11. 生产修改规则

只有 `promotionPassed=true` 时才进入生产修改阶段：

1. 为生产 prompt contract 编写失败测试；
2. 将冻结提示词同步到 `src/lib/annotation/llm.ts`；
3. 运行 annotation unit/integration tests、type-check、lint 和必要的真实 smoke；
4. 报告提示词 hash、评测结果和剩余风险。

若没有通过，生产代码保持原样，报告必须明确列出失败门槛和下一轮假设。

## 12. 验收标准

- annotation eval 可由仓库内命令复现，不依赖 `.tmp` 脚本。
- 固定资产、提示词版本、测试、summary 与报告进入版本管理。
- 原始模型全文、身份映射、裁判全文和凭据不进入版本管理。
- v4 至少完成 dev-v2 两轮匿名对比。
- 最优候选完成新的 sealed holdout-v2×3。
- 只有全门槛通过才修改生产提示词；否则保留生产现状。
