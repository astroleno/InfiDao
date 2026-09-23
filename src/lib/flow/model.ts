import { FlowError } from "./contracts";

export function flowModelConfig() {
  const key = process.env.FLOW_API_KEY || process.env.DEEPSEEK_API_KEY ||
    (process.env.LLM_MODEL_SECONDARY?.includes("deepseek") ? process.env.LLM_API_KEY_SECONDARY : "");
  const base = process.env.FLOW_BASE_URL || process.env.DEEPSEEK_BASE_URL ||
    (process.env.LLM_MODEL_SECONDARY?.includes("deepseek") ? process.env.LLM_BASE_URL_SECONDARY : "") || "https://api.deepseek.com";
  if (!key) throw new FlowError("MODEL_UNAVAILABLE", "内容服务暂未准备好，当前经文仍可阅读。", 503);
  return { key, model: process.env.FLOW_MODEL || "deepseek-flash", endpoint: /\/chat\/completions\/?$/u.test(base) ? base : base.replace(/\/$/u, "") + "/chat/completions" };
}

export async function flowJson(system: string, input: unknown, signal: AbortSignal): Promise<unknown> {
  const config = flowModelConfig();
  const timeout = AbortSignal.timeout(18_000);
  const response = await fetch(config.endpoint, {
    method: "POST", signal: AbortSignal.any([signal, timeout]),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model: config.model, thinking: { type: "disabled" },
      response_format: { type: "json_object" }, max_tokens: 4608, temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }], stream: false }),
  });
  if (!response.ok) throw new FlowError("MODEL_UNAVAILABLE", "这条联系还没展开，可以稍后再试。", 502);
  const result = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
  if (result.choices?.[0]?.finish_reason === "length") throw new FlowError("MODEL_TRUNCATED", "这条联系还未完整到来，可以再试一次。", 502);
  try { return JSON.parse(result.choices?.[0]?.message?.content || ""); }
  catch { throw new FlowError("MODEL_INVALID", "这条联系还不完整，可以换个入口。", 502); }
}
