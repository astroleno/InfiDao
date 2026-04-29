const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function resolvePositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(baseUrl, path, init = {}, requestTimeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const raw = await response.text();
    let json;

    try {
      json = JSON.parse(raw);
    } catch {
      json = raw;
    }

    return {
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
      json,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out for ${path} after ${requestTimeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatMs(value) {
  return `${value}ms`;
}

function formatAlerts(alerts) {
  return alerts.map(alert => `${alert.code} actual=${alert.actual} threshold=${alert.threshold}`).join(", ");
}

async function main() {
  const baseUrl = (process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL).trim();
  const requestTimeoutMs = resolvePositiveInteger(
    process.env.SMOKE_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );

  console.log(`[telemetry-smoke] baseUrl=${baseUrl}`);
  console.log(`[telemetry-smoke] requestTimeoutMs=${requestTimeoutMs}`);

  const search = await requestJson(
    baseUrl,
    "/api/search",
    {
      method: "POST",
      body: JSON.stringify({
        query: "如何面对困境",
        topK: 5,
      }),
    },
    requestTimeoutMs,
  );
  ensure(search.status === 200, `Search failed with ${search.status}.`);
  ensure(search.json?.success === true, `Search payload was not successful: ${JSON.stringify(search.json)}`);
  ensure(Array.isArray(search.json.data) && search.json.data.length > 0, "Search returned no results.");

  const topPassage = search.json.data[0];
  console.log(
    `[telemetry-smoke] search ok in ${formatMs(search.elapsedMs)} count=${search.json.data.length} top=${topPassage.id}`,
  );

  const annotate = await requestJson(
    baseUrl,
    "/api/annotate",
    {
      method: "POST",
      body: JSON.stringify({
        query: "如何面对困境",
        passageId: topPassage.id,
        passageText: topPassage.text,
        style: "modern",
        visitedPassageIds: [topPassage.id],
      }),
    },
    requestTimeoutMs,
  );
  ensure(annotate.status === 200, `Annotate failed with ${annotate.status}.`);
  ensure(
    annotate.json?.success === true,
    `Annotate payload was not successful: ${JSON.stringify(annotate.json)}`,
  );
  console.log(
    `[telemetry-smoke] annotate ok in ${formatMs(annotate.elapsedMs)} passage=${annotate.json.data?.passageId ?? "unknown"}`,
  );

  const telemetry = await requestJson(
    baseUrl,
    "/api/internal/annotation-telemetry",
    { method: "GET" },
    requestTimeoutMs,
  );
  ensure(
    telemetry.status === 200,
    `Internal telemetry must run against a dev/test server; received ${telemetry.status}.`,
  );
  ensure(
    telemetry.json?.success === true,
    `Telemetry payload was not successful: ${JSON.stringify(telemetry.json)}`,
  );

  const data = telemetry.json.data;
  const alerts = data?.summary?.alerts ?? [];
  const warnings = data?.llm?.warnings ?? [];

  ensure(Array.isArray(alerts), "Telemetry summary alerts were missing.");
  ensure(Array.isArray(warnings), "Telemetry LLM warnings were missing.");
  ensure(alerts.length === 0, `Telemetry alerts present: ${formatAlerts(alerts)}`);
  ensure(warnings.length === 0, `LLM runtime warnings present: ${warnings.join("; ")}`);

  console.log(
    `[telemetry-smoke] telemetry ok in ${formatMs(telemetry.elapsedMs)} fallbackRate=${data.summary.fallbackRate} p95=${data.summary.latency.p95} providers=${JSON.stringify(data.summary.byProvider)}`,
  );
  console.log("[telemetry-smoke] passed");
}

main().catch((error) => {
  console.error(
    `[telemetry-smoke] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
