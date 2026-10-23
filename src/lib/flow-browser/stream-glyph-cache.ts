import type { OpticalRun } from './stream-glass';
import type { BendSettings } from './bend';
import type { TargetRegion } from './stream-frame-plan';

const { liquidContactWeight } = require('../../../miniprogram/flow/stream-liquid') as {
  liquidContactWeight: (x: number, y: number, phase?: number) => number;
};

type Rect = { x: number; y: number; width: number; height: number };
type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number; activeWidth: number; activeHeight: number };
type Page = { texture: WebGLTexture; free: Rect[] };
type Cell = Rect & { page: Page; slot: Rect; left: number; top: number; scale: number };
type Glyph = { canvas: HTMLCanvasElement; left: number; top: number; bytes: number };
type Row = { runs: OpticalRun[]; first: OpticalRun; cell: Cell; color: number[]; energy: number; bounds: { left: number; right: number } };
type Tile = Rect & { row: Row; mode: number; sigma: number; screen: Rect; gradient: number };
type Measure = (run: OpticalRun, text?: string) => TextMetrics;
type Program = { program: WebGLProgram; attributes: number[]; uniforms: Record<string, WebGLUniformLocation | null> };

export type GpuGlyphSources = {
  source: WebGLTexture;
  foreground: WebGLTexture;
  ink?: WebGLTexture;
  adhesion?: WebGLTexture;
};

const ATTRIBUTES = ['position', 'uv', 'bounds', 'params', 'scene', 'row', 'color'];
const STRIDE = 22;
const VERTEX = `
precision highp float;
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_bounds;
attribute vec4 a_params;
attribute vec2 a_scene;
attribute vec4 a_row;
attribute vec4 a_color;
uniform vec2 u_target;
varying vec2 v_uv;
varying vec4 v_bounds;
varying vec4 v_params;
varying vec2 v_scene;
varying vec4 v_row;
varying vec4 v_color;
void main() {
  gl_Position = vec4(a_position.x / u_target.x * 2.0 - 1.0, 1.0 - a_position.y / u_target.y * 2.0, 0.0, 1.0);
  v_uv = a_uv; v_bounds = a_bounds; v_params = a_params;
  v_scene = a_scene; v_row = a_row; v_color = a_color;
}`;
const COMMON = `
precision highp float;
uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec4 v_bounds;
varying vec4 v_params;
varying vec2 v_scene;
varying vec4 v_row;
varying vec4 v_color;
vec4 sampleCell(vec2 uv) {
  if (uv.x < v_bounds.x || uv.y < v_bounds.y || uv.x > v_bounds.z || uv.y > v_bounds.w) return vec4(0.0);
  return texture2D(u_texture, uv);
}`;
const HORIZONTAL = `${COMMON}
uniform sampler2D u_gradient;
uniform sampler2D u_ink;
uniform vec2 u_resolution;
uniform vec2 u_step;
uniform float u_dpr;
uniform float u_inking;
uniform float u_contacts;
vec4 lettering(float offset) {
  vec4 mask = sampleCell(v_uv + vec2(offset * u_step.x, 0.0));
  vec2 point = v_scene + vec2(offset / u_dpr, 0.0);
  vec4 meta = u_inking > 0.5 ? texture2D(u_ink, vec2(point.x / u_resolution.x, 1.0 - point.y / u_resolution.y)) : vec4(0.0);
#if GLYPH_LAYER == 2
    if (meta.a > 0.5 && meta.r < 0.998) return vec4(0.0);
    float at = clamp((point.x - v_row.x) / max(1.0, v_row.y), 0.0, 1.0);
    float weight;
    if (u_contacts > 0.5) {
      float steps = clamp(ceil(v_row.y / 3.0), 8.0, 128.0);
      weight = texture2D(u_gradient, vec2((at * steps + 0.5) / 129.0, v_row.w)).r;
    } else {
      float edge = min(0.30, 28.0 / max(1.0, v_row.y));
      weight = 1.0 - min(min(at, 1.0 - at) / edge, 1.0);
    }
    float alpha = mask.g;
    return vec4(vec3(v_params.y, v_row.z, weight) * alpha, alpha);
#else
#if GLYPH_LAYER == 1
  if (v_params.w < 0.5 && meta.a < 0.5) return vec4(0.0);
  // Underline coverage is independent of the immutable lettering mask.
  mask.r = mix(mask.r, mask.r * (1.0 - mask.b) + mask.b, v_params.z);
#endif
  float alpha = mask.r * v_params.y * v_color.a;
  return vec4(v_color.rgb * alpha, alpha);
#endif
}
void main() {
  float sigma = v_params.x;
  if (sigma < 0.03) { gl_FragColor = lettering(0.0); return; }
  float radius = ceil(sigma * 3.0), total = 0.0;
  vec4 value = vec4(0.0);
  for (int i = -BLUR_TAPS; i <= BLUR_TAPS; i++) {
    float offset = float(i);
    if (abs(offset) > radius) continue;
    float weight = exp(-0.5 * offset * offset / (sigma * sigma));
    value += lettering(offset) * weight; total += weight;
  }
  gl_FragColor = value / total;
}`;
const VERTICAL = `${COMMON}
uniform vec2 u_step;
void main() {
  float sigma = v_params.x;
  if (sigma < 0.03) { gl_FragColor = sampleCell(v_uv); return; }
  float radius = ceil(sigma * 3.0), total = 0.0;
  vec4 value = vec4(0.0);
  for (int i = -BLUR_TAPS; i <= BLUR_TAPS; i++) {
    float offset = float(i);
    if (abs(offset) > radius) continue;
    float weight = exp(-0.5 * offset * offset / (sigma * sigma));
    value += sampleCell(v_uv + vec2(0.0, offset * u_step.y)) * weight; total += weight;
  }
  gl_FragColor = value / total;
}`;
const METADATA = `${COMMON}
void main() {
  vec2 coverage = clamp(min(v_scene - v_bounds.xy, v_bounds.zw - v_scene) + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(v_color.rgb, coverage.x * coverage.y);
}`;

function makeProgram(gl: WebGLRenderingContext, fragment: string): Program {
  const program = gl.createProgram();
  if (!program) throw new Error('Glyph program unavailable');
  const shaders: WebGLShader[] = [];
  try {
    [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, index) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Glyph shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, index ? fragment : VERTEX); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Glyph shader failed');
      gl.attachShader(program, shader);
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Glyph program failed');
    return { program, attributes: ATTRIBUTES.map(name => gl.getAttribLocation(program, `a_${name}`)),
      uniforms: Object.fromEntries(['target', 'texture', 'gradient', 'ink', 'resolution', 'step', 'dpr', 'inking', 'contacts']
        .map(name => [name, gl.getUniformLocation(program, `u_${name}`)])) };
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { shaders.forEach(shader => gl.deleteShader(shader)); }
}

const CORNERS = [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]] as const;
function quad(data: number[], rect: Rect, uv: Rect, bounds: number[], params: number[], scene: Rect, row: number[], color: number[]) {
  for (const [x, y] of CORNERS) {
    data.push(rect.x + x! * rect.width, rect.y + y! * rect.height,
      uv.x + x! * uv.width, uv.y + y! * uv.height, ...bounds, ...params,
      scene.x + x! * scene.width, scene.y + y! * scene.height, ...row, ...color);
  }
}

/** Rasterize lettering only when its font/layout changes. Every moving frame
 * keeps its masks on the same GPU as the original glass and liquid passes. */
export class StreamGlyphCache {
  private pages: Page[] = [];
  private cells = new Map<string, Cell>();
  private pinned = new Set<string>();
  private glyphs = new Map<string, Glyph>();
  private glyphBytes = 0;
  private readonly glyphBudget = 16 * 1024 * 1024;
  private colors = new Map<string, number[]>();
  private targets = new Map<string, Target>();
  private programs: Program[] = [];
  private buffer: WebGLBuffer;
  private gradient: WebGLTexture;
  private gradientData = new Uint8Array(129 * 64 * 4);
  private raster = document.createElement('canvas');
  private context = this.raster.getContext('2d');
  private pageSize: number;
  private maxAttributes: number;
  private revision = '';
  private rows: Row[] = [];
  private retainedRows = new Map<number, { key: string; row: Row }>();
  private runIds = new WeakMap<OpticalRun, number>();
  private nextRunId = -1;
  private horizontal: Program[] = [];
  private vertical: Program[] = [];
  private metadata: Program;
  private vertices: number[] = [];
  private vertexData = new Float32Array(0);
  private counters = { frames: 0, sourceFrames: 0, rasterizations: 0, glyphHits: 0, rowHits: 0, rowMisses: 0,
    evictions: 0, fontInvalidations: 0, allocations: 0, uploadBytes: 0, vertexBytes: 0, gradientUploads: 0 };
  // Nested CPU timings: rows includes newGlyphs, newCells and atlasUpload.
  // They are diagnostics, not independent GPU durations to add together.
  private timings = { rowsMs: 0, newGlyphsMs: 0, newCellsMs: 0, atlasUploadMs: 0, submitMs: 0 };

  get diagnostics() {
    return { ...this.counters, atlasBytes: this.pages.length * this.pageSize ** 2 * 4, glyphBytes: this.glyphBytes,
      targetBytes: [...this.targets.values()].reduce((total, target) => total + target.width * target.height * 4, 0),
      cells: this.cells.size, glyphs: this.glyphs.size, rows: this.retainedRows.size,
      ...(this.profile ? { timings: { ...this.timings } } : {}) };
  }

  constructor(private gl: WebGLRenderingContext, private profile = false) {
    this.maxAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    if (!this.context || this.maxAttributes < 7) throw new Error('Glyph cache unavailable');
    this.pageSize = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Glyph buffer unavailable');
    this.buffer = buffer;
    try {
      for (const [mode, taps] of [2, 24, 15].entries()) {
        const prefix = `#define GLYPH_LAYER ${mode}\n#define BLUR_TAPS ${taps}\n`;
        const horizontal = makeProgram(gl, prefix + HORIZONTAL); this.horizontal.push(horizontal); this.programs.push(horizontal);
        const vertical = makeProgram(gl, prefix + VERTICAL); this.vertical.push(vertical); this.programs.push(vertical);
      }
      this.metadata = makeProgram(gl, METADATA); this.programs.push(this.metadata);
      this.gradient = this.texture(129, 64);
    } catch (error) { this.destroy(); throw error; }
  }

  private texture(width: number, height: number, nearest = false) {
    const gl = this.gl, texture = gl.createTexture();
    if (!texture) throw new Error('Glyph texture unavailable');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.counters.allocations++;
    return texture;
  }

  private target(name: string, width: number, height: number, nearest = false) {
    const gl = this.gl, previous = this.targets.get(name);
    if (previous?.width === width && previous.height === height) return previous;
    if (previous) { gl.deleteFramebuffer(previous.framebuffer); gl.deleteTexture(previous.texture); this.targets.delete(name); }
    const texture = this.texture(width, height, nearest), framebuffer = gl.createFramebuffer();
    if (!framebuffer) { gl.deleteTexture(texture); throw new Error('Glyph target unavailable'); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture); throw new Error('Glyph target incomplete');
    }
    const target = { texture, framebuffer, width, height, activeWidth: 0, activeHeight: 0 };
    this.targets.set(name, target);
    return target;
  }

  private clear(target: Target, width = target.width, height = target.height) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    const dirtyWidth = Math.max(width, target.activeWidth), dirtyHeight = Math.max(height, target.activeHeight);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, target.height - dirtyHeight, dirtyWidth, dirtyHeight);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    target.activeWidth = width; target.activeHeight = height;
  }

  private clearAtlas() {
    this.pages.forEach(page => this.gl.deleteTexture(page.texture));
    this.pages = []; this.cells.clear(); this.rows = [];
    this.retainedRows.clear();
    this.pinned.clear();
    for (const glyph of this.glyphs.values()) { glyph.canvas.width = 0; glyph.canvas.height = 0; }
    this.glyphs.clear(); this.glyphBytes = 0;
  }

  private key(runs: OpticalRun[]) {
    const first = runs[0]!;
    return runs.map(run => `${Math.round((run.x - first.x) * 1024)}:${run.font}:${run.spacing}:${run.text}`).join('\0');
  }

  private reserve(width: number, height: number): { page: Page; slot: Rect } {
    const fit = () => {
      for (const page of this.pages) {
        const at = page.free.findIndex(rect => rect.width >= width && rect.height >= height);
        if (at < 0) continue;
        const rect = page.free.splice(at, 1)[0]!;
        if (rect.width > width) page.free.push({ x: rect.x + width, y: rect.y, width: rect.width - width, height });
        if (rect.height > height) page.free.push({ x: rect.x, y: rect.y + height, width: rect.width, height: rect.height - height });
        return { page, slot: { x: rect.x, y: rect.y, width, height } };
      }
      return undefined;
    };
    let slot = fit();
    if (slot) return slot;
    if (this.pages.length < 2) {
      this.pages.push({ texture: this.texture(this.pageSize, this.pageSize), free: [{ x: 0, y: 0, width: this.pageSize, height: this.pageSize }] });
      return fit()!;
    }
    // LRU eviction preserves all cells needed by this frame. Freed rectangles
    // merge back into the same two pages; no full-atlas reset or re-upload burst.
    for (const [key, cell] of this.cells) {
      if (this.pinned.has(key)) continue;
      this.cells.delete(key); this.counters.evictions++;
      const free = cell.page.free; free.push(cell.slot);
      let merged = true;
      while (merged) {
        merged = false;
        outer: for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
          const a = free[i]!, b = free[j]!;
          if (a.y === b.y && a.height === b.height && (a.x + a.width === b.x || b.x + b.width === a.x)) {
            free[i] = { x: Math.min(a.x, b.x), y: a.y, width: a.width + b.width, height: a.height };
          } else if (a.x === b.x && a.width === b.width && (a.y + a.height === b.y || b.y + b.height === a.y)) {
            free[i] = { x: a.x, y: Math.min(a.y, b.y), width: a.width, height: a.height + b.height };
          } else continue;
          free.splice(j, 1); merged = true; break outer;
        }
      }
      slot = fit(); if (slot) return slot;
    }
    throw new Error('Visible glyphs exceed atlas budget');
  }

  private glyph(run: OpticalRun, measure: Measure, density: number, relativeX: number) {
    // The fractional raster origin is part of glyph identity. It preserves the
    // original whole-row Canvas antialiasing when a style group is split.
    const phase = ((relativeX * density) % 1 + 1) % 1;
    const key = `${run.font}\0${run.spacing}\0${run.text}\0${Math.round(phase * 1024)}`;
    const cached = this.glyphs.get(key);
    if (cached) { this.glyphs.delete(key); this.glyphs.set(key, cached); this.counters.glyphHits++; return cached; }
    const started = this.profile ? performance.now() : 0;
    const metrics = measure(run), ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent, baseline = (ascent - descent) / 2;
    const left = (Math.floor(-Math.max(metrics.width / 2, metrics.actualBoundingBoxLeft) * density + phase) - 3 - phase) / density;
    const top = (Math.floor((baseline - metrics.actualBoundingBoxAscent) * density) - 3) / density;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil((Math.max(metrics.width / 2, metrics.actualBoundingBoxRight) - left) * density + 3));
    canvas.height = Math.max(1, Math.ceil((baseline + metrics.actualBoundingBoxDescent - top) * density + 3));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Glyph raster unavailable');
    context.setTransform(density, 0, 0, density, -left * density, -top * density);
    context.textAlign = 'center'; context.textBaseline = 'alphabetic'; context.font = run.font; context.letterSpacing = run.spacing;
    context.fillStyle = /[\p{L}\p{N}]/u.test(run.text) ? '#ffff00' : '#ff0000';
    context.fillText(run.text, 0, baseline); this.counters.rasterizations++;
    const glyph = { canvas, left, top, bytes: canvas.width * canvas.height * 4 };
    for (const [oldKey, old] of this.glyphs) {
      if (this.glyphBytes + glyph.bytes <= this.glyphBudget) break;
      this.glyphs.delete(oldKey); this.glyphBytes -= old.bytes; old.canvas.width = 0; old.canvas.height = 0;
    }
    // An oversized row still falls back to the existing renderer; never grow
    // a retained bitmap cache beyond its explicit budget.
    if (glyph.bytes > this.glyphBudget) { canvas.width = 0; canvas.height = 0; throw new Error('Glyph bitmap exceeds budget'); }
    this.glyphs.set(key, glyph); this.glyphBytes += glyph.bytes;
    if (this.profile) this.timings.newGlyphsMs += performance.now() - started;
    return glyph;
  }

  private color(value: string) {
    let color = this.colors.get(value);
    if (!color) {
      const context = this.context!;
      this.raster.width = 1; this.raster.height = 1;
      context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      color = Array.from(context.getImageData(0, 0, 1, 1).data, channel => channel / 255);
      this.colors.set(value, color);
    }
    return color;
  }

  private cell(runs: OpticalRun[], measure: Measure, density: number) {
    const first = runs[0]!;
    const key = this.key(runs);
    const cached = this.cells.get(key);
    if (cached) { this.cells.delete(key); this.cells.set(key, cached); this.counters.rowHits++; return cached; }
    const started = this.profile ? performance.now() : 0;
    this.counters.rowMisses++;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const run of runs) {
      const metrics = measure(run), ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent, baseline = (ascent - descent) / 2;
      // The legacy metric cache may have measured before textAlign became
      // center. Keep its advance as well as ink overhangs when sizing a cell.
      left = Math.min(left, run.x - first.x - Math.max(metrics.width / 2, metrics.actualBoundingBoxLeft));
      right = Math.max(right, run.x - first.x + Math.max(metrics.width / 2, metrics.actualBoundingBoxRight));
      top = Math.min(top, baseline - metrics.actualBoundingBoxAscent);
      bottom = Math.max(bottom, baseline + metrics.actualBoundingBoxDescent);
      bottom = Math.max(bottom, (ascent + descent) / 2 + 3);
    }
    left = Math.floor(left * density - 3) / density; top = Math.floor(top * density - 3) / density;
    const width = Math.max(1, Math.ceil((right - left) * density + 3));
    const height = Math.max(1, Math.ceil((bottom - top) * density + 3));
    if (width + 2 > this.pageSize || height + 2 > this.pageSize) throw new Error('Glyph row exceeds cache');
    const { page, slot } = this.reserve(width + 2, height + 2);
    const cell: Cell = { page, slot, x: slot.x + 1, y: slot.y + 1, width, height, left, top, scale: density };
    this.raster.width = width; this.raster.height = height;
    const context = this.context!;
    context.setTransform(1, 0, 0, 1, 0, 0);
    // An opaque black destination stores premultiplied R/G coverage directly.
    // Native compositing avoids two synchronous full-row pixel readbacks.
    context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
    for (const run of runs) {
      const glyph = this.glyph(run, measure, density, run.x - first.x);
      context.drawImage(glyph.canvas, Math.round((run.x - first.x + glyph.left - left) * density), Math.round((glyph.top - top) * density));
    }
    context.setTransform(density, 0, 0, density, -left * density, -top * density);
    // Lighten with blue preserves R/G, including crossings and fractional
    // edges. Repeated underline coverage still composes with source-over alpha.
    context.globalCompositeOperation = 'lighten'; context.fillStyle = '#0000ff';
    for (const run of runs) {
      const metrics = measure(run), ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
      context.fillRect(run.x - first.x - metrics.width / 2, (ascent + descent) / 2 + 2, metrics.width, 1);
    }
    context.globalCompositeOperation = 'source-over';
    const gl = this.gl;
    const uploadStarted = this.profile ? performance.now() : 0;
    gl.bindTexture(gl.TEXTURE_2D, page.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, cell.x, cell.y, gl.RGBA, gl.UNSIGNED_BYTE, this.raster);
    this.counters.uploadBytes += width * height * 4;
    this.cells.set(key, cell);
    if (this.profile) {
      this.timings.atlasUploadMs += performance.now() - uploadStarted;
      this.timings.newCellsMs += performance.now() - started;
    }
    return cell;
  }

  private buildRows(runs: OpticalRun[], measure: Measure, dpr: number, lineBounds: Map<number, { left: number; right: number }>) {
    const lines = new Map<number, OpticalRun[]>();
    for (const run of runs) {
      if (run.scale !== 1) return null;
      const line = lines.get(run.y) ?? []; line.push(run); lines.set(run.y, line);
    }
    const groups: OpticalRun[][] = [];
    for (const line of lines.values()) {
      let group: OpticalRun[] = [];
      for (const run of line) {
        const first = group[0];
        if (!first || run.color !== first.color || run.opacity !== first.opacity || run.blur !== first.blur
          || run.surface !== first.surface || run.fire !== first.fire || !!run.folded !== !!first.folded
          || !!run.ink !== !!first.ink || !!run.highlighted !== !!first.highlighted) {
          group = []; groups.push(group);
        }
        group.push(run);
      }
    }
    if (groups.length > 64) return null;
    this.pinned.clear();
    const keys = groups.map(group => this.key(group));
    for (const key of keys) this.pinned.add(key);
    const rows: Row[] = [];
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index]!, key = keys[index]!;
      const first = group[0]!;
      const bounds = lineBounds.get(Math.round(first.y * 2)) ?? { left: first.x, right: first.x + 1 };
      const color = this.color(first.color);
      let id = first.id ?? this.runIds.get(first);
      if (id === undefined) { id = this.nextRunId--; this.runIds.set(first, id); }
      const retained = this.retainedRows.get(id), cell = this.cell(group, measure, dpr * 2);
      const row = retained?.key === key ? retained.row : { runs: group, first, color, bounds, cell, energy: 1 };
      row.runs = group; row.first = first; row.color = color; row.bounds = bounds; row.cell = cell;
      row.energy = !first.surface || first.surface === 'quote' ? 1 : first.surface === 'fullText' ? .08 : .16;
      this.retainedRows.delete(id); this.retainedRows.set(id, { key, row });
      rows.push(row);
    }
    while (this.retainedRows.size > 256) this.retainedRows.delete(this.retainedRows.keys().next().value!);
    return rows;
  }

  private submit(program: Program, vertices: number[], target: Target) {
    if (!vertices.length) return;
    const gl = this.gl;
    gl.useProgram(program.program); gl.uniform2f(program.uniforms.target!, target.width, target.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (this.vertexData.length < vertices.length) {
      this.vertexData = new Float32Array(2 ** Math.ceil(Math.log2(Math.max(1024, vertices.length))));
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
    }
    this.vertexData.set(vertices);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, vertices.length));
    this.counters.vertexBytes += vertices.length * 4;
    for (let index = 0; index < this.maxAttributes; index++) gl.disableVertexAttribArray(index);
    let offset = 0;
    [2, 2, 4, 4, 2, 4, 4].forEach((size, index) => {
      const location = program.attributes[index]!;
      if (location >= 0) { gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, STRIDE * 4, offset * 4); }
      offset += size;
    });
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / STRIDE);
  }

  private paintMetadata(runs: OpticalRun[], measure: Measure, target: Target, dpr: number) {
    const vertices = this.vertices; vertices.length = 0;
    for (const run of runs) {
      if (!run.ink) continue;
      const metrics = measure(run), ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
      const chars = Array.from(run.text), halo = Math.ceil((run.blur ?? 0) * 3 + 2);
      let prefix = '', left = -metrics.width / 2;
      chars.forEach((char, index) => {
        prefix += char;
        const right = -metrics.width / 2 + measure(run, prefix).width;
        const start = left - (index === 0 ? halo : 0), end = right + (index === chars.length - 1 ? halo : 0);
        const rect = { x: (run.x + start) * dpr, y: (run.y - (ascent + descent) / 2 - halo) * dpr,
          width: (end - start) * dpr, height: (ascent + descent + halo * 2) * dpr };
        const color = [Math.round(Math.max(0, Math.min(1, run.ink![index] ?? 1)) * 255) / 255,
          ((char.codePointAt(0) || 0) * 17 + index * 53) % 251 / 255, Math.min(255, Math.round(ascent + descent)) / 255, 1];
        quad(vertices, rect, { x: 0, y: 0, width: 0, height: 0 }, [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height], [0, 0, 0, 0], rect, [0, 0, 0, 0], color);
        left = right;
      });
    }
    this.clear(target); this.submit(this.metadata, vertices, target);
  }

  draw(runs: OpticalRun[], width: number, height: number, dpr: number, shape: BendSettings, fontRevision: number,
    measure: Measure, lineBounds: Map<number, { left: number; right: number }>, sourceLeft: number, sourceWidth: number,
    changed: boolean, region?: TargetRegion): GpuGlyphSources | null {
    const gl = this.gl, revision = `${fontRevision}:${dpr}`;
    if (this.profile) for (const key of Object.keys(this.timings) as (keyof typeof this.timings)[]) this.timings[key] = 0;
    this.counters.frames++;
    gl.activeTexture(gl.TEXTURE0);
    if (revision !== this.revision) {
      if (this.revision) this.counters.fontInvalidations++;
      this.clearAtlas(); this.revision = revision; changed = true;
    }
    if (changed) {
      this.counters.sourceFrames++;
      const started = this.profile ? performance.now() : 0;
      const rows = this.buildRows(runs, measure, dpr, lineBounds);
      if (this.profile) this.timings.rowsMs = performance.now() - started;
      if (!rows) return null;
      this.rows = rows;
    }
    const submitStarted = this.profile ? performance.now() : 0;
    const fullWidth = Math.round(width * dpr), fullHeight = Math.round(height * dpr);
    const source = this.target('source', sourceWidth, fullHeight), foreground = this.target('foreground', sourceWidth, fullHeight);
    const inking = runs.some(run => run.ink?.some(progress => progress < 1));
    const contact = this.target('contact', sourceWidth, fullHeight), ink = inking ? this.target('ink', fullWidth, fullHeight, true) : undefined;
    const activeWidth = region?.activeRect.width ?? sourceWidth;
    const tiles: Tile[] = [];
    let x = 0, y = 0, rowHeight = 0, gradientFirst = 64, gradientLast = -1;
    const scratchWidth = this.pageSize;
    for (let index = 0; index < this.rows.length; index++) {
      const row = this.rows[index]!, run = row.first;
      const modes = changed ? [0, ...(run.folded || row.runs.some(item => item.ink) ? [1] : []), ...(run.folded && shape.adhesion ? [2] : [])]
        : run.folded && shape.adhesion ? [2] : [];
      if (modes.includes(2)) {
        const steps = Math.max(8, Math.min(128, Math.ceil((row.bounds.right - row.bounds.left) / 3)));
        for (let step = 0; step <= steps; step++) {
          const at = (index * 129 + step) * 4;
          const value = Math.round(liquidContactWeight(row.bounds.left + (row.bounds.right - row.bounds.left) * step / steps - width / 2,
            run.y + (shape.adhesionScroll ?? 0), shape.perlin ? shape.noisePhase ?? 0 : undefined) * 255);
          if (this.gradientData[at] !== value || this.gradientData[at + 3] !== 255) {
            gradientFirst = Math.min(gradientFirst, index); gradientLast = Math.max(gradientLast, index);
          }
          this.gradientData[at] = value;
          this.gradientData[at + 3] = 255;
        }
      }
      for (const mode of modes) {
        const sigma = mode === 0 ? .25 + Math.min(run.blur ?? 0, 2) * .1 : mode === 1 ? run.highlighted ? 0 : run.blur ?? 0 : (2.3 + (shape.adhesion ?? 0) * .65) * dpr;
        if (sigma > (mode === 2 ? 5 : 8)) return null;
        const pad = Math.ceil(sigma * 3) + 2, cell = row.cell;
        const left = Math.floor((run.x + cell.left) * dpr) - pad, top = Math.floor((run.y + cell.top) * dpr) - pad;
        const right = Math.ceil((run.x + cell.left + cell.width / cell.scale) * dpr) + pad;
        const bottom = Math.ceil((run.y + cell.top + cell.height / cell.scale) * dpr) + pad;
        if (bottom < 0 || top > fullHeight || right < sourceLeft || left > sourceLeft + activeWidth) continue;
        const tileWidth = right - left, tileHeight = bottom - top;
        if (tileWidth + 2 > scratchWidth) return null;
        if (x + tileWidth + 2 > scratchWidth) { x = 0; y += rowHeight; rowHeight = 0; }
        tiles.push({ row, mode, sigma, gradient: index, x: x + 1, y: y + 1, width: tileWidth, height: tileHeight,
          screen: { x: left, y: top, width: tileWidth, height: tileHeight } });
        x += tileWidth + 2; rowHeight = Math.max(rowHeight, tileHeight + 2);
      }
    }
    const scratchHeight = Math.max(32, Math.ceil((y + rowHeight) / 128) * 128);
    if (scratchHeight > 2048) return null;
    // Scroll changes each row's blur guard by a few pixels. Retain the larger
    // allocation instead of stalling the GPU on repeated shrink/grow cycles.
    const scratch = this.target('scratch', scratchWidth, Math.max(scratchHeight, this.targets.get('scratch')?.height ?? 0));
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(false);
    if (changed && ink) this.paintMetadata(runs, measure, ink, dpr);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.gradient);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (gradientLast >= gradientFirst) {
      const data = this.gradientData.subarray(gradientFirst * 129 * 4, (gradientLast + 1) * 129 * 4);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, gradientFirst, 129, gradientLast - gradientFirst + 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
      this.counters.uploadBytes += data.byteLength; this.counters.gradientUploads++;
    }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, ink?.texture ?? this.gradient);
    gl.activeTexture(gl.TEXTURE0);
    this.clear(scratch, scratchWidth, scratchHeight);
    for (const [mode, program] of this.horizontal.entries()) {
      if (!tiles.some(tile => tile.mode === mode)) continue;
      gl.useProgram(program.program);
      const uniforms = program.uniforms;
      gl.uniform1i(uniforms.texture!, 0); gl.uniform1i(uniforms.gradient!, 1); gl.uniform1i(uniforms.ink!, 2);
      gl.uniform2f(uniforms.resolution!, width, height); gl.uniform2f(uniforms.step!, 2 / this.pageSize, 0);
      gl.uniform1f(uniforms.dpr!, dpr); gl.uniform1f(uniforms.inking!, inking ? 1 : 0); gl.uniform1f(uniforms.contacts!, shape.contacts ? 1 : 0);
      for (const page of this.pages) {
      const vertices = this.vertices; vertices.length = 0;
      for (const tile of tiles) {
        const { row, sigma, screen } = tile, { first: run, cell } = row;
        if (tile.mode !== mode || cell.page !== page) continue;
        const uv = { x: (cell.x + (screen.x / dpr - run.x - cell.left) * cell.scale) / this.pageSize,
          y: (cell.y + (screen.y / dpr - run.y - cell.top) * cell.scale) / this.pageSize,
          width: screen.width * 2 / this.pageSize, height: screen.height * 2 / this.pageSize };
        const bounds = [cell.x / this.pageSize, cell.y / this.pageSize, (cell.x + cell.width) / this.pageSize, (cell.y + cell.height) / this.pageSize];
        const alpha = mode === 0 ? Math.min(1, Math.sqrt(run.opacity ?? 1) * row.energy * (run.fire ?? 1))
          : mode === 1 ? run.highlighted ? 1 : run.opacity ?? 1 : Math.round((run.opacity ?? 1) * 255) / 255;
        quad(vertices, tile, uv, bounds, [sigma, alpha, run.highlighted ? 1 : 0, run.folded || run.ink ? 1 : 0],
          { x: screen.x / dpr, y: screen.y / dpr, width: screen.width / dpr, height: screen.height / dpr },
          [row.bounds.left, row.bounds.right - row.bounds.left, Math.round(row.energy * 255) / 255, (tile.gradient + .5) / 64], row.color);
      }
      gl.bindTexture(gl.TEXTURE_2D, page.texture); this.submit(program, vertices, scratch);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, scratch.texture);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    for (const [mode, target] of [[0, source], [1, foreground], [2, contact]] as const) {
      if (!changed && mode !== 2) continue;
      this.clear(target, activeWidth, fullHeight);
      const program = this.vertical[mode]!;
      gl.useProgram(program.program); gl.uniform1i(program.uniforms.texture!, 0);
      gl.uniform2f(program.uniforms.step!, 0, 1 / scratch.height);
      const vertices = this.vertices; vertices.length = 0;
      for (const tile of tiles) {
        if (tile.mode !== mode) continue;
        quad(vertices, { ...tile.screen, x: tile.screen.x - sourceLeft },
          { x: tile.x / scratch.width, y: 1 - tile.y / scratch.height, width: tile.width / scratch.width, height: -tile.height / scratch.height },
          [tile.x / scratch.width, 1 - (tile.y + tile.height) / scratch.height, (tile.x + tile.width) / scratch.width, 1 - tile.y / scratch.height],
          [tile.sigma, 0, 0, 0], { x: 0, y: 0, width: 0, height: 0 }, [0, 0, 0, 0], [0, 0, 0, 0]);
      }
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, activeWidth, fullHeight);
      this.submit(program, vertices, target);
      gl.disable(gl.SCISSOR_TEST);
    }
    this.restoreState();
    if (this.profile) this.timings.submitMs = performance.now() - submitStarted;
    return { source: source.texture, foreground: foreground.texture, ...(ink ? { ink: ink.texture } : {}),
      ...(shape.adhesion ? { adhesion: contact.texture } : {}) };
  }

  restoreState() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.clearColor(0, 0, 0, 1); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    for (let index = 0; index < this.maxAttributes; index++) gl.disableVertexAttribArray(index);
  }

  destroy() {
    const gl = this.gl;
    this.clearAtlas(); this.colors.clear();
    this.targets.forEach(target => { gl.deleteFramebuffer(target.framebuffer); gl.deleteTexture(target.texture); }); this.targets.clear();
    this.programs.forEach(program => gl.deleteProgram(program.program)); this.programs = [];
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.gradient) gl.deleteTexture(this.gradient);
    this.raster.width = 0; this.raster.height = 0;
  }
}
