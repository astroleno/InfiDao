# annotation-holdout-v2

Promotion: **blocked**

- Target: v6
- Average: 23.565/25
- Generator consensus: 23.966/25
- Gap: 0.401

## Gates

- validJsonRate: 1 — pass
- average25: 23.565 — fail
- passageFidelity: 4.815 — pass
- semanticPrecision: 4.602 — fail
- hardFailReviews: 2 — fail
- gapToGeneratorConsensus: 0.401 — pass
- knownGoldenRegression: unknown — fail

## Ranking

| Candidate       | Average /25 | First-place votes | Average rank | Hard-fail reviews |
| --------------- | ----------: | ----------------: | -----------: | ----------------: |
| codex-terra-max |      24.222 |                37 |        2.111 |                 0 |
| codex-sol-xhigh |      24.222 |                23 |        2.343 |                 0 |
| v6              |      23.565 |                31 |        2.565 |                 2 |
| codex-luna-max  |      23.454 |                17 |        2.981 |                 0 |

## Pairwise

| Reference       | Target wins | Reference wins | Ties | Exact two-sided p |
| --------------- | ----------: | -------------: | ---: | ----------------: |
| codex-luna-max  |          16 |             15 |    5 |          1.000000 |
| codex-terra-max |           7 |             25 |    4 |          0.002102 |
| codex-sol-xhigh |           8 |             23 |    5 |          0.010674 |

## DeepSeek streaming metrics

Samples: 36

| Metric             |     Mean |      P50 |      P95 |      Min |      Max |
| ------------------ | -------: | -------: | -------: | -------: | -------: |
| First content      |  452.418 |  389.273 |  734.042 |  185.221 |  794.643 |
| Total duration     | 2914.392 | 2885.735 | 3489.007 | 2097.734 | 3897.391 |
| Prompt tokens      |  530.000 |  525.500 |  555.000 |  514.000 |  555.000 |
| Completion tokens  |  190.333 |  193.500 |  228.250 |  140.000 |  236.000 |
| Total tokens       |  720.333 |  724.000 |  758.750 |  662.000 |  779.000 |
| Visible characters |  271.472 |  274.500 |  338.750 |  189.000 |  346.000 |
