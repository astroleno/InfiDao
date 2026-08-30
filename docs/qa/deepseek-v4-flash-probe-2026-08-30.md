# DeepSeek V4 Flash Probe Report

Date: 2026-08-30  
Model: `deepseek-v4-flash`  
Base URL: `https://api.deepseek.com`  
Application mode: `fast`, secondary slot  
Application timeout: `10000ms`  
Request output budget: `max_tokens=240`

No API key or response body is stored in this report.

## Method

Two sequential ten-case batches were run with distinct Chinese annotation inputs:

1. Application probe: `POST /api/annotate`, followed by the internal annotation telemetry endpoint.
2. Provider probe: DeepSeek Chat Completions with streaming and
   `stream_options.include_usage=true`, using the same annotation prompt shape.

The provider probe records response headers, first SSE event, first reasoning token,
first answer token, total duration, token usage, cache usage, finish reason, throughput,
and final annotation JSON validity. DeepSeek documents the streaming usage chunk and
token fields in its [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/).

## Application Probe

All ten requests returned HTTP 200 and a schema-valid application response. Two of
those responses were deterministic fallback output rather than LLM output.

| Case | Scenario   | HTTP | Schema | Provider      | Fallback reason | Telemetry ms | App total ms |
| ---: | ---------- | ---: | ------ | ------------- | --------------- | -----------: | -----------: |
|    1 | 困境与行动 |  200 | valid  | deterministic | provider_error  |         3589 |         4579 |
|    2 | 学习与复盘 |  200 | valid  | deterministic | provider_error  |         2942 |         3166 |
|    3 | 远程目标   |  200 | valid  | llm           | —               |         2756 |         2985 |
|    4 | 自我精进   |  200 | valid  | llm           | —               |         3606 |         3831 |
|    5 | 决策边界   |  200 | valid  | llm           | —               |         2911 |         3201 |
|    6 | 系统学习   |  200 | valid  | llm           | —               |         2923 |         5150 |
|    7 | 关系边界   |  200 | valid  | llm           | —               |         3047 |         3294 |
|    8 | 团队协作   |  200 | valid  | llm           | —               |         2606 |         2874 |
|    9 | 认知自由   |  200 | valid  | llm           | —               |         3111 |         3408 |
|   10 | 风险判断   |  200 | valid  | llm           | —               |         3033 |         3259 |

Summary:

- HTTP 200: 10/10
- Application schema valid: 10/10
- Actual LLM output: 8/10
- Deterministic fallback: 2/10 (20%)
- Telemetry latency: p50 `2942ms`, p95 `3606ms`, p99 `3606ms`
- Application total duration: p50 `3259ms`, p95 `5150ms`
- Alert: `FALLBACK_RATE_HIGH`, threshold `0.15`, actual `0.20`

HTTP 200 and schema validity alone are therefore insufficient success criteria for
this endpoint; telemetry must also confirm `provider=llm` and `fallbackHit=false`.

## Direct Provider Streaming Probe

Definitions:

- Headers: time until HTTP response headers are available.
- First event: time until the first parsed SSE event.
- First token: time until the first non-empty reasoning or answer token.
- First content: time until the first non-empty answer token, excluding reasoning.
- Tokens/s: completion tokens divided by the interval from first token to stream end.
- Answer tokens: completion tokens minus reported reasoning tokens.

| Case | Scenario   | Headers ms | First event ms | First token ms | First content ms | Total ms | Prompt | Cache hit | Cache miss | Completion | Reasoning | Answer | Total tokens | Tokens/s | Finish | JSON    |
| ---: | ---------- | ---------: | -------------: | -------------: | ---------------: | -------: | -----: | --------: | ---------: | ---------: | --------: | -----: | -----------: | -------: | ------ | ------- |
|    1 | 困境与行动 |        337 |            337 |            775 |                — |     3200 |    225 |       128 |         97 |        240 |       240 |      0 |          465 |    98.98 | length | invalid |
|    2 | 学习与复盘 |        132 |            137 |            626 |              896 |     2564 |    216 |       128 |         88 |        138 |        19 |    119 |          354 |    71.19 | stop   | valid   |
|    3 | 远程目标   |         80 |             81 |            247 |             1027 |     2763 |    213 |       128 |         85 |        216 |        78 |    138 |          429 |    85.85 | stop   | valid   |
|    4 | 自我精进   |         88 |             89 |            702 |                — |     3643 |    214 |       128 |         86 |        240 |       240 |      0 |          454 |    81.63 | length | invalid |
|    5 | 决策边界   |         68 |             73 |            761 |             1493 |     3145 |    217 |       128 |         89 |        187 |        71 |    116 |          404 |    78.44 | stop   | valid   |
|    6 | 系统学习   |        115 |            115 |            280 |             1045 |     2620 |    226 |       128 |         98 |        232 |        91 |    141 |          458 |    99.15 | stop   | valid   |
|    7 | 关系边界   |         75 |             76 |            321 |                — |     2961 |    216 |       128 |         88 |        240 |       240 |      0 |          456 |    90.90 | length | invalid |
|    8 | 团队协作   |         82 |             82 |            305 |              997 |     2398 |    219 |       128 |         91 |        198 |        80 |    118 |          417 |    94.58 | stop   | valid   |
|    9 | 认知自由   |         78 |             83 |            206 |              942 |     3105 |    221 |       128 |         93 |        240 |        83 |    157 |          461 |    82.78 | length | invalid |
|   10 | 风险判断   |         66 |             66 |            435 |             1001 |     2381 |    215 |       128 |         87 |        147 |        61 |     86 |          362 |    75.54 | stop   | valid   |

Summary:

- HTTP 200: 10/10
- Valid final annotation JSON: 6/10
- Natural `finish_reason=stop`: 6/10
- Headers: p50 `80ms`, p95 `337ms`
- First token: p50 `321ms`, p95 `775ms`
- First answer token: p50 `1001ms`, p95 `1493ms` (successful answer starts only)
- Total duration: p50 `2763ms`, p95 `3643ms`
- Prompt tokens: `2182` (`1280` cache hit, `902` cache miss)
- Completion tokens: `2078` (`1203` reasoning, `875` answer)
- Total tokens: `4260`

## Finding

The current application request omits DeepSeek's thinking-mode switch and sets
`max_tokens=240`. DeepSeek V4 Flash enables thinking by default. The probe directly
confirmed that this output budget is sometimes exhausted by reasoning:

- Cases 1, 4, and 7 used all 240 completion tokens as reasoning, returned no answer
  content, and ended with `finish_reason=length`.
- Case 9 used all 240 completion tokens and returned truncated, invalid JSON.
- The application collapses these provider/parse failures into deterministic fallback,
  so the client still sees a successful HTTP 200 response.

This is a request-contract issue, not a network timeout issue. Raising only the
application timeout does not resolve it. The next implementation decision should be
either to disable thinking for this short structured annotation task or to increase
the output budget and explicitly enforce JSON output, then rerun the same probe gate.
