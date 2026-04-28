const DEFAULT_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const WAIT_INTERVAL_MS = 500;

function parseArgs(argv) {
  const options = {};

  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
    } else if (arg.startsWith("--wait-timeout-ms=")) {
      options.waitTimeoutMs = Number(arg.slice("--wait-timeout-ms=".length));
    } else if (arg.startsWith("--request-timeout-ms=")) {
      options.requestTimeoutMs = Number(arg.slice("--request-timeout-ms=".length));
    }
  }

  return options;
}

function resolvePositiveInteger(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(baseUrl, path, init = {}, requestTimeoutMs) {
  const result = await requestRaw(baseUrl, path, init, requestTimeoutMs);
  let json;

  try {
    json = JSON.parse(result.raw);
  } catch {
    json = result.raw;
  }

  return {
    ...result,
    json,
  };
}

async function requestRaw(baseUrl, path, init = {}, requestTimeoutMs) {
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

    return {
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - startedAt,
      raw,
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

function uniqueStaticAssetPaths(html, extension) {
  return [
    ...new Set(
      [...html.matchAll(/\/_next\/static\/[^"'\s<>]+/gu)]
        .map(match => match[0])
        .map(path => path.replace(/&amp;/gu, "&"))
        .filter(path => path.endsWith(extension)),
    ),
  ];
}

async function verifyFrontendAssets(baseUrl, requestTimeoutMs) {
  const page = await requestRaw(baseUrl, "/", { method: "GET" }, requestTimeoutMs);
  ensure(page.status === 200, `Homepage failed with ${page.status}.`);
  ensure(page.raw.includes("六经注我"), "Homepage did not render the reboot intro.");

  const scriptPaths = uniqueStaticAssetPaths(page.raw, ".js");
  ensure(scriptPaths.length > 0, "Homepage did not reference any Next.js static JavaScript chunks.");

  for (const scriptPath of scriptPaths) {
    const asset = await requestRaw(baseUrl, scriptPath, { method: "GET" }, requestTimeoutMs);
    ensure(asset.status === 200, `Frontend JavaScript asset failed with ${asset.status}: ${scriptPath}`);
    ensure(asset.raw.length > 0, `Frontend JavaScript asset was empty: ${scriptPath}`);
  }

  console.log(`[smoke] frontend assets ok in ${formatMs(page.elapsedMs)} js=${scriptPaths.length}`);
}

async function waitForHealth(baseUrl, waitTimeoutMs, requestTimeoutMs) {
  const deadline = Date.now() + waitTimeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await requestJson(baseUrl, "/api/health", { method: "GET" }, requestTimeoutMs);

      if (result.status === 200 && result.json?.success === true && result.json?.data?.status === "ok") {
        return result;
      }

      lastError = new Error(`Health returned ${result.status}: ${JSON.stringify(result.json)}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(WAIT_INTERVAL_MS);
  }

  throw lastError ?? new Error("Health check never became ready.");
}

function formatMs(value) {
  return `${value}ms`;
}

async function main() {
  const cliOptions = parseArgs(process.argv.slice(2));
  const baseUrl = (
    cliOptions.baseUrl ||
    process.env.SMOKE_BASE_URL ||
    DEFAULT_BASE_URL
  ).trim();
  const waitTimeoutMs = resolvePositiveInteger(
    cliOptions.waitTimeoutMs || process.env.SMOKE_WAIT_TIMEOUT_MS,
    DEFAULT_WAIT_TIMEOUT_MS,
  );
  const requestTimeoutMs = resolvePositiveInteger(
    cliOptions.requestTimeoutMs || process.env.SMOKE_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );

  console.log(`[smoke] baseUrl=${baseUrl}`);
  console.log(`[smoke] waitTimeoutMs=${waitTimeoutMs} requestTimeoutMs=${requestTimeoutMs}`);

  const health = await waitForHealth(baseUrl, waitTimeoutMs, requestTimeoutMs);
  console.log(`[smoke] health ok in ${formatMs(health.elapsedMs)}`);

  await verifyFrontendAssets(baseUrl, requestTimeoutMs);

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
  ensure(search.json.data[0]?.id === "lunyu-1-8", `Search top result drifted: ${search.json.data[0]?.id ?? "missing"}`);
  console.log(
    `[smoke] search ok in ${formatMs(search.elapsedMs)} count=${search.json.data.length} top=${search.json.data[0].id}`,
  );

  const topPassage = search.json.data[0];
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
  ensure(
    typeof annotate.json.data?.sixToMe === "string" && annotate.json.data.sixToMe.trim().length > 0,
    "Annotate did not return sixToMe copy.",
  );
  ensure(
    typeof annotate.json.data?.meToSix === "string" && annotate.json.data.meToSix.trim().length > 0,
    "Annotate did not return meToSix copy.",
  );
  ensure(Array.isArray(annotate.json.data?.links), "Annotate did not return links.");
  ensure(annotate.json.data.links.length > 0, "Annotate returned no exploration links.");
  console.log(
    `[smoke] annotate ok in ${formatMs(annotate.elapsedMs)} links=${annotate.json.data.links.length} passage=${annotate.json.data.passageId}`,
  );

  const telemetry = await requestJson(
    baseUrl,
    "/api/internal/annotation-telemetry",
    { method: "GET", headers: { "content-type": "application/json" } },
    requestTimeoutMs,
  );
  ensure(telemetry.status === 404, `Internal telemetry expected 404 in production, received ${telemetry.status}.`);
  ensure(
    telemetry.json?.success === false && telemetry.json?.error?.code === "NOT_FOUND",
    `Internal telemetry returned unexpected payload: ${JSON.stringify(telemetry.json)}`,
  );
  console.log(`[smoke] internal telemetry 404 confirmed in ${formatMs(telemetry.elapsedMs)}`);

  const embed = await requestJson(
    baseUrl,
    "/api/embed",
    { method: "GET", headers: { "content-type": "application/json" } },
    requestTimeoutMs,
  );
  ensure(embed.status === 410, `Embed expected 410, received ${embed.status}.`);
  ensure(
    embed.json?.success === false && embed.json?.error?.code === "LEGACY_EMBED_DISABLED",
    `Embed returned unexpected payload: ${JSON.stringify(embed.json)}`,
  );
  console.log(`[smoke] embed 410 confirmed in ${formatMs(embed.elapsedMs)}`);

  console.log("[smoke] release smoke passed");
}

main().catch((error) => {
  console.error(`[smoke] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
