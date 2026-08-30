# Classical Annotation Cross-provider Golden Eval V1

Date: 2026-08-30  
Purpose: offline evaluation and golden-case construction, not production selection  
Locked prompts: 16 unseen cases  
Balanced rounds: 2  
Generated outputs: 192  
Blind candidate reviews: 576  
Dimension scores: 2,880

## Primary Result

The aggregate five-dimension score ranks the six available candidates as follows. A
candidate could receive at most 2,400 points: 2 rounds × 16 cases × 3 judges × 5
dimensions × 5 points.

| Candidate         |     Total | Average /25 | Score rate | First-place votes /96 | Average rank | Hard-fail reviews | Average characters |
| ----------------- | --------: | ----------: | ---------: | --------------------: | -----------: | ----------------: | -----------------: |
| Codex Sol `xhigh` | 2394/2400 |      24.938 |      99.8% |                    27 |        2.229 |                 0 |              201.0 |
| Codex Sol `max`   | 2393/2400 |      24.927 |      99.7% |                    42 |        1.885 |                 0 |              203.2 |
| Codex Terra `max` | 2361/2400 |      24.594 |      98.4% |                    12 |        3.281 |                 0 |              191.6 |
| Codex Luna `max`  | 2338/2400 |      24.354 |      97.4% |                     8 |        3.438 |                 0 |              169.0 |
| Kimi K3 `max`     | 2139/2400 |      22.281 |      89.1% |                     6 |        4.708 |                 7 |              238.6 |
| Kimi For Coding   | 2017/2400 |      21.010 |      84.0% |                     1 |        5.458 |                13 |              203.8 |

Sol `xhigh` and Sol `max` are effectively tied. `xhigh` leads by one point, while
`max` receives more first-place ranks. After aggregating all three judges within each
case and round, `xhigh` wins 3 pairs, `max` wins 4, and 25 tie (`p=1.000000`). The
near-perfect scores also show a strong ceiling effect, so the defensible result is
equivalence at this eval's resolution.

K3 is materially stronger than Kimi For Coding in this candidate pool: K3 wins 22
case-round pairs, loses 6, and ties 4 (`p=0.003719`). This is a model-and-setting
comparison, not a controlled thinking-on/off experiment.

## Semantic Dimensions

| Candidate         | Passage fidelity | Query relevance | Dual direction | Interpretive depth | Semantic precision |
| ----------------- | ---------------: | --------------: | -------------: | -----------------: | -----------------: |
| Codex Sol `xhigh` |            5.000 |           5.000 |          5.000 |              4.990 |              4.948 |
| Codex Sol `max`   |            4.979 |           4.990 |          5.000 |              4.990 |              4.969 |
| Codex Terra `max` |            4.948 |           4.990 |          4.969 |              4.729 |              4.958 |
| Codex Luna `max`  |            4.927 |           5.000 |          4.958 |              4.563 |              4.906 |
| Kimi K3 `max`     |            4.281 |           4.760 |          4.896 |              4.479 |              3.865 |
| Kimi For Coding   |            4.104 |           4.740 |          4.615 |              3.938 |              3.615 |

The Kimi candidates usually answered the modern question and produced two distinct
directions. Their main losses came from semantic precision and classical-passage
fidelity: several responses introduced stronger historical or causal claims than the
locked constraints allowed. K3 improves all five dimensions over Kimi For Coding,
with the largest gains in interpretive depth and semantic precision.

## Streaming and Token Measurements

Both Kimi candidates were called through the configured Kimi OpenAI-compatible API
with `stream=true`. K3 used `reasoning_effort=max`; Kimi For Coding used the provider
default. Codex task execution does not expose comparable API telemetry, so Codex is
excluded from this table.

| Metric                       |   Kimi For Coding |     Kimi K3 `max` |
| ---------------------------- | ----------------: | ----------------: |
| Valid balanced samples       |             32/32 |             32/32 |
| Retries                      |                 4 |                 0 |
| First stream event p50 / p95 |   1.200s / 3.194s |  1.496s / 19.609s |
| First visible text p50 / p95 | 27.516s / 44.722s | 27.327s / 64.747s |
| Total time p50 / p95         | 28.249s / 44.730s | 28.762s / 66.508s |
| Average input tokens         |             213.3 |             298.3 |
| Average completion tokens    |            1463.9 |            1211.4 |
| Average reasoning tokens     |            1321.4 |            1033.4 |
| Average total tokens         |            1677.2 |            1509.7 |
| Average visible characters   |             203.8 |             238.6 |

The first stream event was usually reasoning rather than user-visible text. Reporting
only time to first event would therefore make both models look much faster than the
actual visible response. K3's median visible latency is essentially the same as Kimi
For Coding, but its tail latency is worse. Token counts are descriptive across two
different models and should not be treated as identical billing units. The provider
did not return cost data.

## Golden Case Set

Twelve of the sixteen locked cases were promoted to the golden fixture:

| Case | Source | Scenario   | Selection lane |
| ---: | ------ | ---------- | -------------- |
|    2 | 论语   | 偏好投射   | discriminative |
|    3 | 论语   | 远虑与焦虑 | discriminative |
|    4 | 论语   | 责任归因   | discriminative |
|    6 | 大学   | 目标过载   | discriminative |
|    8 | 周易   | 自强与休息 | discriminative |
|   10 | 孟子   | 支持与正确 | stable         |
|   11 | 孟子   | 善意与制度 | stable         |
|   12 | 诗经   | 回报与关系 | discriminative |
|   13 | 礼记   | 互惠边界   | discriminative |
|   14 | 荀子   | 环境塑造   | discriminative |
|   15 | 韩非子 | 规则与情境 | stable         |
|   16 | 论语   | 极致与适度 | stable         |

The selection rule was fixed before unblinding the result:

1. Exclude a case if at least two of six judge-round reviews mark the case itself
   ambiguous. No case met this exclusion condition.
2. Select eight cases with the largest between-candidate score spread.
3. Select four additional cases with the highest overall score, then fewer hard
   fails and higher rank agreement.
4. For each selected case, use the highest-scoring candidate-round answer after
   first minimizing hard-fail reviews as a non-binding reference answer.

The fixture spans eight classical sources and an even six hard / six medium
difficulty split. Each case stores must-preserve semantics, direction-specific
expectations, forbidden claims, acceptable variants, and a consensus-selected
reference answer. Consumers should score semantic constraints; they must not use
exact string matching against the reference.

The twelve references all received `25/25` average scores and zero hard-fail reviews.
Ten came from Sol `max` and two from Sol `xhigh`. Model provenance is retained in the
aggregate result for auditability but omitted from the reusable fixture.

### Operational Golden Protocol

Every candidate must generate every golden case three independent times. Each run is
scored independently on the five semantic dimensions and checked for forbidden
claims; the candidate-level result is then aggregated across the three runs. Reference
answers are guidance rather than exact-match targets. This three-run requirement is
recorded in both the reusable fixture and the machine-readable result.

## Method

1. Sixteen prompts and their semantic constraints were locked before generation and
   verified against the local classical-text corpus.
2. Luna `max`, Terra `max`, Sol `xhigh`, Sol `max`, Kimi For Coding, and Kimi K3
   `max` each generated every case in two complete rounds.
3. Candidate identity was replaced by a deterministic rotating A–F label for every
   case and round. Blind packets were checked for model-name leakage.
4. Fresh isolated Luna `max`, Terra `max`, and Sol `xhigh` judges each scored all 192
   outputs. They could read only their assigned anonymous packet.
5. All twelve judge files passed JSON shape, score range, case coverage, candidate
   coverage, and ranking-consistency checks before unblinding.
6. Scores and the preregistered selection rule produced the aggregate result and the
   twelve-case reusable fixture.

Some locked passages are condensed excerpts from one source record: they omit
intervening sentences or normalize punctuation. Provenance validation therefore
checks exact `sourceId` and source equality plus normalized clause-level containment
in that corpus record. The fixture preserves the text actually used for generation.

## Provider Availability and Deviations

CC Switch contained OpenCode Go routes for GLM 5.2, Kimi K2.7 Code, DeepSeek V4
Flash, and Qwen 3.7 Max. They could not be ranked:

- GLM 5.2, Kimi K2.7 Code, and DeepSeek V4 Flash returned provider
  `401 CreditsError: insufficient balance`.
- Qwen 3.7 Max accepted a tiny connectivity probe but rejected the real generation
  request as an unsupported model.

These are provider-availability failures, not model-quality results.

The original design called for three balanced rounds and a heterogeneous K3 judge.
Kimi reached its five-hour usage limit after two complete rounds and three valid
third-round outputs. The incomplete Kimi third round and the complete Codex third
round were excluded from the primary comparison to preserve balance. The same quota
also prevented K3 judging, so the final judge panel contains three Codex settings.

## Limitations

- All judges are from the Codex family and may share stylistic preferences with the
  four Codex candidates despite label blinding.
- The Codex candidates are near the scoring ceiling, limiting fine discrimination.
- Two complete rounds measure sampling variation but provide less power than the
  planned three rounds.
- K3 `max` versus Kimi For Coding is not a same-model thinking A/B. For a controlled
  thinking comparison, see the
  [DeepSeek six-round probe](./deepseek-v4-flash-thinking-semantic-six-round-2026-08-30.md).
- This is an eval result. It does not change the production model configuration.

## Artifacts

- [Machine-readable aggregate result](./classical-annotation-cross-provider-golden-v1-2026-08-30-results.json)
- [Reusable twelve-case golden fixture](../../tests/fixtures/classical-annotation-golden-v1.json)
- [Three-run Codex golden validation](./classical-annotation-golden-v1-three-run-codex-validation-2026-08-30.md)
- [Earlier five-candidate formal eval](./classical-annotation-model-eval-v1-2026-08-30.md)
- [Sol max vs xhigh extension](./classical-annotation-sol-max-vs-xhigh-eval-extension-2026-08-30.md)
