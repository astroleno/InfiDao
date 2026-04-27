import type { AnnotationStyle } from "@/types";

export interface AnnotationLlmInput {
  query: string;
  passageLabel: string;
  passageText: string;
  style: AnnotationStyle;
}

export interface AnnotationLlmOutput {
  sixToMe: string;
  meToSix: string;
  model: string;
  slot: AnnotationLlmSlot;
}

export type AnnotationLlmSlot = "primary" | "secondary";

export interface AnnotationLlmSlotConfig {
  slot: AnnotationLlmSlot;
  endpoint: string;
  apiKey: string;
  model: string;
}

export type AnnotationLlmMode = "fast" | "quality";

export const DEFAULT_ANNOTATION_LLM_TIMEOUT_MS = 6_000;
const MAX_ANNOTATION_LLM_TIMEOUT_MS = 60_000;

export class AnnotationLlmTimeoutError extends Error {
  constructor(
    public readonly slot: AnnotationLlmSlot,
    public readonly model: string,
    public readonly timeoutMs: number,
  ) {
    super(`Annotation provider timed out for ${slot} (${model}) after ${timeoutMs}ms.`);
    this.name = "AnnotationLlmTimeoutError";
  }
}

const STYLE_GUIDANCE: Record<AnnotationStyle, string> = {
  academic: "语气克制、结构清晰，偏义理分析。",
  classical: "保留一点古意，但仍要让现代读者直接读懂。",
  modern: "直接、清楚、可落地，贴近当代处境。",
  poetic: "允许更有画面感，但不要空泛或抒情过度。",
};

function firstNonEmptyValue(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function resolveChatCompletionsEndpoint(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/$/u, "");

  if (/\/chat\/completions$/u.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}

function resolveSlotConfig(slot: AnnotationLlmSlot): AnnotationLlmSlotConfig | null {
  const model =
    slot === "primary"
      ? firstNonEmptyValue(["LLM_MODEL_PRIMARY", "LLM_MODEL", "LLM_PROVIDER"])
      : firstNonEmptyValue([
          "LLM_MODEL_SECONDARY",
          "LLM_MODEL_2",
          "LLM_PROVIDER_2",
          "LLM_PROVIDE_2",
        ]);
  const rawBaseUrl =
    slot === "primary"
      ? firstNonEmptyValue(["LLM_BASE_URL_PRIMARY", "LLM_BASE_URL", "OPENAI_BASE_URL"])
      : firstNonEmptyValue([
          "LLM_BASE_URL_SECONDARY",
          "LLM_BASE_URL_2",
          "OPENAI_BASE_URL_2",
          "OPENAI_BASE_URL",
        ]);
  const apiKey =
    slot === "primary"
      ? firstNonEmptyValue(["LLM_API_KEY_PRIMARY", "LLM_API_KEY", "OPENAI_API_KEY"])
      : firstNonEmptyValue(["LLM_API_KEY_SECONDARY", "LLM_API_KEY_2", "OPENAI_API_KEY_2"]);

  if (!model || !rawBaseUrl || !apiKey) {
    return null;
  }

  return {
    slot,
    endpoint: resolveChatCompletionsEndpoint(rawBaseUrl),
    apiKey,
    model,
  };
}

export function resolveAnnotationLlmConfigs(): AnnotationLlmSlotConfig[] {
  return (["primary", "secondary"] as const)
    .map(slot => resolveSlotConfig(slot))
    .filter((config): config is AnnotationLlmSlotConfig => config !== null);
}

export function resolveAnnotationLlmMode(): AnnotationLlmMode {
  const rawMode = firstNonEmptyValue(["ANNOTATION_LLM_MODE", "ANNOTATION_MODE"]).toLowerCase();

  if (rawMode === "quality") {
    return "quality";
  }

  return "fast";
}

export function resolveAnnotationLlmTimeoutMs(): number {
  const rawTimeout = firstNonEmptyValue([
    "ANNOTATION_LLM_TIMEOUT_MS",
    "LLM_TIMEOUT_MS",
    "TIMEOUT_MS",
  ]);

  if (!rawTimeout) {
    return DEFAULT_ANNOTATION_LLM_TIMEOUT_MS;
  }

  const parsedTimeout = Number(rawTimeout);

  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    return DEFAULT_ANNOTATION_LLM_TIMEOUT_MS;
  }

  return Math.min(Math.trunc(parsedTimeout), MAX_ANNOTATION_LLM_TIMEOUT_MS);
}

export function resolveAnnotationLlmRequestPlan(
  mode = resolveAnnotationLlmMode(),
): AnnotationLlmSlotConfig[] {
  const configs = resolveAnnotationLlmConfigs();
  const order = mode === "quality" ? ["primary", "secondary"] : ["secondary", "primary"];

  return order
    .map(slot => configs.find(config => config.slot === slot))
    .filter((config): config is AnnotationLlmSlotConfig => config !== undefined);
}

function buildPrompt(input: AnnotationLlmInput): string {
  return [
    "你是“六经注我”的注释助手。",
    "任务：围绕给定查询与经典原文，生成两个短段落。",
    "输出必须是 JSON 对象，且只能包含 sixToMe 和 meToSix 两个字段。",
    "要求：",
    "1. sixToMe：从经典回应当下问题，2-4 句，避免空话。",
    "2. meToSix：从当下问题反观经典，2-4 句，指出这次阅读如何改写文本意义。",
    "3. 不要输出 Markdown，不要代码块，不要额外解释。",
    "4. 语言使用简体中文。",
    `5. 风格提示：${STYLE_GUIDANCE[input.style]}`,
    "",
    `查询：${input.query}`,
    `出处：${input.passageLabel}`,
    `原文：${input.passageText}`,
  ].join("\n");
}

function coerceMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map(item => {
      if (typeof item === "string") {
        return item;
      }

      if (typeof item === "object" && item !== null) {
        if ("text" in item && typeof item.text === "string") {
          return item.text;
        }

        if ("content" in item && typeof item.content === "string") {
          return item.content;
        }
      }

      return "";
    })
    .join("")
    .trim();
}

function extractJsonObject(raw: string): unknown {
  const direct = raw.trim();

  try {
    return JSON.parse(direct) as unknown;
  } catch {
    const fencedMatch = direct.match(/```(?:json)?\s*([\s\S]*?)```/u);
    const candidate = fencedMatch?.[1]?.trim() || direct;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as unknown;
    }

    throw new Error("Model response did not contain a JSON object.");
  }
}

function parseAnnotationPayload(raw: string): Pick<AnnotationLlmOutput, "sixToMe" | "meToSix"> {
  const parsed = extractJsonObject(raw);
  const payload =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { sixToMe?: unknown; meToSix?: unknown })
      : null;

  if (
    payload === null ||
    typeof payload.sixToMe !== "string" ||
    typeof payload.meToSix !== "string"
  ) {
    throw new Error("Model response did not match the reboot annotation contract.");
  }

  return {
    sixToMe: payload.sixToMe.trim(),
    meToSix: payload.meToSix.trim(),
  };
}

async function requestAnnotationFromSlot(
  config: AnnotationLlmSlotConfig,
  input: AnnotationLlmInput,
  timeoutMs: number,
): Promise<AnnotationLlmOutput> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let raw: string;

  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: "Return only a JSON object with sixToMe and meToSix.",
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
      }),
    });
    raw = await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AnnotationLlmTimeoutError(config.slot, config.model, timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let parsedResponse: unknown;

  try {
    parsedResponse = JSON.parse(raw) as unknown;
  } catch {
    parsedResponse = { raw };
  }

  if (!response.ok) {
    throw new Error(
      `Annotation provider request failed for ${config.slot} (${config.model}) with status ${response.status}.`,
    );
  }

  const content =
    typeof parsedResponse === "object" && parsedResponse !== null && "choices" in parsedResponse
      ? coerceMessageContent(
          (parsedResponse as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]
            ?.message?.content,
        )
      : "";

  if (!content) {
    throw new Error(
      `Annotation provider returned an empty message for ${config.slot} (${config.model}).`,
    );
  }

  return {
    ...parseAnnotationPayload(content),
    model: config.model,
    slot: config.slot,
  };
}

export async function generateAnnotationFromLlm(
  input: AnnotationLlmInput,
  mode = resolveAnnotationLlmMode(),
): Promise<AnnotationLlmOutput | null> {
  const configs = resolveAnnotationLlmRequestPlan(mode);

  if (configs.length === 0) {
    return null;
  }

  const deadlineMs = Date.now() + resolveAnnotationLlmTimeoutMs();
  let lastError: unknown = null;

  for (const config of configs) {
    const remainingTimeoutMs = deadlineMs - Date.now();

    if (remainingTimeoutMs <= 0) {
      lastError = new AnnotationLlmTimeoutError(config.slot, config.model, 0);
      break;
    }

    try {
      return await requestAnnotationFromSlot(config, input, remainingTimeoutMs);
    } catch (error) {
      lastError = error;

      if (Date.now() >= deadlineMs) {
        break;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Annotation provider request failed.");
}
