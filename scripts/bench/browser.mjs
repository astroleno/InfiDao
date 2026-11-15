// Shared launch for the reader's visual benches. A real GPU is required: the
// software rasterizer cannot represent the reader's frame budget.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/ego lite.app/Contents/MacOS/ego lite",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

export const SIZES = {
  phone: { width: 390, height: 844, deviceScaleFactor: 3 },
  desktop: { width: 1458, height: 796, deviceScaleFactor: 2 },
};

export function parseArgs(argv, defaults) {
  const options = { ...defaults };
  for (const arg of argv) {
    const match = /^--([\w-]+)=(.*)$/.exec(arg);
    if (match) options[match[1]] = match[2];
  }
  return options;
}

export function baseUrl() {
  // The dev server accepts reading sessions from its own host name only.
  return (process.env.BENCH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function launch() {
  const { chromium } = require("playwright-core");
  const executablePath = process.env.BENCH_BROWSER || CANDIDATES.find(path => existsSync(path));
  if (!executablePath) throw new Error("No Chromium-based browser found; set BENCH_BROWSER to its executable.");
  return chromium.launch({
    executablePath, headless: true,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
}

export async function readerReady(page, timeout = 150_000) {
  await page.waitForFunction(() => !document.querySelector("[class*=\"opticalLoading\"]")
    && document.querySelector("[data-flow-optic]"), undefined, { timeout });
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
