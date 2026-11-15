// Compiles and links every reader shader program in a real WebGL context.
// Unit tests cannot: a misspelled local only fails in the driver, and the
// reader then silently falls back to plain text.
//   npm run check:shaders                  programs only
//   npm run check:shaders -- --page=1      also load the reader and require ready glass
import { createRequire } from "node:module";
import { baseUrl, launch, parseArgs, readerReady, SIZES } from "./browser.mjs";

const require = createRequire(import.meta.url);
const { SHADER_PROGRAMS } = require("../../miniprogram/flow/renderer.js");
const options = parseArgs(process.argv.slice(2), { page: "0" });

const browser = await launch();
let failed = false;
try {
  const page = await browser.newPage();
  const results = await page.evaluate(programs => {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return [{ name: "webgl", error: "WebGL unavailable" }];
    return programs.map(({ name, vertex, fragment }) => {
      const program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return { name, error: gl.getShaderInfoLog(shader) };
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      return gl.getProgramParameter(program, gl.LINK_STATUS) ? { name } : { name, error: gl.getProgramInfoLog(program) };
    });
  }, SHADER_PROGRAMS);
  for (const result of results) {
    console.log(result.error ? `FAIL ${result.name}\n${result.error}` : `ok   ${result.name}`);
    failed ||= !!result.error;
  }
  if (options.page === "1") {
    const context = await browser.newContext({ viewport: SIZES.phone, deviceScaleFactor: SIZES.phone.deviceScaleFactor });
    const reader = await context.newPage();
    await reader.goto(`${baseUrl()}/InfiDao`, { timeout: 180_000 });
    await readerReady(reader);
    const optics = await reader.evaluate(() => document.querySelector("canvas")?.dataset.optics);
    console.log(optics === "ready" ? "ok   reader glass" : `FAIL reader glass (${optics})`);
    failed ||= optics !== "ready";
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
