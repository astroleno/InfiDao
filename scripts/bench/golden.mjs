// Golden frames of the reader's material. The comparison page pins passages
// and the surface seed; a fake page clock pins the living water's ambient
// drift, so the same code on the same machine renders the same pixels.
//   npm run bench:golden -- --mode=record            write baselines
//   npm run bench:golden -- --mode=compare           diff against them, exit 1 on change
// Baselines depend on the GPU and driver: record and compare on one machine.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { baseUrl, launch, parseArgs } from "./browser.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const options = parseArgs(process.argv.slice(2), {
  mode: "compare", dir: ".tmp/golden", path: "/infidao/motion-compare?seed=42",
  // Frames are bit-exact on one machine, and the fire is a faint term: a small
  // change to its colour moves pixels by only a few levels. Compare exactly.
  // A pixel differs when any channel moves by more than this (0..255).
  tolerance: "0",
  // A frame fails when more than this percentage of its pixels differ.
  "max-diff": "0.01",
});
if (!["record", "compare"].includes(options.mode)) throw new Error(`Unknown --mode=${options.mode}; use record or compare.`);

const SIZES = {
  phone: { width: 390, height: 844, deviceScaleFactor: 3 },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 2 },
  desktop: { width: 1458, height: 796, deviceScaleFactor: 2 },
};
// Resting at the top gates the run: its folds hold the water, the fire and
// the ripple field, and it is bit-exact across runs. After a programmatic
// scroll the ripple's noise phase picks up a sub-step, real-clock offset (the
// frozen water answering scroll, by design), so those shots are reported for
// review but do not fail the run.
const SHOTS = [
  { name: "rest-top", top: 0, settleMs: 1500, gate: true },
  { name: "rest-mid", top: 640, settleMs: 1500, gate: false },
  { name: "moving", top: 900, settleMs: 120, glide: 260, gate: false },
];

// The browser delivers scroll events on its own real-time frame schedule. The
// reader repaints in response, so a late event would land on a different
// fake step. Wait for the event, then one task for its handlers to finish.
async function setTop(page, top) {
  const moved = page.evaluate(value => new Promise(resolve => {
    const done = () => { const channel = new MessageChannel(); channel.port1.onmessage = () => resolve(); channel.port2.postMessage(0); };
    const panels = [...document.querySelectorAll("[data-flow-viewport]")].filter(panel => panel.clientHeight > 0
      && Math.abs(panel.scrollTop - Math.min(value, panel.scrollHeight - panel.clientHeight)) >= 1);
    let pending = panels.length;
    if (!pending) { done(); return; }
    for (const panel of panels) {
      panel.addEventListener("scroll", () => { if (--pending === 0) done(); }, { once: true });
      panel.scrollTop = value;
    }
  }), top);
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`scroll to ${top} never fired`)), 10_000); });
  try { await Promise.race([moved, timeout]); } finally { clearTimeout(timer); }
}

async function capture(browser, sizeName, size) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.deviceScaleFactor });
  const page = await context.newPage();
  // The page runs on a paused fake clock from its first script. Network and
  // fonts still resolve in real time, between steps, so the material's first
  // frame always lands on a step boundary and every later frame is fixed.
  // Time flows between install and pause; pause far enough ahead to never be past.
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(5_000);
  await page.goto(`${baseUrl()}${options.path}`, { timeout: 180_000, waitUntil: "domcontentloaded" });
  // Static or unavailable glass would make every frame trivially equal.
  const deadline = Date.now() + 150_000;
  for (;;) {
    await page.clock.runFor(16);
    const ready = await page.evaluate(() => [...document.querySelectorAll("[data-optics]")]
      .some(element => element.getAttribute("data-optics") === "ready"));
    if (ready) break;
    if (Date.now() > deadline) throw new Error(`${sizeName}: reader glass never became ready`);
  }
  // Let entrances, ink blooms and the first settle finish on the fake clock.
  await page.clock.runFor(6_000);
  const frames = [];
  for (const shot of SHOTS) {
    if (shot.glide) {
      // Approach the target in fixed steps so the scroll energy is identical.
      for (let step = 10; step >= 1; step--) {
        await setTop(page, shot.top - (shot.glide * step) / 10);
        await page.clock.runFor(16);
      }
    }
    await setTop(page, shot.top);
    await page.clock.runFor(shot.settleMs);
    const file = `${sizeName}-${shot.name}.png`;
    frames.push({ file, gate: shot.gate, image: await page.screenshot({ animations: "allow", caret: "hide" }) });
  }
  // Closing a context while its GPU process is busy crashes some Chromium
  // builds; browser.close() releases it.
  return frames;
}

async function diff(file, actual) {
  const baselinePath = join(options.dir, file);
  if (!existsSync(baselinePath)) return { file, missing: true };
  const baseline = await readFile(baselinePath);
  const [a, b] = await Promise.all([baseline, actual].map(input =>
    sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return { file, sizeChanged: true };
  const tolerance = Number(options.tolerance);
  const marks = Buffer.alloc(a.data.length);
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const delta = Math.max(Math.abs(a.data[index] - b.data[index]), Math.abs(a.data[index + 1] - b.data[index + 1]),
      Math.abs(a.data[index + 2] - b.data[index + 2]));
    const hit = delta > tolerance;
    if (hit) changed++;
    marks[index] = hit ? 255 : b.data[index] * .25; marks[index + 1] = b.data[index + 1] * .25;
    marks[index + 2] = b.data[index + 2] * .25; marks[index + 3] = 255;
  }
  const percent = (changed * 100) / (a.data.length / 4);
  if (changed) {
    await sharp(marks, { raw: { width: a.info.width, height: a.info.height, channels: 4 } }).png()
      .toFile(join(options.dir, "diff", file));
    await writeFile(join(options.dir, "diff", file.replace(/\.png$/, ".actual.png")), actual);
  }
  return { file, percent };
}

// A dev server compiles on the first visit after an edit. That slow load
// races the fake clock and settles into a different frame, so visit once
// before capturing.
async function warmUp() {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseUrl()}${options.path}`, { timeout: 180_000 });
    await page.waitForFunction(() => [...document.querySelectorAll("[data-optics]")]
      .some(element => element.getAttribute("data-optics") === "ready"), undefined, { timeout: 150_000 });
  } finally {
    await browser.close();
  }
}

await mkdir(join(options.dir, "diff"), { recursive: true });
await warmUp();
let failed = false;
for (const [sizeName, size] of Object.entries(SIZES)) {
  // Each size gets its own browser, as in the other benches.
  const browser = await launch();
  try {
    for (const { file, gate, image } of await capture(browser, sizeName, size)) {
      if (options.mode === "record") {
        await writeFile(join(options.dir, file), image);
        console.log(`recorded ${file}`);
        continue;
      }
      const result = await diff(file, image);
      if (result.missing) { console.log(`MISSING ${file} (run --mode=record first)`); failed = true; continue; }
      if (result.sizeChanged) { console.log(`FAIL ${file}: frame size changed`); failed = true; continue; }
      const bad = result.percent > Number(options["max-diff"]);
      failed ||= bad && gate;
      const label = !bad ? "ok  " : gate ? "FAIL" : "note";
      console.log(`${label} ${file}: ${result.percent.toFixed(3)}% pixels changed${gate ? "" : " (advisory)"}`);
    }
  } finally {
    await browser.close();
  }
}
if (failed) process.exit(1);
