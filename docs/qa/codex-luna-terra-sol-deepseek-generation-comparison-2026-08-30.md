# Codex Luna / Terra / Sol vs DeepSeek Generation Comparison

> Pilot only. The formal multi-round eval superseding this sample is
> [Classical Annotation Model Eval V1](./classical-annotation-model-eval-v1-2026-08-30.md).

Date: 2026-08-30  
Task: short Chinese classical-text annotation  
Cases: 10  
Luna setting: `gpt-5.6-luna`, reasoning `max`  
Terra setting: `gpt-5.6-terra`, reasoning `max`  
Sol setting: `gpt-5.6-sol`, reasoning `xhigh`  
DeepSeek setting: `deepseek-v4-flash`, thinking disabled

This reasoning-controlled rerun supersedes the earlier exploratory run that did not
explicitly pin Codex reasoning effort. No API key or private user content was
recorded.

## Result

Three new isolated judges, using the same reasoning settings as their corresponding
generation models, independently ranked Sol first, Terra second, Luna third, and
DeepSeek fourth.

| Candidate | Blind score | Average /25 | First-place votes /30 | Average characters |
| --------- | ----------: | ----------: | --------------------: | -----------------: |
| Sol       |     739/750 |      24.633 |                    23 |              190.9 |
| Terra     |     725/750 |      24.167 |                     5 |              175.5 |
| Luna      |     700/750 |      23.333 |                     2 |              163.4 |
| DeepSeek  |     601/750 |      20.033 |                     0 |              171.1 |

The score maximum is 750 per candidate: 10 cases × 3 judges × 5 dimensions ×
5 points. First-place votes count each judge's top-ranked candidate in every case.

## Dimension Scores

| Candidate | Passage fidelity | Query relevance | Dual direction | Interpretive depth | Semantic precision |
| --------- | ---------------: | --------------: | -------------: | -----------------: | -----------------: |
| Sol       |            4.933 |           5.000 |          4.967 |              4.933 |              4.800 |
| Terra     |            4.833 |           5.000 |          4.967 |              4.467 |              4.900 |
| Luna      |            4.967 |           4.967 |          4.867 |              4.133 |              4.400 |
| DeepSeek  |            3.967 |           4.033 |          4.833 |              4.033 |              3.167 |

Sol's clearest advantage was interpretive depth while retaining near-perfect
relevance and dual-direction separation. Terra was the most semantically precise.
Luna remained highly faithful and relevant, but the panel found less depth and more
generic modernization than in Sol and Terra.

## Judge Agreement

| Anonymous judge | Sol | Terra | Luna | DeepSeek | Judge ranking                 |
| --------------- | --: | ----: | ---: | -------: | ----------------------------- |
| Luna `max`      | 246 |   241 |  238 |      213 | Sol > Terra > Luna > DeepSeek |
| Terra `max`     | 246 |   241 |  227 |      195 | Sol > Terra > Luna > DeepSeek |
| Sol `xhigh`     | 247 |   243 |  235 |      193 | Sol > Terra > Luna > DeepSeek |

All three judges produced the same overall ordering. This is stronger agreement than
the earlier unpinned run, where Luna and Terra were closer and changed order across
judges.

## Case-level Result

Each case has a maximum aggregate score of 75 per candidate.

| Case | Scenario             | Sol | Terra | Luna | DeepSeek | Aggregate winner |
| ---: | -------------------- | --: | ----: | ---: | -------: | ---------------- |
|    1 | Team learning        |  72 |    71 |   66 |       63 | Sol              |
|    2 | Principle pressure   |  75 |    72 |   69 |       59 | Sol              |
|    3 | Self-knowledge       |  75 |    72 |   68 |       59 | Sol              |
|    4 | Project priority     |  74 |    72 |   68 |       65 | Sol              |
|    5 | Uncertain planning   |  74 |    73 |   71 |       62 | Sol              |
|    6 | Low-cost competition |  70 |    75 |   73 |       59 | Terra            |
|    7 | Information boundary |  75 |    73 |   70 |       56 | Sol              |
|    8 | Productive dissent   |  75 |    73 |   70 |       63 | Sol              |
|    9 | Trust repair         |  75 |    72 |   72 |       60 | Sol              |
|   10 | Path transition      |  74 |    72 |   73 |       55 | Sol              |

Sol won nine cases outright. Terra won the low-cost competition case. Luna received
two individual first-place votes but did not lead a case after aggregating all three
judges.

## Observed Writing Differences

- Sol most consistently supplied explicit decision tests without flattening the
  source passage. It was especially strong on self-knowledge, trust repair, and path
  transition, where it distinguished conditions, boundaries, and failure modes.
- Terra paired precise operational details with disciplined reinterpretation. Its
  strongest result was low-cost competition, where it preserved the strategic
  hierarchy while translating it into product positioning, partnerships, and
  externality-aware choices.
- Luna was concise, faithful, and directly usable. Its weaker relative score came
  mainly from interpretive depth: several reverse interpretations were sound but more
  familiar, such as translating a passage into feedback, data, and iterative planning
  without developing the bridge as far as Sol or Terra.
- DeepSeek remained the most literary candidate and often created a clear two-way
  structure. It continued to lose points for unsupported claims about a classic's
  original meaning, overconfident causal language, and metaphors that displaced
  actionable criteria.

## DeepSeek Streaming Measurements

The unchanged DeepSeek baseline used 10 separate real API calls with `stream=true`,
`temperature=0.35`, `max_tokens=512`, and thinking disabled.

| Metric               | DeepSeek result |
| -------------------- | --------------: |
| Valid completed JSON |           10/10 |
| First content p50    |           337ms |
| First content p95    |           687ms |
| Total duration p50   |          2217ms |
| Total duration p95   |          2914ms |
| Completion tokens    |            1277 |
| Total tokens         |            2680 |

Codex task execution does not expose comparable API usage, first-token, or token-cost
metrics, so no latency or cost ranking is claimed for Luna, Terra, or Sol.

## Method

- Luna and Terra each generated all ten answers in a new isolated `max` task. Sol did
  the same in a new isolated `xhigh` task.
- DeepSeek reused the same ten-prompt, thinking-disabled baseline rather than making
  another paid call batch.
- Candidate names were replaced with rotating A/B/C/D labels before evaluation.
- New isolated Luna `max`, Terra `max`, and Sol `xhigh` judges read only the anonymous
  packet. They scored passage fidelity, query relevance, dual-direction quality,
  interpretive depth, and semantic precision from 1 to 5.
- Labels were unblinded only after all three score files were complete.

## Comparison With the Unpinned Exploratory Run

| Candidate | Earlier unpinned | Reasoning-controlled | Change |
| --------- | ---------------: | -------------------: | -----: |
| Sol       |          736/750 |              739/750 |     +3 |
| Terra     |          717/750 |              725/750 |     +8 |
| Luna      |          724/750 |              700/750 |    -24 |
| DeepSeek  |          599/750 |              601/750 |     +2 |

These deltas are not a causal measurement of reasoning effort. The Codex candidates
were regenerated and the three judges were also new, so generation variance and judge
calibration changed at the same time. The controlled run should be used as the current
comparison; the earlier run remains only a sensitivity check.

## Limitations

This is an exploratory writing comparison, not a provider benchmark. Codex generated
the ten cases in one task while DeepSeek handled separate API requests. The three
judges are from the same Codex family as three candidates, so shared stylistic
preferences may disadvantage DeepSeek even with anonymous labels. Ten prompts and one
generation per candidate do not measure run-to-run variance.

The DeepSeek `20.033/25` score here must not be directly compared with its earlier
`23.900/25` six-round score: the judge panel and candidate pool differ, producing a
different calibration.

`gpt-5.4-nano` was not included. It is not available as a Codex agent model in this
environment, and the primary provider slot has no configured model or API key. Its old
application telemetry smoke is not a comparable text-quality sample.

## Practical Decision

With the requested reasoning settings, Sol `xhigh` is the strongest editorial model
in this sample. Terra `max` is second and more semantically precise, while Luna `max`
is the most concise of the three but did not match their interpretive depth. For the
current production API, DeepSeek thinking-disabled remains fast and structurally
reliable, but classical fidelity would benefit from tighter prompt constraints or a
semantic review step.

Related reports:

- [DeepSeek six-round thinking comparison](./deepseek-v4-flash-thinking-semantic-six-round-2026-08-30.md)
- [Historical annotation telemetry](./reboot-mvp-release-readiness.md)
