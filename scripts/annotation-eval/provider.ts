import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { TextDecoder } from "node:util";
import {
  AnnotationOutputSchema,
  GenerationSchema,
  type AnnotationOutput,
  type EvalCase,
  type Generation,
  type GenerationMetrics,
  type PromptVariant,
} from "./contract";

export interface AnnotationProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface GenerateAnnotationInput {
  partition: "dev" | "holdout" | "golden";
  round: number;
  testCase: EvalCase;
  prompt: PromptVariant;
  config: AnnotationProviderConfig;
}

export interface ProviderDependencies {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface GenerationAttemptResult {
  output: AnnotationOutput;
  metrics: GenerationMetrics;
}

interface UsageRecord {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  prompt_cache_hit_tokens?: unknown;
  cost?: unknown;
  completion_tokens_details?: { reasoning_tokens?: unknown };
}

class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

function redact(value: string, apiKey: string): string {
  return apiKey ? value.replaceAll(apiKey, "[REDACTED]") : value;
}

function resolveEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/$/u, "");
  return /\/chat\/completions$/u.test(normalized)
    ? normalized
    : `${normalized}/chat/completions`;
}

function requestTimeoutSignal(milliseconds: number): AbortSignal {
  const timeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (delay: number) => AbortSignal;
  }).timeout;
  if (typeof timeout === "function") return timeout(milliseconds);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  timer.unref?.();
  return controller.signal;
}

function buildUserPrompt(prompt: PromptVariant, testCase: EvalCase): string {
  return [
    ...prompt.instructions,
    `风格:${testCase.style}`,
    `问:${testCase.query}`,
    `经:${testCase.source}`,
    `文:${testCase.passage}`,
  ].join("\n");
}

function parseOutput(raw: string): AnnotationOutput {
  const direct = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(direct) as unknown;
  } catch {
    const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1]?.trim();
    const candidate = fenced || direct;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("response contains no JSON object");
    parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
  }
  return AnnotationOutputSchema.parse(parsed);
}

async function generateOnce(
  input: GenerateAnnotationInput,
  dependencies: Required<Pick<ProviderDependencies, "fetchImpl" | "now">>,
): Promise<GenerationAttemptResult> {
  const started = dependencies.now();
  const response = await dependencies.fetchImpl(resolveEndpoint(input.config.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.config.model,
      temperature: 0.35,
      max_tokens: 240,
      thinking: { type: "disabled" },
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: input.prompt.system },
        { role: "user", content: buildUserPrompt(input.prompt, input.testCase) },
      ],
    }),
    signal: requestTimeoutSignal(60_000),
  });
  const headersMs = Math.max(0, dependencies.now() - started);
  if (!response.ok || !response.body) {
    const rawError = await response.text();
    const message = redact(`HTTP ${response.status}: ${rawError.slice(0, 600)}`, input.config.apiKey);
    throw new ProviderHttpError(
      message,
      response.status === 408 || response.status === 429 || response.status >= 500,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let firstEventMs: number | null = null;
  let firstReasoningMs: number | null = null;
  let firstContentMs: number | null = null;
  let reasoningCharacters = 0;
  let usage: UsageRecord | null = null;
  let finishReason: string | null = null;

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const chunk = JSON.parse(data) as {
      choices?: Array<{
        delta?: { reasoning_content?: string; content?: string };
        finish_reason?: string | null;
      }>;
      usage?: UsageRecord;
    };
    firstEventMs ??= Math.max(0, dependencies.now() - started);
    usage = chunk.usage ?? usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    finishReason = choice.finish_reason ?? finishReason;
    const reasoning = choice.delta?.reasoning_content ?? "";
    const delta = choice.delta?.content ?? "";
    if (reasoning) {
      firstReasoningMs ??= Math.max(0, dependencies.now() - started);
      reasoningCharacters += reasoning.length;
    }
    if (delta) {
      firstContentMs ??= Math.max(0, dependencies.now() - started);
      content += delta;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    lines.forEach(handleLine);
  }
  buffer += decoder.decode();
  if (buffer) buffer.split(/\r?\n/u).forEach(handleLine);

  const finalUsage = usage as UsageRecord | null;
  const completionDetails = finalUsage?.completion_tokens_details;
  const numberOrNull = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const output = parseOutput(content);
  return {
    output,
    metrics: {
      headersMs,
      firstEventMs,
      firstReasoningMs,
      firstContentMs,
      totalMs: Math.max(0, dependencies.now() - started),
      finishReason,
      reasoningCharacters,
      promptTokens: numberOrNull(finalUsage?.prompt_tokens),
      completionTokens: numberOrNull(finalUsage?.completion_tokens),
      reasoningTokens: numberOrNull(completionDetails?.reasoning_tokens) ?? 0,
      totalTokens: numberOrNull(finalUsage?.total_tokens),
      cachedPromptTokens: numberOrNull(finalUsage?.prompt_cache_hit_tokens),
      cost: numberOrNull(finalUsage?.cost),
    },
  };
}

export async function generateAnnotation(
  input: GenerateAnnotationInput,
  dependencies: ProviderDependencies = {},
): Promise<Generation> {
  assert.equal(input.config.model, "deepseek-v4-flash", "annotation eval model must be deepseek-v4-flash");
  assert(input.config.baseUrl.trim(), "annotation eval base URL is required");
  assert(input.config.apiKey.trim(), "annotation eval API key is required");
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? (() => performance.now());
  const sleep = dependencies.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await generateOnce(input, { fetchImpl, now });
      return GenerationSchema.parse({
        partition: input.partition,
        round: input.round,
        caseId: input.testCase.id,
        variant: input.prompt.id,
        promptHash: input.prompt.sha256,
        model: input.config.model,
        thinking: "disabled",
        temperature: 0.35,
        maxTokens: 240,
        attempt,
        valid: true,
        ...result,
      });
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof ProviderHttpError) || error.retryable;
      if (!retryable || attempt === 3) break;
      await sleep(attempt * 1_000);
    }
  }

  const message = redact(
    String(lastError instanceof Error ? lastError.message : lastError),
    input.config.apiKey,
  );
  throw new Error(message);
}
