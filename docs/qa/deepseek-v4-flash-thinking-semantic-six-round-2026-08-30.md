# DeepSeek V4 Flash Thinking Semantic Six-round Probe

Date: 2026-08-30  
Model: `deepseek-v4-flash`  
Rounds: 6  
Cases per round: 10 paired prompts  
Real API calls: 120  
Output budget: `max_tokens=512`

No API key or private user content was recorded.

## Result

After adding three rounds with ten new passages and scenarios, the six-round result
still gives thinking disabled a small aggregate semantic lead, but the new rounds do
not reproduce the earlier directional advantage. The evidence does not support a
reliable semantic-quality winner.

| Metric                 | Thinking enabled | Thinking disabled | Disabled advantage |
| ---------------------- | ---------------: | ----------------: | -----------------: |
| Total score            |        1413/1500 |         1434/1500 |                +21 |
| Average per response   |        23.550/25 |         23.900/25 |             +0.350 |
| Pair wins              |               19 |                29 |                +10 |
| Pair ties              |               12 |                12 |                  — |
| Passage fidelity       |            4.583 |             4.633 |             +0.050 |
| Query relevance        |            5.000 |             4.983 |             -0.017 |
| Dual-direction quality |            4.950 |             5.000 |             +0.050 |
| Interpretive depth     |            4.383 |             4.633 |             +0.250 |
| Semantic precision     |            4.633 |             4.650 |             +0.017 |

Thinking disabled leads by 1.4 percentage points on the full semantic scale. Most of
that difference is interpretive depth; the other dimension differences are small.

## Added Rounds 4-6

The extension used ten new scenarios covering team learning, principle under
pressure, self-knowledge, project prioritization, planning under uncertainty,
low-cost competition, information boundaries, disagreement, trust repair, and path
change. Each case was freshly generated in all three rounds.

| Round | Enabled score | Disabled score | Enabled wins | Disabled wins | Ties |
| ----: | ------------: | -------------: | -----------: | ------------: | ---: |
|     4 |           242 |            234 |            6 |             3 |    1 |
|     5 |           242 |            234 |            4 |             5 |    1 |
|     6 |           246 |            248 |            1 |             3 |    6 |
| Total |           730 |            716 |           11 |            11 |    8 |

The added block favors thinking enabled by 14 score points, while pair wins are
exactly tied. This reverses the score direction of rounds 1-3 and shows substantial
generation-to-generation variance.

## All Six Rounds

| Round | Enabled score | Disabled score | Enabled wins | Disabled wins | Ties |
| ----: | ------------: | -------------: | -----------: | ------------: | ---: |
|     1 |           221 |            237 |            2 |             6 |    2 |
|     2 |           230 |            241 |            3 |             6 |    1 |
|     3 |           232 |            240 |            3 |             6 |    1 |
|     4 |           242 |            234 |            6 |             3 |    1 |
|     5 |           242 |            234 |            4 |             5 |    1 |
|     6 |           246 |            248 |            1 |             3 |    6 |
| Total |          1413 |           1434 |           19 |            29 |   12 |

Excluding ties, thinking disabled won 29 of 48 comparisons, a 60.4% win rate. An
exact two-sided binomial test gives `p=0.1934`; the Wilson 95% interval is
46.3%-73.0%. This is not statistically persuasive evidence of a semantic advantage.

## Streaming and Token Measurements

All 120 calls used `stream=true`, `stream_options.include_usage=true`,
`temperature=0.35`, and identical prompts within each pair. Every response produced
valid annotation JSON and ended with `finish_reason=stop`.

### Added rounds 4-6

| Metric               | Thinking enabled | Thinking disabled | Disabled minus enabled |
| -------------------- | ---------------: | ----------------: | ---------------------: |
| Valid JSON           |            30/30 |             30/30 |                      — |
| `finish_reason=stop` |            30/30 |             30/30 |                      — |
| First content p50    |            993ms |             365ms |                 -628ms |
| First content p95    |           1436ms |             715ms |                 -721ms |
| Total duration p50   |           2625ms |            2266ms |                 -359ms |
| Total duration p95   |           3395ms |            3074ms |                 -321ms |
| Completion tokens    |             5116 |              3805 |                  -1311 |
| Reasoning tokens     |             1540 |                 0 |                  -1540 |
| Total tokens         |            11695 |              8014 |                  -3681 |

In the added block, thinking disabled delivered first answer content 63.2% faster at
p50 and 50.2% faster at p95. Total completion time improved by 13.7% at p50 and 9.5%
at p95, while total token use fell by 31.5%.

### Six-round token totals

| Metric            | Thinking enabled | Thinking disabled | Reduction with disabled |
| ----------------- | ---------------: | ----------------: | ----------------------: |
| Completion tokens |            10147 |              7281 |                    2866 |
| Reasoning tokens  |             3418 |                 0 |                    3418 |
| Total tokens      |            23092 |             15486 |            7606 / 32.9% |

Latency percentiles are shown separately for rounds 1-3 in the earlier report and
rounds 4-6 above. They are not averaged because percentiles cannot be combined from
aggregate summaries without the original per-call samples.

## Evaluation Method

- Each prompt was sent once with `thinking.type=enabled` and once with
  `thinking.type=disabled` per round.
- Execution order alternated by round and case.
- Outputs were randomly labeled A/B, and the mapping was withheld until all scores
  were submitted.
- One blinded reviewer scored passage fidelity, query relevance, dual-direction
  quality, interpretive depth, and semantic precision from 1 to 5.

The single-reviewer design and subjective rubric remain the main limitations. The
high scores and many ties in round 6 also suggest a ceiling effect. A stronger quality
claim would need independent reviewers, stored per-call raw metrics, and a larger,
preregistered prompt set.

## Decision

For this short structured annotation task, thinking disabled remains the better
production default: semantic quality is effectively comparable in the expanded test,
while disabled mode is consistently faster and uses about one-third fewer tokens. Do
not treat the six-round quality result as proof that disabled mode writes better; the
defensible claim is non-inferior observed quality with a clear efficiency advantage.

Related reports:

- [Rounds 1-3 semantic probe](./deepseek-v4-flash-thinking-semantic-multiround-2026-08-30.md)
- [Initial production-contract probe](./deepseek-v4-flash-probe-2026-08-30.md)
- [Thinking performance A/B](./deepseek-v4-flash-thinking-ab-2026-08-30.md)
- [Initial blind quality A/B](./deepseek-v4-flash-thinking-quality-ab-2026-08-30.md)
