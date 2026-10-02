import { flowRequestSchema, FlowError, type FlowEvent } from "@/lib/flow/contracts";
import { runFlow } from "@/lib/flow/service";
import { requestIPKey, requestSession } from "@/lib/flow/session-identity";
import { serverSessionStore } from "@/lib/flow/session-store-server";
import { serverFlowBudget } from "@/lib/flow/request-budget";
import { withFlowModelBudget } from "@/lib/flow/model-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let release: () => Promise<void> = async () => {};
  try {
    const owner = requestSession(request);
    const payload = await readBody(request);
    const store = await serverSessionStore();
    const budget = await serverFlowBudget();
    const lease = await budget.acquire(owner, requestIPKey(request));
    let released = false;
    release = async () => {
      if (released) return;
      released = true;
      // A Redis outage cannot turn a completed stream into an unhandled rejection.
      // The bounded lease expires even when the disconnect release cannot persist.
      await lease.release().catch(() => {});
    };
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => { controller.abort(); void release(); };
    const deadline = setTimeout(() => { timedOut = true; abort(); }, 90_000);
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    const finish = async () => { clearTimeout(deadline); request.signal.removeEventListener("abort", abort); await release(); };
    const failure = (error: unknown): FlowEvent => ({ type: "error", requestId: payload.requestId,
      code: timedOut ? "TIMEOUT" : error instanceof FlowError ? error.code : "UNAVAILABLE",
      message: timedOut ? "这条联系等待较久，可以稍后重试，原句仍可阅读。" : error instanceof FlowError ? error.message : "这条联系暂未展开，原句仍可阅读。" });
    const execute = (emit: (event: FlowEvent) => void) => withFlowModelBudget(lease,
      () => runFlow(payload, owner, controller.signal, emit, store));
    if (!request.headers.get("accept")?.includes("application/x-ndjson")) {
      const events: FlowEvent[] = [];
      try { await execute(event => events.push(event)); }
      catch (error) { events.push(failure(error)); }
      finally { await finish(); }
      return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
    }
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(streamController) {
        const emit = (event: FlowEvent) => { if (!closed) streamController.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
        try { await execute(emit); }
        catch (error) { if (!controller.signal.aborted || timedOut) emit(failure(error)); }
        finally { await finish(); if (!closed) { closed = true; streamController.close(); } }
      },
      cancel() { closed = true; abort(); return finish(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) {
    await release();
    return Response.json({ error: { code: error instanceof FlowError ? error.code : "INVALID_REQUEST", message: error instanceof FlowError ? error.message : "请求格式不正确。" } }, { status: error instanceof FlowError ? error.status : 400 });
  }
}
