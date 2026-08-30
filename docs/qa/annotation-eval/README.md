# Annotation Eval

本目录保存可提交的脱敏汇总和报告。完整生成、匿名盲包、身份映射与裁判原始评分只写入被 Git 忽略的 `artifacts/annotation-eval/`；API key 只从本地 `.env.local` 读取，不写入任何产物。

## 固定运行契约

- Provider：`DEEPSEEK_MODEL=deepseek-v4-flash`
- thinking：disabled
- temperature：`0.35`
- max tokens：`240`
- 请求：streaming
- 并发：`3`
- dev 可按稳定 key 断点续跑。
- holdout 只接受已冻结 prompt 和 sealed fixture；中断后仅可在 prompt hash、模型和参数完全一致时续跑，完整结果已存在时拒绝覆盖。

## 命令

先验证凭据是否存在、模型名和三份 fixture hash。命令只输出 presence boolean，不输出凭据：

```bash
npm run validate:annotation-eval
```

生成 dev 候选两轮：

```bash
npm run evaluate:annotation -- --partition dev --variant v3 --rounds 2
npm run evaluate:annotation -- --partition dev --variant v4 --rounds 2
```

生成确定性匿名盲包：

```bash
npx tsx scripts/annotation-eval/cli.ts blind \
  --partition dev --candidates v3,v4 --rounds 2
```

裁判文件放在命令返回的 comparison run directory，命名为 `judge-<name>-round<N>.json`。内容是 judgment 数组，必须覆盖该轮每个 case 和盲包中的全部字母候选。

聚合并生成脱敏 summary/report：

```bash
npx tsx scripts/annotation-eval/cli.ts aggregate \
  --partition dev --target v4 --references v3 --rounds 2 \
  --known-golden-regression 0
```

只有 dev 证据确定最终候选后才可追加 `--select`；这会在该候选的 tracked dev summary 中记录唯一的冻结 prompt id 和 SHA-256。之后可以用 `--variant selected` 运行 sealed holdout：

```bash
npm run evaluate:annotation -- --partition holdout --variant selected --rounds 3
```

运行全部离线契约测试：

```bash
npm run test:annotation-quality
npm run type-check:scripts
```

## 晋级规则

holdout 是 one-shot：冻结候选后运行，不得依据 holdout 的答案或裁判结果继续改提示词。生产提示词只有在聚合结果 `promotionPassed=true` 时才允许同步；任一门槛未通过都必须保留生产代码现状，并在报告中记录失败门槛和下一轮假设。
