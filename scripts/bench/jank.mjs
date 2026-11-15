// Frame pacing of the reader. Single runs are noisy (another process or a
// dev-server recompilation can add frames), so judge by the median run.
//   npm run bench:jank -- --size=phone --mode=auto --seconds=12 --runs=3
//   npm run bench:jank -- --mode=manual --max-over20=2   exit 1 above 2% slow frames
import { baseUrl, launch, median, parseArgs, readerReady, SIZES } from "./browser.mjs";

const options = parseArgs(process.argv.slice(2), { size: "phone", mode: "auto", seconds: "12", runs: "3", path: "/InfiDao", "max-over20": "" });
const size = SIZES[options.size];
if (!size) throw new Error(`Unknown --size=${options.size}; use ${Object.keys(SIZES).join(" or ")}.`);

async function measure(browser) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.deviceScaleFactor });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__frames = [];
    (function loop(time) { window.__frames.push(time); requestAnimationFrame(loop); })(0);
  });
  await page.goto(`${baseUrl()}${options.path}`, { timeout: 180_000 });
  await readerReady(page);
  await page.waitForTimeout(2000);
  const start = await page.evaluate(() => performance.now());
  if (options.mode === "manual") {
    await page.mouse.move(size.width / 2, size.height / 2);
    for (let second = 0; second < Number(options.seconds); second++) {
      for (let step = 0; step < 20; step++) { await page.mouse.wheel(0, (second % 2 ? -1 : 1) * 30); await page.waitForTimeout(45); }
    }
  } else {
    await page.waitForTimeout(Number(options.seconds) * 1000);
  }
  const result = await page.evaluate(from => {
    const frames = window.__frames.filter(time => time > from);
    const gaps = frames.slice(1).map((time, index) => time - frames[index]).sort((a, b) => a - b);
    return { frames: gaps.length, p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1),
      over20: gaps.filter(gap => gap > 20).length, over33: gaps.filter(gap => gap > 33.5).length };
  }, start);
  return { ...result, over20Pct: +(result.over20 * 100 / result.frames).toFixed(2) };
}

// Each run gets its own browser: runs stay independent, and some Chromium
// builds crash when a context is closed while its GPU process is busy.
async function run() {
  const browser = await launch();
  try {
    return await measure(browser);
  } finally {
    await browser.close();
  }
}

const runs = [];
for (let index = 0; index < Number(options.runs); index++) {
  const result = await run();
  runs.push(result);
  console.log(`run ${index + 1}: ${result.frames} frames, ${result.over20} over 20ms (${result.over20Pct}%), ${result.over33} over 33ms, max ${result.max.toFixed(1)}ms`);
}
const typical = median(runs.map(result => result.over20Pct));
console.log(`median: ${typical}% of frames over 20ms (${options.size}, ${options.mode})`);
if (options["max-over20"] !== "" && typical > Number(options["max-over20"])) process.exit(1);
