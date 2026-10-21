import { FlowError } from "./contracts";
import { chargeFlowModel } from './model-budget';
import { measureFlowPhase, recordFlowCounts } from './timings';
import { jsonPrefix } from './json-prefix';

type StreamOptions = { onProgress: (value: unknown) => Promise<void> };

export function flowModelConfig() {
  const key = process.env.FLOW_API_KEY || process.env.DEEPSEEK_API_KEY ||
    (process.env.LLM_MODEL_SECONDARY?.includes("deepseek") ? process.env.LLM_API_KEY_SECONDARY : "");
  const base = process.env.FLOW_BASE_URL || process.env.DEEPSEEK_BASE_URL ||
    (process.env.LLM_MODEL_SECONDARY?.includes("deepseek") ? process.env.LLM_BASE_URL_SECONDARY : "") || "https://api.deepseek.com";
  if (!key) throw new FlowError("MODEL_UNAVAILABLE", "内容服务暂未准备好，当前经文仍可阅读。", 503);
  return { key, model: process.env.FLOW_MODEL || "deepseek-flash", endpoint: /\/chat\/completions\/?$/u.test(base) ? base : base.replace(/\/$/u, "") + "/chat/completions" };
}

export async function flowJson(system: string, input: unknown, signal: AbortSignal, stream?: StreamOptions): Promise<unknown> {
  const config = flowModelConfig();
  signal.throwIfAborted();
  await chargeFlowModel();
  signal.throwIfAborted();
  return measureFlowPhase('model', () => requestModel(config, system, input, signal, stream));
}

async function requestModel(config: ReturnType<typeof flowModelConfig>, system: string, input: unknown, signal: AbortSignal, stream?: StreamOptions): Promise<unknown> {
  const timeout = AbortSignal.timeout(18_000);
  const content = JSON.stringify(input);
  recordFlowCounts({ inputChars: system.length + content.length });
  try {
    const response = await fetch(config.endpoint, {
      method: "POST", signal: AbortSignal.any([signal, timeout]),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({ model: config.model, thinking: { type: "disabled" },
        response_format: { type: "json_object" }, max_tokens: 4608, temperature: 0.2,
        messages: [{ role: "system", content: system }, { role: "user", content }], stream: !!stream,
        ...(stream ? { stream_options: { include_usage: true } } : {}) }),
    });
    if (!response.ok) throw new FlowError("MODEL_UNAVAILABLE", "这条联系还没展开，可以稍后再试。", 502);
    if (stream && response.headers.get('content-type')?.includes('text/event-stream')) {
      return await readModelStream(response, AbortSignal.any([signal, timeout]), stream.onProgress);
    }
    const result = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number } };
    recordFlowCounts({ ...(result.usage?.prompt_tokens !== undefined ? { promptTokens: result.usage.prompt_tokens } : {}),
      ...(result.usage?.completion_tokens !== undefined ? { completionTokens: result.usage.completion_tokens } : {}) });
    if (result.choices?.[0]?.finish_reason === "length") throw new FlowError("MODEL_TRUNCATED", "这条联系还未完整到来，可以再试一次。", 502);
    try { return JSON.parse(result.choices?.[0]?.message?.content || ""); }
    catch { throw new FlowError("MODEL_INVALID", "这条联系还不完整，可以换个入口。", 502); }
  } catch (error) {
    if (timeout.aborted && !signal.aborted) throw new FlowError('MODEL_TIMEOUT', '生成服务响应超时，可以重试，原句仍可阅读。', 504);
    throw error;
  }
}

async function readModelStream(response: Response, signal: AbortSignal, onProgress: StreamOptions['onProgress']) {
  if (!response.body) throw new FlowError('MODEL_INVALID', '这条联系还不完整，可以换个入口。', 502);
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', content = '', finish: string | null = null, previous = '';
  async function line(value: string) {
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).trim();
    if (!data || data === '[DONE]') return;
    const part = JSON.parse(data) as { error?: unknown; choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number } };
    if (part.error) throw new FlowError('MODEL_UNAVAILABLE', '这条联系还没展开，可以稍后再试。', 502);
    const choice = part.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (part.usage) recordFlowCounts({ ...(part.usage.prompt_tokens !== undefined ? { promptTokens: part.usage.prompt_tokens } : {}),
      ...(part.usage.completion_tokens !== undefined ? { completionTokens: part.usage.completion_tokens } : {}) });
    if (!choice?.delta?.content) return;
    content += choice.delta.content;
    if (content.length > 128 * 1024) throw new FlowError('MODEL_INVALID', '这次回复过长，请重新展开。', 502);
    const prefix = jsonPrefix(content), serialized = JSON.stringify(prefix);
    if (serialized && serialized !== previous) {
      signal.throwIfAborted();
      await onProgress(prefix);
      signal.throwIfAborted();
      previous = serialized;
    }
  }
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      buffer += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        await line(buffer.slice(0, boundary).replace(/\r$/u, ''));
        buffer = buffer.slice(boundary + 1);
      }
      if (buffer.length > 256 * 1024) throw new FlowError('MODEL_INVALID', '这次回复过长，请重新展开。', 502);
      if (part.done) break;
    }
    if (buffer.trim()) await line(buffer);
    if (finish === 'length') throw new FlowError('MODEL_TRUNCATED', '这条联系还未完整到来，可以再试一次。', 502);
    if (finish !== 'stop') throw new FlowError('MODEL_INVALID', '这条联系还未完整到来，可以再试一次。', 502);
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) throw new FlowError('MODEL_INVALID', '这条联系还不完整，可以换个入口。', 502);
    throw error;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
