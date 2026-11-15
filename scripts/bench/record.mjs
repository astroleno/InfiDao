// Repeatable recording of the reader's material. The comparison page uses
// fixed local passages and a pinned surface seed, so two recordings of the
// same code match frame for frame and before/after captures are comparable.
//   npm run bench:record -- --out=/tmp/after.mp4 --size=phone --seconds=8
// Requires ffmpeg on PATH to encode the frames.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseUrl, launch, parseArgs, SIZES } from "./browser.mjs";

const options = parseArgs(process.argv.slice(2), {
  size: "phone", seconds: "8", out: "reader.mp4",
  path: "/infidao/motion-compare?seed=42&play=1&speed=36",
});
const size = SIZES[options.size];
if (!size) throw new Error(`Unknown --size=${options.size}; use ${Object.keys(SIZES).join(" or ")}.`);

const frames = await mkdtemp(join(tmpdir(), "infidao-record-"));
const browser = await launch();
try {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.deviceScaleFactor });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const stamps = [];
  const writes = [];
  session.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const index = stamps.length;
    stamps.push(metadata.timestamp);
    writes.push(writeFile(join(frames, `f_${String(index).padStart(5, "0")}.jpg`), Buffer.from(data, "base64")));
    session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await page.goto(`${baseUrl()}${options.path}`, { timeout: 180_000 });
  await page.waitForFunction(() => document.querySelector("[data-flow-optic]"), undefined, { timeout: 120_000 });
  await page.waitForTimeout(1000);
  await session.send("Page.startScreencast", { format: "jpeg", quality: 90, everyNthFrame: 1,
    maxWidth: size.width * 2, maxHeight: size.height * 2 });
  await page.waitForTimeout(Number(options.seconds) * 1000);
  await session.send("Page.stopScreencast");
  await Promise.all(writes);
  // Screencast frames arrive only on change: keep each for its real duration.
  const list = stamps.map((stamp, index) => `file '${join(frames, `f_${String(index).padStart(5, "0")}.jpg`)}'\nduration ${Math.max(.004, Math.min(.5, (stamps[index + 1] ?? stamp + .04) - stamp)).toFixed(4)}`);
  await writeFile(join(frames, "list.txt"), `${list.join("\n")}\n`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(frames, "list.txt"),
    "-vf", "fps=60,format=yuv420p", "-c:v", "libx264", "-crf", "16", options.out]);
  console.log(`${stamps.length} frames -> ${options.out}`);
} finally {
  await browser.close();
  await rm(frames, { recursive: true, force: true });
}
