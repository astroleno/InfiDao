# Classical Annotation Golden V1 Three-run Codex Validation

Date: 2026-08-30  
Golden cases: 12  
Independent generations per candidate: 3  
Codex candidates: 4  
Generated Codex outputs: 144  
Blind candidate reviews: 432  
Dimension scores: 2,160

## Status

The required three-run protocol is now recorded in the reusable golden fixture. All
four Codex candidates have completed three independent generations for every golden
case, and every output has been scored by three anonymous judges.

Kimi is not complete: the provider's five-hour usage window had not reset when the
third run was resumed. Kimi For Coding has 1/12 valid third-run outputs and K3 has
0/12. These partial rows are excluded from the result below.

## Codex Three-run Result

Each candidate could receive at most 2,700 points: 12 cases × 3 generations × 3
judges × 5 dimensions × 5 points.

| Candidate   |     Total | Average /25 | Score rate | Hard-fail reviews | Average characters |
| ----------- | --------: | ----------: | ---------: | ----------------: | -----------------: |
| Sol `max`   | 2692/2700 |      24.926 |      99.7% |                 0 |              203.1 |
| Sol `xhigh` | 2683/2700 |      24.843 |      99.4% |                 0 |              204.3 |
| Luna `max`  | 2652/2700 |      24.556 |      98.2% |                 0 |              181.5 |
| Terra `max` | 2632/2700 |      24.370 |      97.5% |                 0 |              187.3 |

Sol `max` leads Sol `xhigh` by nine points. Across 36 case-run pairs, `max` wins 8,
`xhigh` wins 4, and 24 tie; the exact two-sided result is `p=0.387695`. This remains
an effective tie rather than evidence of a reliable winner.

## Stability Across Three Runs

`Average case range` is the mean, across twelve cases, of each candidate's maximum
minus minimum round-average score. Lower is more stable.

| Candidate   | Round 1 | Round 2 | Round 3 | Average case range | Worst case-round average |
| ----------- | ------: | ------: | ------: | -----------------: | -----------------------: |
| Sol `max`   |  24.972 |  24.861 |  24.944 |              0.222 |                   23.667 |
| Sol `xhigh` |  24.944 |  24.944 |  24.639 |              0.444 |                   23.333 |
| Luna `max`  |  24.528 |  24.444 |  24.694 |              0.722 |                   23.333 |
| Terra `max` |  24.861 |  24.444 |  23.806 |              1.333 |                   23.000 |

Sol `max` is the most stable candidate in this three-run sample. Terra's third-round
drop is the clearest example of why a single generation is not enough for this eval;
its responses remain usable, but their interpretive-depth score varies more.

## Semantic Dimensions

| Candidate   | Passage fidelity | Query relevance | Dual direction | Interpretive depth | Semantic precision |
| ----------- | ---------------: | --------------: | -------------: | -----------------: | -----------------: |
| Sol `max`   |            4.981 |           4.981 |          5.000 |              5.000 |              4.963 |
| Sol `xhigh` |            4.991 |           5.000 |          5.000 |              4.926 |              4.926 |
| Luna `max`  |            4.963 |           5.000 |          4.972 |              4.722 |              4.898 |
| Terra `max` |            4.944 |           5.000 |          4.954 |              4.565 |              4.907 |

All 432 Codex candidate reviews have zero hard-fail flags. The result still has a
strong ceiling effect, so small score differences should not be treated as production
model-selection evidence.

## Method

1. Reused the already completed first and second generations for the twelve promoted
   golden cases.
2. Reused the existing third-generation outputs from fresh isolated Luna `max`, Terra
   `max`, Sol `xhigh`, and Sol `max` tasks.
3. Created a new anonymous A–D packet for the 48 third-run outputs and checked it for
   model-identity leakage.
4. Fresh isolated Luna `max`, Terra `max`, and Sol `xhigh` judges scored the third run.
5. Combined those scores with the corresponding first- and second-run reviews, then
   validated counts, score ranges, ranking order, and mapping coverage before
   unblinding.

## Limitations

- The cases were promoted using rounds 1–2. Round 3 is a generation-stability check,
  not a new unseen-case holdout.
- Round 3 contained four candidates while the earlier rounds contained six. The
  five-dimension score is comparable; anonymous rank positions are not used as the
  primary metric here.
- All judges are from the Codex family, and the scores are near the rubric ceiling.
- Kimi cannot be called three-run complete until the provider window resets and the
  remaining 23 third-run outputs receive equivalent blind review.

## Artifacts

- [Machine-readable three-run Codex result](./classical-annotation-golden-v1-three-run-codex-validation-2026-08-30-results.json)
- [Reusable golden fixture](../../tests/fixtures/classical-annotation-golden-v1.json)
- [Golden construction eval](./classical-annotation-cross-provider-golden-v1-2026-08-30.md)
