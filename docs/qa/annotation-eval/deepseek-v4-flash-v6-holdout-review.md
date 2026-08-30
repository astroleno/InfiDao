# DeepSeek v4 Flash v6 Holdout Review

Date: 2026-08-31  
Decision: **do not promote to production**

## Evidence

The sealed holdout used 12 cases across 3 rounds. DeepSeek v6 and the three complete Codex reference sets produced 144 valid outputs. Luna max, Terra max, and Sol xhigh independently reviewed anonymized A–D packets, yielding 432 candidate reviews and 2,160 dimension scores.

| Candidate       | Average /25 | Fidelity | Precision | Hard-fail reviews |
| --------------- | ----------: | -------: | --------: | ----------------: |
| Codex Terra max |      24.222 |    5.000 |     4.981 |                 0 |
| Codex Sol xhigh |      24.222 |    5.000 |     4.981 |                 0 |
| DeepSeek v6     |      23.565 |    4.815 |     4.602 |                 2 |
| Codex Luna max  |      23.454 |    5.000 |     4.972 |                 0 |

DeepSeek is close to the three-generator consensus of 23.966, with a gap of 0.401. It is statistically tied with Luna on the 36 paired case-rounds (16 wins, 15 losses, 5 ties), but loses to Terra (7–25–4, exact two-sided p 0.002102) and Sol xhigh (8–23–5, p 0.010674).

## Blocking failures

Four promotion gates are not satisfied:

- average quality is 23.565, below 24.2;
- semantic precision is 4.602, below 4.7;
- two reviews contain hard failures;
- the old-golden regression check was not rerun and is therefore `unknown`, which fails closed.

Both hard-fail reviews occurred on `annotation-holdout-v2-l2`, whose source is “我心匪石，不可转也。我心匪席，不可卷也。” In rounds 2 and 3, v6 stated that stone itself cannot turn and a mat itself cannot roll. This reverses the grammar and the central metaphor: the speaker's heart is _not_ a stone or mat that another person may turn or roll. The repeated error shows that a generic anti-overclaim audit does not guarantee source-level grammatical fidelity.

The most frequent non-hard-fail weakness is incomplete treatment of institutional accountability, especially conflicts of interest, monitoring, quotas, and intergenerational effects. v6 remains strong on direct query relevance and interpretive depth, but its precision ceiling is below the selected Codex references.

## Technical result

DeepSeek returned valid JSON for all 36 outputs. First-content latency averaged 452.418 ms (p50 389.273 ms, p95 734.042 ms); total duration averaged 2,914.392 ms (p50 2,885.735 ms, p95 3,489.007 ms). Average usage was 530 prompt tokens, 190.333 completion tokens, and 720.333 total tokens.

Codex reference timing and coverage are recorded separately in `reference-generators-holdout-partial-summary.json`. Codex CLI does not expose stream TTFT or token usage, so the report records those fields as unavailable rather than estimating them. Sol max stopped at 30/36 and Kimi was not started; neither is used in the formal ranking.

## Project decision

`src/lib/annotation/llm.ts` remains unchanged because the frozen promotion contract prohibits production synchronization when any gate fails. The eval tooling now treats an unmeasured golden regression as `unknown` and blocks promotion, records Codex/Kimi reference generation behind an ignored raw-artifact boundary, and emits ranking, pairwise, gate, latency, and token tables in tracked reports.

The holdout has now been opened and reviewed. Any future v7 prompt should be developed on dev cases and evaluated against a newly sealed holdout rather than tuned to these answers.
