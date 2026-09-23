import { flowRequestSchema, FlowError, type FlowEvent } from "@/lib/flow/contracts";
import { runFlow } from "@/lib/flow/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clients = new Map<string, { started: number; calls: number; active: number }>();

async function readBody(request: Request) {
  const reader = request.body?.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = "";
  if (!reader) throw new FlowError("INVALID_REQUEST", "请求内容为空。");
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 8192) { await reader.cancel(); throw new FlowError("REQUEST_TOO_LARGE", "这次输入太长，请缩短后再试。", 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    return flowRequestSchema.parse(JSON.parse(text + decoder.decode()));
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request): Promise<Response> {
  let release = () => {};
  try {
    const owner = request.headers.get("x-flow-session") || "";
    if (!/^[A-Za-z0-9_-]{24,96}$/u.test(owner)) throw new FlowError("INVALID_SESSION", "请重新打开这次阅读。", 400);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const budget = clients.get(ip) || { started: Date.now(), calls: 0, active: 0 };
    if (Date.now() - budget.started > 60_000) { budget.started = Date.now(); budget.calls = 0; }
    if (budget.calls >= 60 || budget.active >= 4) throw new FlowError("BUSY", "先读一会儿，稍后再展开新的联系。", 429);
    budget.calls++; budget.active++; clients.set(ip, budget);
    if (clients.size > 1024) for (const [key, item] of clients) if (!item.active && Date.now() - item.started > 60_000) clients.delete(key);
    release = () => { budget.active = Math.max(0, budget.active - 1); };
    const payload = await readBody(request);
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const finish = () => { request.signal.removeEventListener("abort", abort); release(); };
    const failure = (error: unknown): FlowEvent => ({ type: "error", requestId: payload.requestId,
      code: error instanceof FlowError ? error.code : "UNAVAILABLE",
      message: error instanceof FlowError ? error.message : "这条联系暂未展开，原句仍可阅读。" });
    if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
      const events: FlowEvent[] = [];
      try { await runFlow(payload, owner, controller.signal, event => events.push(event)); }
      catch (error) { events.push(failure(error)); }
      finally { finish(); }
      return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
    }
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(streamController) {
        const emit = (event: FlowEvent) => { if (!closed) streamController.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
        try { await runFlow(payload, owner, controller.signal, emit); }
        catch (error) { if (!controller.signal.aborted) emit(failure(error)); }
        finally { finish(); if (!closed) { closed = true; streamController.close(); } }
      },
      cancel() { closed = true; controller.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    release();
    return Response.json({ error: { code: error instanceof FlowError ? error.code : "INVALID_REQUEST", message: error instanceof FlowError ? error.message : "请求格式不正确。" } }, { status: error instanceof FlowError ? error.status : 400 });
  }
}
