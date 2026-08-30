# Sol `max` vs `xhigh` Eval Extension

Date: 2026-08-30  
Scope: semantic generation quality, not production selection  
Rounds: 3  
Cases per round: 10  
Paired generated outputs: 60  
Blind candidate reviews: 180  
Dimension scores: 900

This is a focused extension of the
[five-candidate formal eval](./classical-annotation-model-eval-v1-2026-08-30.md).
It compares only the reasoning settings of `gpt-5.6-sol`; it does not replace or
retroactively alter the original ranking.

## Primary Result

The primary metric is the aggregate five-dimension blind score. Each setting has a
maximum of 2,250 points: 3 rounds × 10 cases × 3 judges × 5 dimensions × 5 points.

| Setting | Total score | Average /25 | Score rate | First-place votes /90 | Average rank | Average characters |
| ------- | ----------: | ----------: | ---------: | --------------------: | -----------: | -----------------: |
| `xhigh` |   2213/2250 |      24.589 |     98.36% |                    46 |        1.489 |              171.0 |
| `max`   |   2200/2250 |      24.444 |     97.78% |                    44 |        1.511 |              162.6 |

`xhigh` leads by 13 points, or 0.144 points per 25-point review. The difference is
small and the paired result does not establish a winner. `max` is 4.9% shorter on
average.

## Paired Comparison

The primary paired analysis first aggregates the three judge scores for each case and
round, producing 30 paired observations. This avoids treating three ratings of the
same generated output as three independent model samples.

| Unit                     | `max` wins | `xhigh` wins | Ties | `max` non-tie win rate | Exact two-sided p | Wilson 95% CI |
| ------------------------ | ---------: | -----------: | ---: | ---------------------: | ----------------: | ------------: |
| Case-round (primary)     |         14 |           15 |    1 |                  48.3% |          `1.0000` |   31.4%–65.6% |
| Judge-case (descriptive) |         29 |           38 |   23 |                  43.3% |          `0.3284` |   32.1%–55.2% |

The 30 paired observations are nearly even. The confidence interval is wide and
crosses 50%, so this eval provides no evidence that `max` improves semantic quality
over `xhigh` for this task.

## Semantic Dimensions

| Setting         | Passage fidelity | Query relevance | Dual direction | Interpretive depth | Semantic precision |
| --------------- | ---------------: | --------------: | -------------: | -----------------: | -----------------: |
| `max`           |            4.944 |           4.989 |          4.989 |              4.700 |              4.822 |
| `xhigh`         |            4.911 |           5.000 |          5.000 |              4.811 |              4.867 |
| `max` − `xhigh` |           +0.033 |          -0.011 |         -0.011 |             -0.111 |             -0.044 |

`max` has a small passage-fidelity advantage. `xhigh` has the largest relative edge
in interpretive depth, with smaller advantages in precision, relevance, and keeping
the two directions distinct. All dimension averages remain high, so ceiling effects
make these differences difficult to separate reliably.

## Round Stability

| Setting | Round 1 | Round 2 | Round 3 | Range |
| ------- | ------: | ------: | ------: | ----: |
| `max`   |  24.333 |  24.333 |  24.667 | 0.333 |
| `xhigh` |  24.333 |  24.867 |  24.567 | 0.533 |

Round 1 is tied. `xhigh` leads round 2 by 0.533 points per review; `max` leads round 3
by 0.100. `max` is descriptively more stable, but three rounds are insufficient to
infer a general stability advantage.

## Judge Totals

Each judge could award a maximum of 750 points per setting.

| Judge       | `max` | `xhigh` | Difference (`max` − `xhigh`) |
| ----------- | ----: | ------: | ---------------------------: |
| Luna `max`  |   732 |     740 |                           -8 |
| Terra `max` |   737 |     736 |                           +1 |
| Sol `xhigh` |   731 |     737 |                           -6 |

Luna and Sol judges slightly prefer `xhigh`; Terra is effectively tied. Across the 30
case-round groups, all three judges prefer `max` in 7 groups and `xhigh` in 9 groups;
the remaining 14 groups split 2–1.

## Case Pattern

After aggregating all three rounds and all three judges by prompt, `max` has the higher
total on cases 3, 4, 7, 8, and 10; `xhigh` leads on cases 1, 5, 6, and 9; case 2 is
tied. `max` wins more prompt identities, but `xhigh` wins by larger margins on its
stronger cases, producing the 13-point aggregate lead. This is descriptive only
because the same ten prompts repeat in every round.

## Method

1. The same ten fixed prompts and five semantic dimensions from the formal eval were
   reused.
2. Three fresh isolated Sol `max` tasks generated 30 new outputs, one task per round.
3. The 30 existing Sol `xhigh` outputs from the formal eval were reused unchanged.
4. A/B labels alternated by round and case. The mapping was kept outside each blind
   packet.
5. Fresh isolated Luna `max`, Terra `max`, and Sol `xhigh` judges scored every round.
   Each judge could read only that round's anonymous packet.
6. All nine judge files passed JSON shape, score-range, case-coverage, candidate-label,
   and ranking-consistency validation before unblinding.

## Limitations

- `xhigh` outputs were reused from the formal eval while `max` outputs were newly
  generated. Prompt fixtures and task structure match, but generation time is not the
  same.
- The ten scenarios repeat across rounds, measuring sampling stability more than
  domain breadth.
- Judges are all from the Codex model family and may share preferences with both
  candidates.
- Scores are close to the maximum, creating a strong ceiling effect.
- Codex task execution exposes no comparable first-token latency, token-use, or API
  cost telemetry. This extension compares semantic output only.
- The exact p-value is exploratory: repeated prompt identities are not fully
  independent, and the sample is small.

## Interpretation

For this fixed task and judge panel, moving Sol from `xhigh` to `max` does not produce
a measurable semantic-quality gain. `xhigh` has a slight descriptive lead in total
score and interpretive depth; `max` is slightly shorter, a little stronger in passage
fidelity, and somewhat less variable across three rounds. The defensible conclusion
is equivalence within this eval's resolution, not superiority of either setting.

This is an eval result, not a production recommendation.

Artifact:

- [Machine-readable aggregate results](./classical-annotation-sol-max-vs-xhigh-eval-extension-2026-08-30-results.json)
