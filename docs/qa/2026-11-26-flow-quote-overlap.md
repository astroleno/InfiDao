# Flow 引文连续重叠离线回放

四字重叠适合提示复查。18 个固定读点共 1,498 个选项，标记 3 个，仅 1 个下移，首选变化 0。两臂沿用同一批冻结盲评，均为 **15 D / 3 P / 0 N**，无冻结直接证据下移。预设门槛要求至少两个首选消除重复且 D 净增，本次均为 0。 [冻结盲评](flow-blind/2026-11-26-batch2-blind-grades.json) · [上轮规约](flow-blind/2026-11-26-batch2-protocol.md)

## 固定读点

标记依据是候选与任意**一条**已读引文共享至少四个连续的规范化 Unicode 码点。沿用 `quotationKey` 的 NFKC、去标点及空白等规则。原文范围继续使用 UTF-16 半开区间，按全文哈希和切片核对。短名单、切句、同档相邻单次交换都沿用既有回放。代码校验跨来路拼接、非连续匹配、补充平面字符和空来路，并在复用盲评前核对 18 个首选和原匿名材料。

三个标记集中于 D3。两段射箭譬喻分别位于第 2、3 名，共享「反求诸己」4 字，且原文继续给出发箭前正己、射不中时不怨对手的过程。两段的名次保持。共享「君子求诸己小人求诸人」10 字的《论语》选项由第 51 名移至第 52 名。D3 首选仍是「爱人不亲，反其仁；治人不治，反其智；礼人不答，反其敬」，沿用已有 D 评语。诗歌三点仍各为 P，所需原作片段在排序前就缺席。 [既有逐点结果](flow-blind/2026-11-26-batch2-results.json)

## v20 历史对照

表中范围来自归档，同窗选项仅计算重叠标记。历史盲评沿用实际交付的 Q（引文）与 R（回响）结果。「恕」的后段与「择」的长段属于归档提案，二者均无新的独立评级。 [v20 原始归档](flow-blind/2026-11-26-flow-quote-evidence-v20.json) · [历史盲评和选句结果](2026-11-26-flow-quote-evidence.md)

| 读点、归档范围 | 最长共享文字 | 标记 | 证据 |
| --- | --- | --- | --- |
| 恕，pair 1 / 4，`[66,86)` | 勿施于人（4） | 有 | 两次 v20 都实际交付此段，Q 均通过，R 一过一未过。「忠恕违道不远」补充概念关系，具体行为仍是已读的禁止施加。 |
| 恕，同两对，`[86,147)` | 所（1） | 无 | 同一 `[0,190)` 窗内的「所求乎朋友先施之」`[134,142)` 提供先向朋友做出自己期待之事的行动。两次 v20 均未交付此段。 |
| 择，pair 2，`[18,28)` | 择其善者而从之（7） | 有 | 原版与 v20 均实际交付且 Q/R 通过。「多闻」提供先广泛听取、再辨善跟从的新增前提。 |
| 择，同对，`[18,40)` | 择其善者而从之（7） | 有 | 保留「多闻」，另有「多见而识之，知之次也」。 |
| 乐，pair 5，`[0,51)` | 之（1） | 无 | v20 实际交付，Q/R 从均未通过变为均通过。百姓闻乐后欣喜相告的反应在引文内可见。 |

「择」的已通过交付仍会触发四字标记，因此本批结果支持继续离线观察。「恕」提供了可对照的新增行动，固定读点回放没有显示该标记能改善首选。

## 复现

使用冻结检索与摘窗基线 `c02b75a`。如果当前工作树中的生产代码有其他改动，可先用独立临时目录重放，保留原有输入哈希检查。以下命令从仓库根目录运行，需要本地已安装依赖。无需模型或供应商请求。

```sh
ROOT=$PWD
TMP=$(mktemp -d)
git archive c02b75a | tar -x -C "$TMP"
cp scripts/run-flow-quote-rank-replay.ts "$TMP/scripts/"
ln -s "$ROOT/node_modules" "$TMP/node_modules"
cd "$TMP"
QA=docs/qa/flow-blind
FIXED="$QA/2026-11-26-batch2-fixed-points.json"
GRADES="$QA/2026-11-26-batch2-blind-grades.json"
DECK="$QA/2026-11-26-batch2-blind-deck.json"
V20="$QA/2026-11-26-flow-quote-evidence-v20.json"
RUN=node_modules/.bin/tsx
SCRIPT=scripts/run-flow-quote-rank-replay.ts
"$RUN" "$SCRIPT" overlap "$FIXED" "$GRADES" "$V20" "$DECK" > overlap.json
jq -e '.summary | .points == 18 and .options == 1498 and
  .repeatedOptions == 3 and .downweightedOptions == 1 and
  .changedLeads == [] and .loweredEvidence == [] and
  .baseline == {"D":15,"P":3,"N":0} and .trial == .baseline and .passes == false' overlap.json
jq -e '[.archive.proposals[] | .pair as $pair | .options[] |
  [$pair, .quoteStart, .quoteEnd, .shared.text, .shared.length, .repeated]] as $rows |
  all([[1,66,86,"勿施于人",4,true], [1,86,147,"所",1,false],
       [4,66,86,"勿施于人",4,true], [4,86,147,"所",1,false],
       [2,18,28,"择其善者而从之",7,true], [2,18,40,"择其善者而从之",7,true],
       [5,0,51,"之",1,false]][]; . as $expected | any($rows[]; . == $expected))' overlap.json
"$RUN" "$SCRIPT" deck "$FIXED" > deck.json && cmp deck.json "$DECK"
"$RUN" "$SCRIPT" report "$FIXED" "$GRADES" > report.json &&
  cmp report.json "$QA/2026-11-26-batch2-results.json"
"$RUN" "$SCRIPT" calibration "$QA/2026-11-25-plan-stability-contexts.json" \
  "$QA/2026-11-25-plan-stability-plans.json" "$QA/2026-11-26-flow-quote-evidence-v18.json" "$V20" > calibration.json &&
  cmp calibration.json "$QA/2026-11-26-batch2-calibration.json"
```

三个 `cmp` 均逐字节匹配。机器输出包含每个被标记选项的最长共享字串、对应来路、原始与实验名次，以及归档每个选项的标记。
