# Annotation Eval 与 DeepSeek 提示词迭代实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库内建立可复现、可测试、可脱敏的 annotation eval 子系统，并用新的 dev-v2 与 sealed holdout-v2 继续迭代 `deepseek-v4-flash` 条件化提示词。

**Architecture:** 离线评测能力放在 `scripts/annotation-eval`，由纯契约、提示词注册、Provider、匿名化、聚合和 CLI 六个边界组成；固定 fixture 与脱敏 summary 进入版本管理，完整输出和身份映射只进入忽略的 `artifacts/annotation-eval`。真实实验先在 dev-v2 比较 v3/v4，必要时最多迭代到 v6，冻结最佳 hash 后再运行 sealed holdout-v2×3；只有全部门槛通过才同步生产提示词。

**Tech Stack:** TypeScript 5.6、tsx、Zod 3、Jest 29、Node.js Fetch API、OpenAI-compatible streaming API、SHA-256。

**Spec:** `docs/superpowers/specs/2026-08-30-annotation-eval-prompt-iteration-design.md`

## Global Constraints

- 不新增 GitHub Actions 或其他 CI workflow。
- 模型固定为 `deepseek-v4-flash`，thinking disabled，temperature `0.35`，max tokens `240`，stream `true`。
- API key、Provider 私有配置、完整模型输出、盲包、映射和原始裁判评分不得进入版本管理。
- Codex/Kimi 只生成参考答案；Luna max、Terra max、Sol xhigh 子 agent 只做匿名评分。
- dev-v2 与 holdout-v2 不得复用旧 dev 或 golden12 的 normalized query 和 passage clause。
- holdout-v2 在提示词运行前冻结并记录 SHA-256；运行后不得继续基于它调参。
- 生产晋级要求 JSON 100%、平均分 ≥24.2、fidelity ≥4.7、precision ≥4.7、hard fail 0、参考差距 ≤0.75、旧 golden 回归下降 ≤0.5。
- 未通过全部门槛时不得修改 `src/lib/annotation/llm.ts`。
- 不建立新分支；保留用户工作区中的所有无关改动。

---

## File Structure

### Create

- `scripts/annotation-eval/contract.ts`：Zod 契约、类型和交叉分区校验。
- `scripts/annotation-eval/prompt-registry.ts`：v0–v4 提示词、hash 与冻结检查。
- `scripts/annotation-eval/provider.ts`：流式调用、指标、重试与脱敏。
- `scripts/annotation-eval/artifacts.ts`：raw artifact 安全路径、断点续跑和 summary 写入。
- `scripts/annotation-eval/blind-packet.ts`：确定性匿名化与泄漏检查。
- `scripts/annotation-eval/aggregate.ts`：评分规范化、统计、门槛和报告模型。
- `scripts/annotation-eval/cli.ts`：validate/generate/blind/aggregate 命令入口。
- `tests/fixtures/annotation-eval/dev-v2.json`：18 个可迭代 case。
- `tests/fixtures/annotation-eval/holdout-v2.json`：12 个 sealed case。
- `tests/fixtures/annotation-eval/golden-v1.json`：现有 golden12 的正式项目副本。
- `tests/unit/tooling/annotation-eval-contract.test.ts`
- `tests/unit/tooling/annotation-eval-prompt-registry.test.ts`
- `tests/unit/tooling/annotation-eval-provider.test.ts`
- `tests/unit/tooling/annotation-eval-blind-packet.test.ts`
- `tests/unit/tooling/annotation-eval-aggregate.test.ts`
- `tests/unit/tooling/annotation-eval-artifacts.test.ts`
- `docs/qa/annotation-eval/README.md`
- `docs/qa/annotation-eval/deepseek-v4-flash-v4-summary.json`
- `docs/qa/annotation-eval/deepseek-v4-flash-v4-report.md`

### Modify

- `.gitignore`：忽略 `/artifacts/annotation-eval/`。
- `package.json`：新增三个 annotation eval 命令。
- `tsconfig.scripts.json`：纳入 `scripts/annotation-eval/**/*.ts`。
- `src/lib/annotation/llm.ts`：仅在最终 `promotionPassed=true` 时修改。
- `tests/unit/annotation/llm.test.ts`：仅在生产晋级时增加 prompt contract 测试。

---

### Task 1: 定义评测契约与分区校验

**Files:**
- Create: `scripts/annotation-eval/contract.ts`
- Create: `tests/unit/tooling/annotation-eval-contract.test.ts`
- Modify: `tsconfig.scripts.json`

**Interfaces:**
- Produces: `EvalFixtureSchema`, `PromptVariantSchema`, `GenerationSchema`, `BlindPacketSchema`, `JudgmentSchema`, `AggregateResultSchema`。
- Produces: `parseEvalFixture(value: unknown): EvalFixture`。
- Produces: `parseJudgment(value: unknown): Judgment`。
- Produces: `assertDisjointPartitions(partitions: EvalFixture[]): void`。
- Consumes: Node `crypto` for normalized clause identity and Zod for runtime validation。

- [ ] **Step 1: Write failing schema and partition tests**

```ts
import {
  assertDisjointPartitions,
  parseEvalFixture,
} from "../../../scripts/annotation-eval/contract";

it("rejects duplicate case ids", () => {
  expect(() => parseEvalFixture(buildFixture([buildCase("same"), buildCase("same")]))).toThrow(
    "duplicate case id: same",
  );
});

it("rejects query or passage overlap across partitions", () => {
  const dev = parseEvalFixture(buildFixture([buildCase("dev-1")]));
  const holdout = parseEvalFixture(
    buildFixture([{ ...buildCase("holdout-1"), query: "  测试问题  " }]),
  );
  expect(() => assertDisjointPartitions([dev, holdout])).toThrow("partition overlap");
});

it("accepts integer scores from one through five", () => {
  expect(() => parseJudgment(buildJudgment({ passageFidelity: 5 }))).not.toThrow();
  expect(() => parseJudgment(buildJudgment({ passageFidelity: 6 }))).toThrow();
});
```

- [ ] **Step 2: Run the contract tests and verify RED**

Run: `npx jest tests/unit/tooling/annotation-eval-contract.test.ts --runInBand`

Expected: FAIL because `scripts/annotation-eval/contract.ts` does not exist.

- [ ] **Step 3: Implement the contracts**

Implement exact discriminators and ranges:

```ts
export const SCORE_DIMENSIONS = [
  "passageFidelity",
  "queryRelevance",
  "dualDirection",
  "interpretiveDepth",
  "semanticPrecision",
] as const;

const ScoreSchema = z.number().int().min(1).max(5);
const CandidateScoreSchema = z.object({
  passageFidelity: ScoreSchema,
  queryRelevance: ScoreSchema,
  dualDirection: ScoreSchema,
  interpretiveDepth: ScoreSchema,
  semanticPrecision: ScoreSchema,
  hardFails: z.array(z.string()),
  failureTags: z.array(z.string()).default([]),
});
```

Normalize queries with NFKC, whitespace removal and Chinese punctuation removal. Normalize passage clauses by splitting on `，。；！？、：`, retaining clauses of at least two characters. Throw on duplicate ids, duplicate normalized queries or any cross-partition query/clause collision.

- [ ] **Step 4: Add the script directory to TypeScript**

Replace the explicit annotation list in `tsconfig.scripts.json` by adding:

```json
"scripts/annotation-eval/**/*.ts"
```

- [ ] **Step 5: Run tests and type-check GREEN**

Run:

```bash
npx jest tests/unit/tooling/annotation-eval-contract.test.ts --runInBand
npx tsc --noEmit -p tsconfig.scripts.json
```

Expected: all contract tests pass; TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/annotation-eval/contract.ts tests/unit/tooling/annotation-eval-contract.test.ts tsconfig.scripts.json
git commit -m "test: define annotation eval contracts"
```

### Task 2: 建立冻结提示词注册表

**Files:**
- Create: `scripts/annotation-eval/prompt-registry.ts`
- Create: `tests/unit/tooling/annotation-eval-prompt-registry.test.ts`

**Interfaces:**
- Consumes: `PromptVariant` from `contract.ts`。
- Produces: `PROMPT_VARIANTS: Readonly<Record<string, PromptVariant>>`。
- Produces: `promptHash(variant: Pick<PromptVariant, "system" | "instructions">): string`。
- Produces: `getPromptVariant(id: string): PromptVariant`。

- [ ] **Step 1: Write failing hash and immutability tests**

```ts
it("reproduces the frozen v3 hash", () => {
  expect(getPromptVariant("v3").sha256).toBe(
    "736e3a223ed96798945c4a1a7de4aab82db34c78045a358af760acccd64c2baf",
  );
});

it("returns deeply frozen prompt definitions", () => {
  const prompt = getPromptVariant("v4");
  expect(Object.isFrozen(prompt)).toBe(true);
  expect(Object.isFrozen(prompt.instructions)).toBe(true);
});
```

- [ ] **Step 2: Run the registry tests and verify RED**

Run: `npx jest tests/unit/tooling/annotation-eval-prompt-registry.test.ts --runInBand`

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Implement v0–v4**

Copy v0–v3 exactly from the recorded experiment. Define v4 with this invariant order:

```ts
const v4Instructions = [
  "任务是写两个方向不同的当代注释，不宣称唯一原意。",
  "先静默识别原文最小主张、问题张力和问题类型；只应用命中的规则，未命中的规则不得写入答案。",
  "sixToMe 从原文进入问题：直接回答张力，给出与本题相关的决策次序和可观察标准。",
  "meToSix 从现代处境返回原文：只增加一个相关机制、条件或边界，不重复前向建议，不贬称原文简单、静态或缺少现代概念。",
  "若属于证据不确定，区分事实、推测和未知；若属于资源排序，说明阶段主目标、边际收益、机会成本或系统瓶颈。",
  "若属于制度执行，同时保留制度安排、执行条件、反馈和可复核例外；若属于环境塑造，同时保留环境影响、人的选择和持续学习。",
  "若属于关系支持或互惠，才处理意愿、能力和停止边界；若属于方法变化，区分目标、方法与环境，并用证据选择可逆替代方案。",
  "禁止虚构史实、动机、因果、现代术语来源和输入未提供的数值；输出前删除所有与本题无关的安全、拒绝、权益、证据或试错套话。",
  "每个字段 2–3 句，简体中文；只输出含 sixToMe、meToSix 的 JSON。",
];
```

Record `parentId: "v3"`, `hypothesis`, `expectedImprovements` and `regressionRisks`.

- [ ] **Step 4: Run registry tests GREEN**

Run:

```bash
npx jest tests/unit/tooling/annotation-eval-prompt-registry.test.ts --runInBand
npx tsc --noEmit -p tsconfig.scripts.json
```

Expected: pass and exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/annotation-eval/prompt-registry.ts tests/unit/tooling/annotation-eval-prompt-registry.test.ts
git commit -m "feat: register frozen annotation prompts"
```

### Task 3: 实现流式 Provider 与安全 artifact 存储

**Files:**
- Create: `scripts/annotation-eval/provider.ts`
- Create: `scripts/annotation-eval/artifacts.ts`
- Create: `tests/unit/tooling/annotation-eval-provider.test.ts`
- Create: `tests/unit/tooling/annotation-eval-artifacts.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `EvalCase`, `Generation`, `PromptVariant`。
- Produces: `generateAnnotation(input: GenerateAnnotationInput, fetchImpl?: typeof fetch): Promise<Generation>`。
- Produces: `artifactRunDir(runId: string): string`。
- Produces: `readGenerationCheckpoint(runId: string): Generation[]`。
- Produces: `writeGenerationCheckpoint(runId: string, rows: Generation[]): void`。
- Produces: `writeTrackedSummary(path: string, value: AggregateResult): void`。

- [ ] **Step 1: Write failing SSE, metric and path tests**

Use a fake `ReadableStream` containing two `data:` chunks and a usage chunk. Assert:

```ts
expect(result.output).toEqual({ sixToMe: "前向", meToSix: "反向" });
expect(result.metrics.firstContentMs).not.toBeNull();
expect(result.metrics.reasoningTokens).toBe(0);
expect(requestBody.thinking).toEqual({ type: "disabled" });
expect(requestBody.stream).toBe(true);
expect(requestBody.temperature).toBe(0.35);
expect(requestBody.max_tokens).toBe(240);
```

Artifact tests must reject `../escape`, absolute paths and tracked raw-output paths.

- [ ] **Step 2: Run provider/artifact tests RED**

Run:

```bash
npx jest tests/unit/tooling/annotation-eval-provider.test.ts tests/unit/tooling/annotation-eval-artifacts.test.ts --runInBand
```

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement streaming parsing and retry**

Implement a single SSE parser that records headers, first event, first reasoning, first content and total elapsed time using an injected `now()` function in tests. Retry network/5xx errors up to three attempts; do not retry schema-invalid successful responses. Replace any loaded API key in error text with `[REDACTED]`.

- [ ] **Step 4: Implement artifact boundaries**

Resolve raw files only below `artifacts/annotation-eval/{partition}-{variant}-{fixtureHashPrefix}/`. The directory name is computed from validated inputs and may not be supplied as an arbitrary path. Add this exact ignore rule:

```gitignore
/artifacts/annotation-eval/
```

Tracked summaries may only be written below `docs/qa/annotation-eval/` and must pass an actual-key leak scan before write.

- [ ] **Step 5: Run tests, type-check and lint GREEN**

Run:

```bash
npx jest tests/unit/tooling/annotation-eval-provider.test.ts tests/unit/tooling/annotation-eval-artifacts.test.ts --runInBand
npx tsc --noEmit -p tsconfig.scripts.json
npx eslint scripts/annotation-eval/provider.ts scripts/annotation-eval/artifacts.ts tests/unit/tooling/annotation-eval-provider.test.ts tests/unit/tooling/annotation-eval-artifacts.test.ts --max-warnings=0
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/annotation-eval/provider.ts scripts/annotation-eval/artifacts.ts tests/unit/tooling/annotation-eval-provider.test.ts tests/unit/tooling/annotation-eval-artifacts.test.ts
git commit -m "feat: add safe streaming eval runner"
```

### Task 4: 实现确定性匿名包

**Files:**
- Create: `scripts/annotation-eval/blind-packet.ts`
- Create: `tests/unit/tooling/annotation-eval-blind-packet.test.ts`

**Interfaces:**
- Consumes: `EvalFixture`, candidate generations and `round`。
- Produces: `buildBlindPacket(input: BuildBlindPacketInput): { packet: BlindCase[]; mapping: BlindMapping[] }`。
- Produces: `assertBlindPacketHasNoIdentityLeaks(packet: BlindCase[]): void`。

- [ ] **Step 1: Write failing determinism and leak tests**

```ts
it("is deterministic but varies by round and case", () => {
  expect(build(input).mapping).toEqual(build(input).mapping);
  expect(build({ ...input, round: 2 }).mapping).not.toEqual(build(input).mapping);
});

it.each(["deepseek_v4", "codex_", "kimi_", "promptHash", "referenceAnswer", "expectations"])(
  "rejects %s identity leakage",
  (marker) => expect(() => assertBlindPacketHasNoIdentityLeaks(inject(marker))).toThrow(marker),
);
```

- [ ] **Step 2: Run blind tests RED**

Run: `npx jest tests/unit/tooling/annotation-eval-blind-packet.test.ts --runInBand`

Expected: module-not-found failure.

- [ ] **Step 3: Implement SHA-256 ordering**

Sort candidates by:

```ts
sha256(`${evalId}:${round}:${caseId}:${candidateId}`)
```

Assign labels `A` onward and assert mapping size equals `cases × candidates`.

- [ ] **Step 4: Run blind tests GREEN**

Run:

```bash
npx jest tests/unit/tooling/annotation-eval-blind-packet.test.ts --runInBand
npx tsc --noEmit -p tsconfig.scripts.json
```

- [ ] **Step 5: Commit**

```bash
git add scripts/annotation-eval/blind-packet.ts tests/unit/tooling/annotation-eval-blind-packet.test.ts
git commit -m "feat: build anonymous annotation eval packets"
```

### Task 5: 实现聚合、统计与晋级门槛

**Files:**
- Create: `scripts/annotation-eval/aggregate.ts`
- Create: `tests/unit/tooling/annotation-eval-aggregate.test.ts`

**Interfaces:**
- Consumes: generations, mappings and normalized judgments。
- Produces: `normalizeJudgmentRows(value: unknown): Judgment[]`。
- Produces: `aggregateEvaluation(input: AggregateInput): AggregateResult`。
- Produces: `renderEvaluationReport(result: AggregateResult): string`。

- [ ] **Step 1: Write failing boundary tests**

Cover all accepted judge shapes: `scores`, `candidates`, and direct `A`/`B` fields. Add exact gate boundaries:

```ts
expect(decide({ average25: 24.2, fidelity: 4.7, precision: 4.7, hardFails: 0, gap: 0.75 })).toBe(true);
expect(decide({ average25: 24.199, fidelity: 4.7, precision: 4.7, hardFails: 0, gap: 0.75 })).toBe(false);
expect(decide({ average25: 24.2, fidelity: 4.7, precision: 4.7, hardFails: 1, gap: 0.75 })).toBe(false);
```

Test mean/p50/p95 interpolation and exact two-sided binomial p-values for 26–2 and 16–10 outcomes.

- [ ] **Step 2: Run aggregate tests RED**

Run: `npx jest tests/unit/tooling/annotation-eval-aggregate.test.ts --runInBand`

- [ ] **Step 3: Implement pure aggregation**

Calculate candidate/dimension/round/case summaries, hard-fail reasons, failure tag counts, paired comparisons, metric distributions and these named gates:

```ts
validJsonRate
average25
passageFidelity
semanticPrecision
hardFailReviews
gapToGeneratorConsensus
knownGoldenRegression
```

Promotion is `Object.values(gates).every(({ pass }) => pass)`.

- [ ] **Step 4: Run aggregate tests GREEN**

Run:

```bash
npx jest tests/unit/tooling/annotation-eval-aggregate.test.ts --runInBand
npx tsc --noEmit -p tsconfig.scripts.json
```

- [ ] **Step 5: Commit**

```bash
git add scripts/annotation-eval/aggregate.ts tests/unit/tooling/annotation-eval-aggregate.test.ts
git commit -m "feat: aggregate annotation quality gates"
```

### Task 6: 建立 fixture 与 sealed holdout

**Files:**
- Create: `tests/fixtures/annotation-eval/dev-v2.json`
- Create: `tests/fixtures/annotation-eval/holdout-v2.json`
- Create: `tests/fixtures/annotation-eval/golden-v1.json`
- Modify: `tests/unit/tooling/annotation-eval-contract.test.ts`

**Interfaces:**
- Consumes: `parseEvalFixture` and `assertDisjointPartitions` from Task 1。
- Produces: three validated fixtures with immutable `fixtureSha256` metadata。

- [ ] **Step 1: Add failing fixture validation tests**

```ts
it("keeps dev-v2, holdout-v2 and golden-v1 disjoint", () => {
  expect(() => assertDisjointPartitions([dev, holdout, golden])).not.toThrow();
});

it("has the required category coverage", () => {
  expect(categoryCounts(dev)).toEqual({
    uncertainty: 3,
    "resource-priority": 3,
    "institution-execution": 3,
    "agency-environment": 3,
    "relationship-consent": 3,
    "change-experiment": 3,
  });
  expect(holdout.cases).toHaveLength(12);
});
```

- [ ] **Step 2: Run fixture tests RED**

Run: `npx jest tests/unit/tooling/annotation-eval-contract.test.ts --runInBand`

Expected: missing fixture files.

- [ ] **Step 3: Create dev-v2**

Select 18 source passages from `data/rysxguji/guji-core-v1.jsonl`, exactly three per category. Each case must include `mustPreserve`, direction-specific requirements, `forbiddenClaims`, and acceptable variants. Do not reuse normalized queries or two-character-plus passage clauses from old dev/golden fixtures.

- [ ] **Step 4: Create and seal holdout-v2 before prompt generation**

Select 12 different passages, two per category. Set `sealed: true`, compute the canonical SHA-256 over `{evalId,cases}`, store it as `fixtureSha256`, and do not include reference answers in the fixture supplied to generators.

- [ ] **Step 5: Copy golden-v1 into the canonical directory**

Preserve all 12 existing cases and reference answers unchanged; only add partition metadata and recompute its fixture hash.

- [ ] **Step 6: Run fixture and secret checks GREEN**

Run:

```bash
npx jest tests/unit/tooling/annotation-eval-contract.test.ts --runInBand
npm run type-check:scripts
```

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/annotation-eval tests/unit/tooling/annotation-eval-contract.test.ts
git commit -m "test: freeze annotation eval fixtures"
```

### Task 7: 建立 CLI、项目命令和文档入口

**Files:**
- Create: `scripts/annotation-eval/cli.ts`
- Create: `docs/qa/annotation-eval/README.md`
- Modify: `package.json`
- Modify: `tests/unit/tooling/annotation-eval-artifacts.test.ts`

**Interfaces:**
- Consumes all Task 1–6 modules。
- Produces CLI subcommands `validate`, `generate`, `blind`, `aggregate`。
- Produces variant alias `selected`, resolved from the tracked dev summary only when that summary contains one frozen prompt id and matching SHA-256。

- [ ] **Step 1: Write failing CLI argument tests**

Export `parseCliArgs(argv: string[]): CliCommand`. Assert exact errors for unknown command, missing `--partition`, missing `--variant`, holdout without frozen hash, and an existing holdout result with the same prompt hash.

- [ ] **Step 2: Run CLI tests RED**

Run: `npx jest tests/unit/tooling/annotation-eval-artifacts.test.ts --runInBand`

- [ ] **Step 3: Implement CLI orchestration**

Use stable generation keys `${partition}:${variant}:${round}:${caseId}`. Support checkpoint resume for dev; for holdout, allow resume only when model parameters and prompt hash match existing rows.

- [ ] **Step 4: Add package scripts**

```json
"validate:annotation-eval": "tsx scripts/annotation-eval/cli.ts validate",
"evaluate:annotation": "tsx scripts/annotation-eval/cli.ts generate",
"test:annotation-quality": "jest --runInBand tests/unit/tooling/annotation-eval-*.test.ts"
```

- [ ] **Step 5: Document exact commands and artifact policy**

`docs/qa/annotation-eval/README.md` must state that raw artifacts are ignored, summaries are tracked, holdout results are one-shot, and production changes require `promotionPassed=true`.

- [ ] **Step 6: Run CLI and tooling checks GREEN**

Run:

```bash
npm run validate:annotation-eval
npm run test:annotation-quality
npm run type-check:scripts
npm run lint -- --no-error-on-unmatched-pattern
```

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/annotation-eval/cli.ts docs/qa/annotation-eval/README.md tests/unit/tooling/annotation-eval-artifacts.test.ts
git commit -m "feat: add annotation eval commands"
```

### Task 8: 运行 dev-v2 v3/v4 实验并选择候选

**Files:**
- Create locally only: `artifacts/annotation-eval/dev-{variant}-{fixtureHashPrefix}/*`
- Create after aggregation: `docs/qa/annotation-eval/deepseek-v4-flash-v4-summary.json`
- Create after aggregation: `docs/qa/annotation-eval/deepseek-v4-flash-v4-report.md`
- Modify only if evidence requires another variant: `scripts/annotation-eval/prompt-registry.ts`

**Interfaces:**
- Consumes frozen dev-v2 fixture, v3/v4 prompt variants and eval CLI。
- Produces tracked dev summary/report and a frozen winning prompt hash。

- [ ] **Step 1: Validate environment without printing secrets**

Run `npm run validate:annotation-eval`; report only model equality, API-key presence boolean and fixture hashes.

- [ ] **Step 2: Generate v3 and v4 twice on dev-v2**

```bash
npm run evaluate:annotation -- --partition dev --variant v3 --rounds 2
npm run evaluate:annotation -- --partition dev --variant v4 --rounds 2
```

Expected: 72 valid rows total and no invalid JSON.

- [ ] **Step 3: Build two blind packets**

```bash
tsx scripts/annotation-eval/cli.ts blind --partition dev --left v3 --right v4 --round 1
tsx scripts/annotation-eval/cli.ts blind --partition dev --left v3 --right v4 --round 2
```

Expected: 18 cases, 36 mapping rows per round, no identity markers in blind files.

- [ ] **Step 4: Obtain isolated judgments**

Give each blind packet independently to Luna max、Terra max、Sol xhigh. Judges may read only the assigned blind files and must write five scores, hardFails, failureTags, full ranking, ambiguity and note.

- [ ] **Step 5: Aggregate v3/v4**

Run:

```bash
tsx scripts/annotation-eval/cli.ts aggregate --partition dev --left v3 --right v4
```

Freeze v4 when it improves average score without increasing hard-fail reviews. If not, create exactly one failure-directed v5, rerun two rounds, and allow a final v6 only when v5 shows a new isolated failure cluster rather than general score noise.

- [ ] **Step 6: Commit tracked dev evidence**

```bash
git add scripts/annotation-eval/prompt-registry.ts docs/qa/annotation-eval/deepseek-v4-flash-v4-summary.json docs/qa/annotation-eval/deepseek-v4-flash-v4-report.md
git commit -m "docs: record DeepSeek annotation prompt iteration"
```

### Task 9: 运行 sealed holdout-v2×3 与生产门槛

**Files:**
- Create locally only: `artifacts/annotation-eval/holdout-{variant}-{fixtureHashPrefix}/*`
- Modify: `docs/qa/annotation-eval/deepseek-v4-flash-v4-summary.json`
- Modify: `docs/qa/annotation-eval/deepseek-v4-flash-v4-report.md`
- Conditionally modify: `src/lib/annotation/llm.ts`
- Conditionally modify: `tests/unit/annotation/llm.test.ts`

**Interfaces:**
- Consumes frozen winner, sealed holdout-v2, Codex/Kimi reference outputs and three isolated judge files。
- Produces final `promotionPassed` decision。

- [ ] **Step 1: Generate frozen DeepSeek holdout outputs**

```bash
npm run evaluate:annotation -- --partition holdout --variant selected --rounds 3
```

Expected: 36/36 valid rows with one prompt hash and fixed model settings.

- [ ] **Step 2: Generate Codex/Kimi references three times**

Generate the same 12 cases with Codex Luna max、Terra max、Sol xhigh、Sol max、Kimi For Coding、Kimi K3. Do not provide constraints or reference answers to generators.

- [ ] **Step 3: Build A–G blind packets and obtain three judges**

For each round, anonymously combine frozen DeepSeek plus six references. Luna/Terra/Sol judges may read only their assigned blind packet.

- [ ] **Step 4: Aggregate and persist the final decision**

```bash
tsx scripts/annotation-eval/cli.ts aggregate --partition holdout --variant selected --references all
```

Assert 252 outputs, 756 candidate reviews and 3,780 dimension scores before trusting the decision.

- [ ] **Step 5: Apply the production gate**

If `promotionPassed=false`, do not touch production; record each failed gate and stop. If `promotionPassed=true`, invoke test-driven-development, add a failing prompt contract test, update only the system/user prompt lines in `src/lib/annotation/llm.ts`, then run:

```bash
npx jest tests/unit/annotation/llm.test.ts --runInBand
npm run type-check
npm run lint
```

- [ ] **Step 6: Commit final evidence and any gated production change**

```bash
git add docs/qa/annotation-eval/deepseek-v4-flash-v4-summary.json docs/qa/annotation-eval/deepseek-v4-flash-v4-report.md
git add src/lib/annotation/llm.ts tests/unit/annotation/llm.test.ts  # only when promotionPassed=true
git commit -m "docs: finalize DeepSeek annotation quality gate"
```

### Task 10: Final verification

**Files:**
- Verify all files above; do not create new production files.

**Interfaces:**
- Consumes the repository state and final aggregate result。
- Produces fresh verification evidence only。

- [ ] **Step 1: Run the full relevant suite**

```bash
npm run test:annotation-quality
npx jest tests/unit/annotation/llm.test.ts tests/unit/annotation/service.test.ts tests/integration/api/annotate.route.test.ts --runInBand
npm run type-check
npm run lint
npm run format:check
git diff --check
```

- [ ] **Step 2: Verify artifact and secret boundaries**

Assert raw files exist only below ignored `artifacts/annotation-eval/`; scan every tracked annotation eval file for the actual loaded API key and require zero hits.

- [ ] **Step 3: Verify final counts and hashes**

Recompute fixture hash、prompt hash、generation count、mapping count、judge count、dimension-score count and every promotion gate from raw artifacts; compare them with tracked summary values.

- [ ] **Step 4: Report exact status**

Report files added, commands executed, pass/fail counts, prompt/golden gaps, streaming metrics, whether production changed, and remaining failure modes. Do not describe the task as complete if any required command or gate failed.
