# Classical Annotation Model Eval V1

Date: 2026-08-30  
Scope: semantic generation quality, not production selection  
Rounds: 3  
Cases per round: 10  
Candidates: 5  
Generated outputs: 150  
Blind candidate reviews: 450  
Dimension scores: 2,250  
Real DeepSeek API calls: 60

This formal eval is independent of the earlier pilot comparisons. Pilot outputs and
scores are excluded from every result below. No API key or private user content was
recorded.

A focused follow-up comparing Sol `max` with Sol `xhigh` is available in the
[reasoning-setting extension](./classical-annotation-sol-max-vs-xhigh-eval-extension-2026-08-30.md).
It is reported separately and does not alter this eval's pre-existing five-candidate
ranking.

## Candidate Settings

| Candidate             | Model               | Reasoning setting |
| --------------------- | ------------------- | ----------------- |
| Luna                  | `gpt-5.6-luna`      | `max`             |
| Terra                 | `gpt-5.6-terra`     | `max`             |
| Sol                   | `gpt-5.6-sol`       | `xhigh`           |
| DeepSeek Thinking on  | `deepseek-v4-flash` | `enabled`         |
| DeepSeek Thinking off | `deepseek-v4-flash` | `disabled`        |

Luna, Terra, and Sol each used a fresh isolated task in every round. DeepSeek used a
fresh streaming API request for every case and mode; enabled/disabled request order
alternated by round and case.

## Primary Result

The primary metric is the aggregate five-dimension blind score. Each candidate has a
maximum of 2,250 points: 3 rounds × 10 cases × 3 judges × 5 dimensions × 5 points.

| Candidate             | Total score | Average /25 | Score rate | First-place votes /90 | Average rank | Average characters |
| --------------------- | ----------: | ----------: | ---------: | --------------------: | -----------: | -----------------: |
| Sol `xhigh`           |   2227/2250 |      24.744 |     98.98% |                    57 |        1.500 |              171.0 |
| Terra `max`           |   2169/2250 |      24.100 |     96.40% |                     7 |        2.500 |              151.5 |
| Luna `max`            |   2132/2250 |      23.689 |     94.76% |                    25 |        2.456 |              175.6 |
| DeepSeek Thinking on  |   1871/2250 |      20.789 |     83.16% |                     0 |        4.256 |              163.5 |
| DeepSeek Thinking off |   1871/2250 |      20.789 |     83.16% |                     1 |        4.289 |              166.6 |

Sol has the highest aggregate score, best average rank, and most first-place votes.
Terra has the second-highest score, but Luna has more first-place votes and a slightly
better average rank. This apparent conflict comes from Luna's higher variance: it was
excellent in round 1 and materially weaker in round 3.

## Semantic Dimensions

| Candidate             | Passage fidelity | Query relevance | Dual direction | Interpretive depth | Semantic precision |
| --------------------- | ---------------: | --------------: | -------------: | -----------------: | -----------------: |
| Sol `xhigh`           |            4.944 |           5.000 |          5.000 |              4.933 |              4.867 |
| Terra `max`           |            4.933 |           4.989 |          4.956 |              4.389 |              4.833 |
| Luna `max`            |            4.944 |           4.989 |          4.456 |              4.456 |              4.844 |
| DeepSeek Thinking on  |            4.367 |           4.144 |          4.767 |              3.967 |              3.544 |
| DeepSeek Thinking off |            4.156 |           4.233 |          4.689 |              4.133 |              3.578 |

Sol's largest differentiator is maintaining both genuinely different directions and
high interpretive depth. Terra's answers are the shortest on average and remain highly
precise. Luna's lower dual-direction score reflects samples where `meToSix` repeated
the practical advice instead of reinterpreting the classic from the modern problem.

DeepSeek Thinking on is somewhat stronger in passage fidelity and dual direction;
Thinking off is somewhat stronger in relevance, depth, and precision. The total score
is exactly tied.

## Round Stability

| Candidate             | Round 1 | Round 2 | Round 3 | Range |
| --------------------- | ------: | ------: | ------: | ----: |
| Sol `xhigh`           |  24.700 |  24.733 |  24.800 | 0.100 |
| Terra `max`           |  23.767 |  24.367 |  24.167 | 0.600 |
| Luna `max`            |  24.600 |  24.200 |  22.267 | 2.333 |
| DeepSeek Thinking on  |  19.400 |  21.500 |  21.467 | 2.100 |
| DeepSeek Thinking off |  20.500 |  20.633 |  21.233 | 0.733 |

Sol is the most stable candidate across the three runs. Terra and DeepSeek Thinking
off also remain within a narrow range. Luna and DeepSeek Thinking on show the largest
sampling variance.

## Pairwise Case-round Comparison

For this analysis, the three judge scores are first aggregated for each case and round,
producing 30 paired observations per model pair. This avoids treating three ratings of
the same generated output as three independent model samples.

| Pair                          | Left wins | Right wins | Ties | Exact two-sided p |
| ----------------------------- | --------: | ---------: | ---: | ----------------: |
| Sol vs Terra                  |        25 |          2 |    3 |       `0.0000056` |
| Sol vs Luna                   |        20 |          5 |    5 |          `0.0041` |
| Luna vs Terra                 |        16 |         12 |    2 |          `0.5716` |
| Sol vs DeepSeek Thinking on   |        30 |          0 |    0 |     `<0.00000001` |
| Sol vs DeepSeek Thinking off  |        30 |          0 |    0 |     `<0.00000001` |
| Terra vs DeepSeek Thinking on |        30 |          0 |    0 |     `<0.00000001` |
| Luna vs DeepSeek Thinking on  |        25 |          5 |    0 |          `0.0003` |
| Thinking on vs Thinking off   |        14 |         14 |    2 |          `1.0000` |

Within this eval, Sol's advantage over both Terra and Luna is consistent. Terra's
higher aggregate total does not establish that it is better than Luna: their paired
result is effectively unresolved. DeepSeek Thinking enabled and disabled are an exact
pairwise tie.

The p-values are exploratory. The ten prompts repeat across three rounds, so the 30
case-round observations are not fully independent, and no multiple-comparison
correction was applied.

## Judge Agreement

Across 30 round/case groups:

- all three judges selected the same first-place candidate in 13 groups;
- two of three agreed in 15 groups;
- all three selected different candidates in 2 groups.

Therefore 28/30 groups, or 93.3%, had a majority first-place choice. All judge models
gave Sol their highest three-round total:

| Judge       | Sol | Terra | Luna | Thinking on | Thinking off |
| ----------- | --: | ----: | ---: | ----------: | -----------: |
| Luna `max`  | 740 |   719 |  719 |         638 |          652 |
| Terra `max` | 741 |   730 |  715 |         629 |          612 |
| Sol `xhigh` | 746 |   720 |  698 |         604 |          607 |

## DeepSeek Streaming and Token Metrics

All 60 DeepSeek responses produced valid annotation JSON and ended with
`finish_reason=stop`.

| Metric                 | Thinking enabled | Thinking disabled | Disabled minus enabled |
| ---------------------- | ---------------: | ----------------: | ---------------------: |
| Valid JSON             |            30/30 |             30/30 |                      — |
| `finish_reason=stop`   |            30/30 |             30/30 |                      — |
| First stream token p50 |            479ms |             461ms |                  -18ms |
| First stream token p95 |            730ms |             745ms |                  +15ms |
| First visible text p50 |           1279ms |             461ms |                 -818ms |
| First visible text p95 |           3966ms |             745ms |                -3221ms |
| Total duration p50     |           3014ms |            2357ms |                 -657ms |
| Total duration p95     |           5334ms |            3200ms |                -2134ms |
| Prompt tokens          |             6579 |              4209 |                  -2370 |
| Completion tokens      |             6656 |              3711 |                  -2945 |
| Reasoning tokens       |             3052 |                 0 |                  -3052 |
| Total tokens           |            13235 |              7920 |                  -5315 |

Thinking disabled starts visible text 64.0% faster at p50 and 81.2% faster at p95.
Its total duration is 21.8% lower at p50 and 40.0% lower at p95, and it uses 40.2%
fewer total tokens. These are descriptive efficiency measurements; they are not used
to choose the semantic-quality winner.

## Qualitative Error Pattern

- Sol repeatedly preserved the passage's semantic structure while adding bounded,
  testable modern criteria. It avoided making fluency depend on unsupported historical
  claims.
- Terra was concise and stable. Its main relative weakness was slightly less
  interpretive depth than Sol, not correctness or relevance.
- Luna could match Sol in strong rounds, but some samples collapsed the reverse
  direction into a paraphrase of the forward direction. This produced the largest
  Codex run-to-run variance.
- Both DeepSeek modes were usually fluent and successfully separated the two fields.
  Their recurring weaknesses were overconfident claims about a classic's original
  meaning, universal causal language, and metaphors that replaced decision criteria.
- DeepSeek Thinking did not consistently repair those semantic errors. It shifted the
  dimension profile but produced no aggregate or pairwise quality gain.

## Method

1. The protocol fixed three rounds, ten prompts, candidate settings, dimensions, and
   the primary aggregate metric before formal generation began.
2. Earlier pilot generations and scores were excluded.
3. Each Codex candidate used a new isolated task per round and could read only the
   fixed prompt fixture.
4. DeepSeek used one independent streaming request per case, round, and thinking mode,
   with `temperature=0.35` and `max_tokens=512`.
5. Each round used a different rotating A/B/C/D/E mapping.
6. New isolated Luna `max`, Terra `max`, and Sol `xhigh` judges could read only that
   round's anonymous packet.
7. Labels were unblinded only after all nine judge files had passed structure and
   ranking-consistency checks.

## Limitations

- The same ten scenarios repeat across rounds. This measures sampling stability better
  than domain breadth.
- The judges are from the same Codex family as three candidates. Shared preferences may
  favor Codex-style precision and structure even with anonymous labels.
- Codex generated ten answers inside one task per round, while DeepSeek received ten
  independent API requests. Context shape is not identical.
- Codex scores show a ceiling effect, especially for Sol, limiting discrimination among
  already-strong answers.
- Codex task execution does not expose comparable first-token, token-use, or API cost
  metrics. The DeepSeek technical table is not a cross-provider speed comparison.
- `gpt-5.4-nano` is excluded because it is unavailable as a Codex agent model and no
  compatible primary provider is configured.

## Eval Interpretation

For this fixed semantic task and this judge panel:

1. Sol `xhigh` is the strongest and most stable quality candidate.
2. Terra `max` and Luna `max` form the second tier; their head-to-head result is not
   resolved, although Terra is more stable and has the higher aggregate score.
3. DeepSeek Thinking enabled and disabled have indistinguishable semantic quality.
4. The eval does not support a claim that Thinking improves DeepSeek output quality.

These statements describe the eval only. They are not a production deployment,
latency, availability, or cost recommendation.

Artifacts:

- [Machine-readable aggregate results](./classical-annotation-model-eval-v1-2026-08-30-results.json)
- [Pilot comparison](./codex-luna-terra-sol-deepseek-generation-comparison-2026-08-30.md)
- [DeepSeek six-round Thinking probe](./deepseek-v4-flash-thinking-semantic-six-round-2026-08-30.md)
