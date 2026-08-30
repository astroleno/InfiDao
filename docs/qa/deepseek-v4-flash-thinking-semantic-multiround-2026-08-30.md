# DeepSeek V4 Flash Thinking Semantic Multi-round Probe

Date: 2026-08-30  
Model: `deepseek-v4-flash`  
Rounds: 3  
Cases per round: 10 paired prompts  
Real API calls: 60  
Output budget: `max_tokens=512`

No API key or private user content was recorded.

## Purpose

The first ten-pair blind review found equal overall writing-quality scores. This
follow-up isolates semantic quality and repeats the same ten scenarios across three
new generations to measure run-to-run stability.

## Method

- Each prompt was sent once with `thinking.type=enabled` and once with
  `thinking.type=disabled` in each round.
- Both modes used `stream=true`, `stream_options.include_usage=true`,
  `temperature=0.35`, and `max_tokens=512`.
- Pair execution order alternated by round and case.
- Outputs were randomly labeled A/B. The mapping remained in process memory until
  all scores were submitted.
- A single blinded reviewer scored five semantic dimensions from 1 to 5.

Semantic dimensions:

1. Passage fidelity: whether the interpretation remains faithful to the cited text
   and avoids unsupported historical or philosophical claims.
2. Query relevance: whether the response directly answers the contemporary question.
3. Dual direction: whether `sixToMe` and `meToSix` perform genuinely different
   interpretive directions.
4. Interpretive depth: whether the response develops a meaningful bridge rather than
   merely paraphrasing the prompt.
5. Semantic precision: whether claims are specific, bounded, and free of overreach.

The maximum score is 25 per pair member and 750 per mode across 30 pairs.

## Aggregate Semantic Result

| Metric                 | Thinking enabled | Thinking disabled | Disabled advantage |
| ---------------------- | ---------------: | ----------------: | -----------------: |
| Total score            |          683/750 |           718/750 |                +35 |
| Average per response   |        22.767/25 |         23.933/25 |             +1.166 |
| Pair wins              |                8 |                18 |                +10 |
| Pair ties              |                4 |                 4 |                  — |
| Passage fidelity       |            4.300 |             4.633 |             +0.333 |
| Query relevance        |            5.000 |             5.000 |                  0 |
| Dual-direction quality |            4.900 |             5.000 |             +0.100 |
| Interpretive depth     |            4.167 |             4.567 |             +0.400 |
| Semantic precision     |            4.400 |             4.733 |             +0.333 |

Thinking disabled scored 4.7% higher on the full 25-point semantic scale. The largest
differences were interpretive depth, passage fidelity, and semantic precision. Both
modes remained fully relevant to the questions.

## Cross-round Stability

| Round | Enabled score | Disabled score | Enabled wins | Disabled wins | Ties |
| ----: | ------------: | -------------: | -----------: | ------------: | ---: |
|     1 |           221 |            237 |            2 |             6 |    2 |
|     2 |           230 |            241 |            3 |             6 |    1 |
|     3 |           232 |            240 |            3 |             6 |    1 |

Thinking disabled won six pairs in every round. Its total-score advantage narrowed
from 16 points to 11 and then 8, but the direction did not reverse.

## Pairwise Uncertainty

Excluding four ties, thinking disabled won 18 of 26 comparisons, a 69.2% win rate.
An exact two-sided binomial test gives `p=0.0755`; the Wilson 95% interval for the win
rate is 50.0%-83.5%.

This is consistent directional evidence, but it does not cross the conventional
`p<0.05` threshold. The result should be treated as exploratory because the sample is
small, the scenarios repeat across rounds, and there is only one reviewer.

## Streaming and Token Result

All 60 responses completed with valid annotation JSON.

| Metric               | Thinking enabled | Thinking disabled | Disabled minus enabled |
| -------------------- | ---------------: | ----------------: | ---------------------: |
| Valid JSON           |            30/30 |             30/30 |                      — |
| `finish_reason=stop` |            30/30 |             30/30 |                      — |
| First content p50    |            958ms |             469ms |                 -489ms |
| First content p95    |           2328ms |             699ms |                -1629ms |
| Total duration p50   |           2282ms |            2028ms |                 -254ms |
| Total duration p95   |           3705ms |            2725ms |                 -980ms |
| Completion tokens    |             5031 |              3476 |                  -1555 |
| Reasoning tokens     |             1878 |                 0 |                  -1878 |
| Total tokens         |            11397 |              7472 |                  -3925 |

Thinking disabled used 34.4% fewer total tokens. It delivered first answer content
51.0% faster at p50 and 70.0% faster at p95. Total completion time improved by 11.1%
at p50 and 26.5% at p95.

## Observed Semantic Patterns

Thinking-enabled outputs were sometimes stronger when the reasoning found a concise,
critical reinterpretation. However, they more often introduced an unsupported bridge
claim while moving from the classic to the modern problem. Repeated examples included
treating suffering as evidence of future selection, reducing `得道` to a management
mechanism, or asserting historical contrasts more strongly than the passage supports.

Thinking-disabled outputs more often stayed close to the passage while still making
the two directions distinct. Their strongest advantage was not greater verbosity; it
was fewer speculative intermediate claims. Their weaker samples could be terse or
generic, but they less often distorted the classical premise.

Representative balanced cases:

- Round 3, 困境与行动: the thinking-enabled output framed suffering as an admission
  ticket proving future selection. The disabled output explicitly distinguished
  systemic, open-ended hardship from the passage's `天降大任` premise and proposed a
  bounded modern reinterpretation.
- Round 2, 系统学习: the disabled output preserved all five stages and converted them
  into a modern loop. The enabled output was fluent but omitted part of the semantic
  structure.
- Round 2, 认知自由: the enabled output won by critically distinguishing genuine
  detachment from using the passage as emotional avoidance. This shows that thinking
  can occasionally add worthwhile interpretive depth even though it did not win in
  aggregate.

## Combined Interpretation

The previous ten-pair general-quality review was an exact tie. This new 30-pair,
semantic-only review favored thinking disabled in all three rounds. Taken together,
the evidence does not show a semantic-quality benefit from enabling thinking for this
short annotation task. It instead suggests that disabling thinking is at least
non-inferior and may improve semantic precision.

Combined with the production-contract probe at `max_tokens=240`, where thinking
caused truncation, the current product evidence favors disabling thinking. A stronger
claim would require more unique source passages, multiple independent reviewers, and
a preregistered rubric.

Related reports:

- [Initial production-contract probe](./deepseek-v4-flash-probe-2026-08-30.md)
- [Thinking performance A/B](./deepseek-v4-flash-thinking-ab-2026-08-30.md)
- [Initial blind quality A/B](./deepseek-v4-flash-thinking-quality-ab-2026-08-30.md)
