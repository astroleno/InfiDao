// Long continuous reading: lets the reader flow on its own and records every
// continuation request, every visible wait, every error and every stop.
// This spends real model calls; run it against a dev server with
// FLOW_TIMINGS=1 to also see the server's model calls per request.
//   npm run bench:soak -- --minutes=15 --size=phone --out=/tmp/soak.json
import { writeFileSync } from "node:fs";
import { baseUrl, launch, parseArgs, readerReady, SIZES } from "./browser.mjs";

const options = parseArgs(process.argv.slice(2), { size: "phone", minutes: "15", path: "/InfiDao", out: "", retry: "1" });
const size = SIZES[options.size];
if (!size) throw new Error(`Unknown --size=${options.size}; use ${Object.keys(SIZES).join(" or ")}.`);
const durationMs = Number(options.minutes) * 60_000;
// A reader waiting this long with nothing moving has stopped reading.
const STUCK_MS = 30_000;

const browser = await launch();
const report = { startedAt: new Date().toISOString(), options, requests: [], waits: [], errors: [], stuck: [], samples: 0 };
try {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.deviceScaleFactor });
  const page = await context.newPage();
  const t0 = Date.now();
  const at = () => (Date.now() - t0) / 1000;
  const open = new Map();
  page.on("request", request => {
    if (!request.url().includes("/api/flow") || request.method() !== "POST") return;
    let body = {};
    try { body = JSON.parse(request.postData() || "{}"); } catch {}
    open.set(request, { op: body.op, prefetch: !!body.prefetch, start: at() });
  });
  const finish = (request, failed) => {
    const entry = open.get(request);
    if (!entry) return;
    open.delete(request);
    const record = { ...entry, end: at(), seconds: +(at() - entry.start).toFixed(1), failed };
    report.requests.push(record);
    console.log(`[${record.end.toFixed(0)}s] ${record.op}${record.prefetch ? " (prefetch)" : ""} ${record.seconds}s${failed ? " FAILED " + failed : ""}`);
  };
  page.on("requestfinished", request => finish(request, ""));
  page.on("requestfailed", request => finish(request, request.failure()?.errorText || "failed"));

  await page.goto(`${baseUrl()}${options.path}`, { timeout: 180_000 });
  await readerReady(page);
  console.log(`[${at().toFixed(0)}s] reader ready`);
  report.readyAt = at();

  let wait, lastMove = at(), furthest = -1, lastError = "", articles = 0;
  while (Date.now() - t0 < durationMs) {
    await page.waitForTimeout(250);
    report.samples++;
    const state = await page.evaluate(() => {
      const stream = document.querySelector("[data-flow-stream]");
      const viewport = document.querySelector("[data-flow-viewport]");
      const error = document.querySelector("[class*=\"streamError\"] p")?.textContent || "";
      return { pending: stream?.getAttribute("data-pending") === "true", top: viewport?.scrollTop ?? 0,
        articles: document.querySelectorAll("[data-stream-key]").length, error,
        retry: [...document.querySelectorAll("[class*=\"streamError\"] button")].map(button => button.textContent) };
    });
    // Progress is reading further or receiving more; sub-pixel jitter at the
    // end of the stream is not.
    if (state.top > furthest + 2 || state.articles > articles) { furthest = Math.max(furthest, state.top); lastMove = at(); }
    articles = Math.max(articles, state.articles);
    if (state.pending && !wait) wait = { start: at() };
    if (!state.pending && wait) {
      const record = { start: wait.start, seconds: +(at() - wait.start).toFixed(1) };
      report.waits.push(record);
      console.log(`[${at().toFixed(0)}s] visible wait ${record.seconds}s`);
      wait = undefined;
    }
    if (state.error && state.error !== lastError) {
      report.errors.push({ at: at(), message: state.error });
      console.log(`[${at().toFixed(0)}s] error: ${state.error}`);
      if (options.retry === "1" && state.retry.includes("重试")) {
        await page.waitForTimeout(3000);
        // The button moves with the stream; a finger can still tap it.
        await page.locator("[class*=\"streamError\"] button", { hasText: "重试" }).click({ force: true })
          .catch(error => console.log(`[${at().toFixed(0)}s] retry tap failed: ${error.message.split("\n")[0]}`));
      }
    }
    lastError = state.error;
    if (at() - lastMove > STUCK_MS && !state.pending) {
      report.stuck.push({ at: at(), articles, error: state.error });
      console.log(`[${at().toFixed(0)}s] reading stopped (${articles} passages, error: ${state.error || "none"})`);
      break;
    }
  }
  report.passages = articles;
  report.endedAt = at();
} finally {
  await browser.close();
}

const waits = report.waits.map(wait => wait.seconds);
const summary = {
  minutes: +(report.endedAt / 60).toFixed(1), passages: report.passages,
  continuations: report.requests.filter(request => request.op === "next" && !request.prefetch).length,
  prefetches: report.requests.filter(request => request.prefetch).length,
  visibleWaits: waits.length, waitSeconds: +waits.reduce((total, value) => total + value, 0).toFixed(1),
  longestWait: waits.length ? Math.max(...waits) : 0, errors: report.errors.length, stopped: report.stuck.length > 0,
};
report.summary = summary;
console.log(JSON.stringify(summary));
if (options.out) writeFileSync(options.out, JSON.stringify(report, null, 2));
