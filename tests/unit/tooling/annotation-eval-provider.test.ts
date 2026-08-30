import { TextEncoder } from "node:util";
import { generateAnnotation } from "../../../scripts/annotation-eval/provider";
import { getPromptVariant } from "../../../scripts/annotation-eval/prompt-registry";
import type { EvalCase } from "../../../scripts/annotation-eval/contract";

const testCase: EvalCase = {
  id: "dev-1",
  category: "uncertainty",
  scenario: "证据不足",
  query: "信息不足时怎样表达判断？",
  source: "论语",
  passage: "知之为知之，不知为不知，是知也。",
  style: "直接、清楚、可落地。",
  evaluationConstraints: {
    mustPreserve: ["承认未知"],
    sixToMe: ["区分事实与推测"],
    meToSix: ["增加证据更新机制"],
    forbiddenClaims: ["不确定时一律不行动"],
    acceptableVariants: ["标注置信度"],
  },
};

function streamingResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { value: encoder.encode(chunks[index++]), done: false }
            : { value: undefined, done: true },
      }),
    },
    text: async () => chunks.join(""),
  } as unknown as Response;
}

const successChunks = [
  'data: {"choices":[{"delta":{"content":"{\\"sixToMe\\":\\"前向\\","}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"\\"meToSix\\":\\"反向\\"}"},"finish_reason":"stop"}]}\n\n',
  'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150,"completion_tokens_details":{"reasoning_tokens":0}}}\n\n',
  "data: [DONE]\n\n",
];

describe("annotation eval provider", () => {
  it("parses streaming JSON and records fixed request parameters", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return streamingResponse(successChunks);
    });
    let clock = 0;

    const result = await generateAnnotation(
      {
        partition: "dev",
        round: 1,
        testCase,
        prompt: getPromptVariant("v4"),
        config: {
          baseUrl: "https://provider.invalid/v1",
          apiKey: "secret-test-key",
          model: "deepseek-v4-flash",
        },
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => (clock += 10) },
    );

    expect(result.output).toEqual({ sixToMe: "前向", meToSix: "反向" });
    expect(result.metrics.firstContentMs).not.toBeNull();
    expect(result.metrics.reasoningTokens).toBe(0);
    expect(result.metrics.totalTokens).toBe(150);
    expect(requestBody).toMatchObject({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.35,
      max_tokens: 240,
    });
  });

  it("retries retryable provider failures at most three attempts", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(streamingResponse(["temporary"], 503))
      .mockResolvedValueOnce(streamingResponse(["temporary"], 503))
      .mockResolvedValueOnce(streamingResponse(successChunks));

    const result = await generateAnnotation(
      {
        partition: "dev",
        round: 1,
        testCase,
        prompt: getPromptVariant("v4"),
        config: {
          baseUrl: "https://provider.invalid/v1",
          apiKey: "secret-test-key",
          model: "deepseek-v4-flash",
        },
      },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: () => 10,
        sleep: async () => undefined,
      },
    );

    expect(result.attempt).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("redacts the API key from terminal provider errors", async () => {
    const fetchImpl = jest.fn(async () =>
      streamingResponse(["authorization failed for secret-test-key"], 400),
    );

    await expect(
      generateAnnotation(
        {
          partition: "dev",
          round: 1,
          testCase,
          prompt: getPromptVariant("v4"),
          config: {
            baseUrl: "https://provider.invalid/v1",
            apiKey: "secret-test-key",
            model: "deepseek-v4-flash",
          },
        },
        { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => 10 },
      ),
    ).rejects.toThrow("[REDACTED]");
    await expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
