# DeepSeek V4 Flash Thinking Quality A/B

Date: 2026-08-30  
Model: `deepseek-v4-flash`  
Cases: 10 paired synthetic annotation prompts, 20 real streaming API calls  
Output budget: `max_tokens=512`

No API key, private user content, or full model output is stored in this report.

## Method

The earlier production-contract probe used `max_tokens=240` and established the reliability and performance difference. That limit truncated some thinking-enabled responses, so it could not fairly isolate completed-text quality.

For this quality probe:

- Each prompt was sent once with `thinking.type=enabled` and once with `thinking.type=disabled`.
- Both variants used `stream=true`, `stream_options.include_usage=true`, and `max_tokens=512`.
- Request order alternated across cases.
- The two outputs were randomly labeled A/B. The mode mapping remained in process memory until all scores were submitted.
- One reviewer scored the blinded outputs on six dimensions, 1–5 each.

Scoring dimensions:

1. Query relevance
2. Fidelity to the cited passage
3. Distinction and quality of the two directions (`sixToMe` and `meToSix`)
4. Specificity and actionability
5. Style adherence and fluency
6. Concision and absence of overclaiming

This is a single-reviewer qualitative comparison, not an inter-rater study.

## Quality Result

| Metric                 | Thinking enabled | Thinking disabled |
| ---------------------- | ---------------: | ----------------: |
| Total score            |          284/300 |           284/300 |
| Average per case       |          28.4/30 |           28.4/30 |
| Pair wins              |                5 |                 4 |
| Pair ties              |                1 |                 1 |
| Relevance              |              5.0 |               5.0 |
| Passage fidelity       |              4.6 |               4.6 |
| Dual-direction quality |              4.7 |               5.0 |
| Specificity            |              4.2 |               4.5 |
| Style and fluency      |              5.0 |               4.9 |
| Concision              |              4.9 |               4.4 |

The aggregate quality score is an exact tie. Thinking disabled was slightly stronger on dual-direction separation and specificity. Thinking enabled was more concise and slightly stronger on style. With ten cases and one reviewer, neither difference is large enough to establish a general semantic-quality advantage.

## Per-case Scores

| Case | Scenario   | Enabled | Disabled | Result   |
| ---: | ---------- | ------: | -------: | -------- |
|    1 | 困境与行动 |      28 |       28 | tie      |
|    2 | 学习与复盘 |      28 |       27 | enabled  |
|    3 | 远程目标   |      28 |       29 | disabled |
|    4 | 自我精进   |      27 |       28 | disabled |
|    5 | 决策边界   |      30 |       29 | enabled  |
|    6 | 系统学习   |      29 |       28 | enabled  |
|    7 | 关系边界   |      30 |       29 | enabled  |
|    8 | 团队协作   |      27 |       28 | disabled |
|    9 | 认知自由   |      30 |       28 | enabled  |
|   10 | 风险判断   |      27 |       30 | disabled |

## Streaming Metrics for the Quality Run

Both modes completed all ten responses with valid annotation JSON at the larger output budget.

| Metric               | Thinking enabled | Thinking disabled |
| -------------------- | ---------------: | ----------------: |
| Valid completed JSON |            10/10 |             10/10 |
| First content p50    |            865ms |             484ms |
| First content p95    |           2474ms |             900ms |
| Total duration p50   |           2264ms |            2185ms |
| Total duration p95   |           3651ms |            2756ms |
| Prompt tokens        |             2182 |              1392 |
| Completion tokens    |             1699 |              1272 |
| Reasoning tokens     |              604 |                 0 |
| Total tokens         |             3881 |              2664 |

At `max_tokens=512`, thinking disabled retained equivalent blinded quality while using 31.4% fewer total tokens. Its first completed-text token was 44.0% faster at p50 and 63.6% faster at p95. Total-duration differences were smaller than in the 240-token production-contract run because neither mode was truncated.

## Decision Implication

At a sufficient output budget, this sample found no aggregate text-quality gain from thinking. At the current 240-token application budget, thinking materially reduces reliability; at 512 tokens, it still increases token usage and answer-start latency. For this short structured annotation task, the available evidence favors disabling thinking unless a larger, multi-reviewer quality study demonstrates a material semantic benefit.
