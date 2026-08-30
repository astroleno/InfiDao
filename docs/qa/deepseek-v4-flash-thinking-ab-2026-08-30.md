# DeepSeek V4 Flash Thinking A/B Probe

Date: 2026-08-30  
Model: `deepseek-v4-flash`  
Base URL: `https://api.deepseek.com`  
Cases: 10 paired prompts, 20 real API calls  
Output budget: `max_tokens=240`

No API key or response body is stored in this report.

## Method

Each prompt was sent once with `thinking.type=enabled` and once with
`thinking.type=disabled`. All other request fields were identical, including the
annotation prompt, temperature, model, and output-token limit. Pair order alternated
between cases to reduce systematic first-request and cache-order bias.

Both variants used streaming with `stream_options.include_usage=true`. DeepSeek
documents these controls and usage fields in its
[Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)
and [Thinking Mode guide](https://api-docs.deepseek.com/guides/thinking_mode/).

Recorded timings:

- Headers: HTTP response headers available.
- First event: first parsed SSE event.
- First token: first non-empty reasoning or answer token.
- First reasoning: first non-empty reasoning token.
- First content: first non-empty answer token.
- Total: stream completed, including the final usage chunk.
- Tokens/s: completion tokens divided by time from first token to stream completion.

JSON validity uses the same extraction tolerance as the application: direct JSON,
fenced JSON, or a JSON object embedded in surrounding text are accepted only when
both `sixToMe` and `meToSix` are non-empty strings.

## Summary

| Metric                   | Thinking enabled | Thinking disabled | Disabled minus enabled |
| ------------------------ | ---------------: | ----------------: | ---------------------: |
| HTTP 200                 |            10/10 |             10/10 |                      — |
| Parse-valid annotation   |             7/10 |             10/10 |                     +3 |
| `finish_reason=stop`     |             7/10 |             10/10 |                     +3 |
| Headers p50              |            107ms |              91ms |                  -16ms |
| Headers p95              |            742ms |             177ms |                 -565ms |
| First token p50          |            425ms |             446ms |                  +21ms |
| First token p95          |           1017ms |             771ms |                 -246ms |
| First content p50        |           1304ms |             446ms |                 -858ms |
| First content p95        |           3183ms |             771ms |                -2412ms |
| Total duration p50       |           2951ms |            2375ms |                 -576ms |
| Total duration p95       |           3194ms |            2662ms |                 -532ms |
| Output speed p50         |   80.37 tokens/s |    66.46 tokens/s |        -13.91 tokens/s |
| Output speed p95         |  106.33 tokens/s |    81.75 tokens/s |        -24.58 tokens/s |
| Prompt tokens            |             2182 |              1392 |                   -790 |
| Prompt cache-hit tokens  |             1280 |                 0 |                  -1280 |
| Prompt cache-miss tokens |              902 |              1392 |                   +490 |
| Completion tokens        |             1925 |              1256 |                   -669 |
| Reasoning tokens         |             1059 |                 0 |                  -1059 |
| Answer tokens            |              866 |              1256 |                   +390 |
| Total tokens             |             4107 |              2648 |                  -1459 |

Relative changes with thinking disabled:

- Parse-valid rate increased from 70% to 100%.
- First answer token improved by 65.8% at p50 and 75.8% at p95.
- Total duration improved by 19.5% at p50 and 16.7% at p95.
- Total token usage decreased by 35.5%.
- Completion token usage decreased by 34.8%, while answer tokens increased because no
  output budget was consumed by reasoning.

Prompt-token and cache-hit values are reported exactly as returned by DeepSeek. The
two modes showed different cache accounting despite alternating pair order, so cache
cost must not be inferred from latency alone.

## Per-request Metrics

| Case | Scenario   | Thinking | Headers ms | First event ms | First token ms | First reasoning ms | First content ms | Total ms | Prompt | Cache hit | Cache miss | Completion | Reasoning | Answer | Total tokens | Tokens/s | Content chars | Finish | JSON    |
| ---: | ---------- | -------- | ---------: | -------------: | -------------: | -----------------: | ---------------: | -------: | -----: | --------: | ---------: | ---------: | --------: | -----: | -----------: | -------: | ------------: | ------ | ------- |
|    1 | 困境与行动 | enabled  |        147 |            148 |            415 |                415 |              774 |     2118 |    225 |       128 |         97 |        130 |        25 |    105 |          355 |    76.37 |           173 | stop   | valid   |
|    1 | 困境与行动 | disabled |        114 |            118 |            288 |                  — |              288 |     2006 |    146 |         0 |        146 |        134 |         0 |    134 |          280 |    77.99 |           219 | stop   | valid   |
|    2 | 学习与复盘 | enabled  |         95 |             96 |            641 |                641 |              965 |     3090 |    216 |       128 |         88 |        168 |        19 |    149 |          384 |    68.60 |           214 | stop   | valid   |
|    2 | 学习与复盘 | disabled |        177 |            177 |            722 |                  — |              722 |     2625 |    137 |         0 |        137 |        125 |         0 |    125 |          262 |    65.68 |           165 | stop   | valid   |
|    3 | 远程目标   | enabled  |        107 |            108 |            694 |                694 |                — |     2951 |    213 |       128 |         85 |        240 |       240 |      0 |          453 |   106.33 |             0 | length | invalid |
|    3 | 远程目标   | disabled |         94 |            113 |            499 |                  — |              499 |     2375 |    134 |         0 |        134 |        128 |         0 |    128 |          262 |    68.23 |           216 | stop   | valid   |
|    4 | 自我精进   | enabled  |         82 |             82 |            425 |                425 |             1318 |     3099 |    214 |       128 |         86 |        213 |        98 |    115 |          427 |    79.64 |           167 | stop   | valid   |
|    4 | 自我精进   | disabled |         91 |             91 |            443 |                  — |              443 |     2463 |    135 |         0 |        135 |        143 |         0 |    143 |          278 |    70.80 |           198 | stop   | valid   |
|    5 | 决策边界   | enabled  |        192 |            195 |            703 |                703 |             2164 |     3129 |    217 |       128 |         89 |        240 |       158 |     82 |          457 |    98.93 |           130 | length | invalid |
|    5 | 决策边界   | disabled |         86 |             86 |            446 |                  — |              446 |     2662 |    138 |         0 |        138 |        137 |         0 |    137 |          275 |    61.84 |           211 | stop   | valid   |
|    6 | 系统学习   | enabled  |        742 |            742 |           1017 |               1017 |             1709 |     3000 |    226 |       128 |         98 |        183 |        87 |     96 |          409 |    92.28 |           155 | stop   | valid   |
|    6 | 系统学习   | disabled |         81 |             83 |            712 |                  — |              712 |     2216 |    147 |         0 |        147 |        100 |         0 |    100 |          247 |    66.46 |           157 | stop   | valid   |
|    7 | 关系边界   | enabled  |         79 |             82 |            362 |                362 |              847 |     2467 |    216 |       128 |         88 |        163 |        35 |    128 |          379 |    77.46 |           212 | stop   | valid   |
|    7 | 关系边界   | disabled |        100 |            109 |            228 |                  — |              228 |     2034 |    137 |         0 |        137 |        119 |         0 |    119 |          256 |    65.87 |           183 | stop   | valid   |
|    8 | 团队协作   | enabled  |         83 |             83 |            300 |                300 |              867 |     2092 |    219 |       128 |         91 |        144 |        50 |     94 |          363 |    80.37 |           156 | stop   | valid   |
|    8 | 团队协作   | disabled |         82 |             83 |            505 |                  — |              505 |     2419 |    140 |         0 |        140 |        133 |         0 |    133 |          273 |    69.48 |           213 | stop   | valid   |
|    9 | 认知自由   | enabled  |        191 |            191 |            679 |                679 |             3183 |     3194 |    221 |       128 |         93 |        240 |       235 |      5 |          461 |    95.40 |             9 | length | invalid |
|    9 | 认知自由   | disabled |         80 |             80 |            771 |                  — |              771 |     2423 |    142 |         0 |        142 |        135 |         0 |    135 |          277 |    81.75 |           204 | stop   | valid   |
|   10 | 风险判断   | enabled  |        122 |            122 |            337 |                337 |             1304 |     2330 |    215 |       128 |         87 |        204 |       112 |     92 |          419 |   102.40 |           145 | stop   | valid   |
|   10 | 风险判断   | disabled |        118 |            120 |            446 |                  — |              446 |     2043 |    136 |         0 |        136 |        102 |         0 |    102 |          238 |    63.87 |           150 | stop   | valid   |

## Conclusion

With the application's current short structured-output contract and
`max_tokens=240`, disabling thinking was superior on every release-critical measure:
parse reliability, answer-start latency, total latency, and token usage. Thinking
enabled produced three truncated responses: one with no answer content and two with
incomplete JSON.

This probe does not score semantic answer quality. It establishes the technical
reliability and efficiency trade-off only. A semantic quality decision would require
a blinded rubric review of stored, anonymized outputs.
