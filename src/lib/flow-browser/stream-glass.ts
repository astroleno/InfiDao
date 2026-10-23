import { bendSettings, type BendSettings } from './bend';
import { StreamGlyphCache, type GpuGlyphSources } from './stream-glyph-cache';
import { planTargetRegion, type StreamFramePlan, type TargetRegion } from './stream-frame-plan';
const { liquidContactWeight } = require('../../../miniprogram/flow/stream-liquid') as {
  liquidContactWeight: (x: number, materialY: number, phase?: number) => number;
};

type SurfaceFrame = { phase: number; canvas: HTMLCanvasElement };
type SurfacePair = { current: SurfaceFrame; next: SurfaceFrame; mix: number };
type LineBounds = Map<number, { left: number; right: number }>;
type SourceWindow = { left: number; width: number; activeWidth?: number };
type TextPaint = { run: OpticalRun; metrics: TextMetrics; alpha: number; filter: string; underline?: boolean };
type TextLayer = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };
type GlassEngine = {
  gl?: WebGLRenderingContext;
  drawSource: (source: HTMLCanvasElement, foreground: HTMLCanvasElement, bend: BendSettings, ink?: HTMLCanvasElement, adhesion?: HTMLCanvasElement, sourceChanged?: boolean, surfacePair?: SurfacePair, sourceWindow?: SourceWindow) => void;
  drawGpuSource?: (sources: GpuGlyphSources, bend: BendSettings, sourceChanged: boolean, sourceWindow: SourceWindow) => void;
  destroy: () => void;
};
const { StreamGlassRenderer } = require('../../../miniprogram/flow/renderer') as {
  StreamGlassRenderer: new (canvas: HTMLCanvasElement, atlas: null, options: object) => GlassEngine;
};

export type OpticalRun = {
  id?: number; rowId?: number;
  text: string; font: string; spacing: string; color: string;
  x: number; y: number; scale: number;
  width?: number;
  folded?: boolean; opacity?: number; blur?: number; highlighted?: boolean;
  ink?: number[] | undefined;
  surface?: 'quote' | 'meaning' | 'reflection' | 'fullText';
  fire?: number;
};

/** The old glass material receives the currently visible text, not its own flow. */
export class StreamGlass {
  private source = document.createElement('canvas');
  private context = this.source.getContext('2d');
  private fallbackCanvases = new Map<string, HTMLCanvasElement>();
  private fallbackCanvas(name: string) {
    let canvas = this.fallbackCanvases.get(name);
    if (!canvas) { canvas = document.createElement('canvas'); this.fallbackCanvases.set(name, canvas); }
    return canvas;
  }
  private get foreground() { return this.fallbackCanvas('foreground'); }
  private get foregroundContext() { return this.foreground.getContext('2d'); }
  private get ink() { return this.fallbackCanvas('ink'); }
  private get inkContext() { return this.ink.getContext('2d'); }
  private get contact() { return this.fallbackCanvas('contact'); }
  private get contactContext() { return this.contact.getContext('2d'); }
  private get meniscus() { return this.fallbackCanvas('meniscus'); }
  private surfaceFrames: SurfaceFrame[] = [];
  private engine: GlassEngine | null = null;
  private size = '';
  private lost = false;
  private failed = false;
  private disposed = false;
  private metrics = new Map<string, TextMetrics>();
  private fontRevision = -1;
  private lastRuns: OpticalRun[] | undefined;
  private sourceRevision = -1;
  private lineBounds: LineBounds = new Map();
  private sourceLeft = 0;
  private sourceRight = 0;
  private sourceCropped = false;
  private sourceRegion: TargetRegion | undefined;
  private textLayers: TextLayer[] = [];
  private usedTextLayers = 0;
  private glyphCache: StreamGlyphCache | null = null;
  private glyphCacheFailed = false;
  private glyphPipeline: 'canvas' | 'cached' = 'canvas';

  get diagnostics() {
    return { pipeline: this.glyphPipeline, fontRevision: this.fontRevision, sourceRevision: this.sourceRevision,
      sourceRegion: this.sourceRegion, metrics: this.metrics.size, glyphs: this.glyphCache?.diagnostics,
      fallbackCanvasBytes: [this.source, ...this.fallbackCanvases.values(), ...this.textLayers.map(layer => layer.canvas),
        ...this.surfaceFrames.map(frame => frame.canvas)].reduce((bytes, canvas) => bytes + canvas.width * canvas.height * 4, 0) };
  }

  private paintText(context: CanvasRenderingContext2D, paint: TextPaint, filter = paint.filter) {
    const { run, metrics } = paint;
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    context.save();
    context.translate(run.x, run.y);
    context.scale(run.scale, run.scale);
    context.font = run.font;
    context.letterSpacing = run.spacing;
    context.fillStyle = run.color;
    context.globalAlpha = paint.alpha;
    context.filter = filter;
    context.fillText(run.text, 0, (ascent - descent) / 2);
    if (paint.underline) {
      context.filter = 'none';
      context.fillRect(-metrics.width / 2, (ascent + descent) / 2 + 2, metrics.width, 1);
    }
    context.restore();
  }

  private paintTextRuns(target: CanvasRenderingContext2D, paints: TextPaint[], dpr: number, batch: boolean) {
    for (let first = 0; first < paints.length;) {
      const start = paints[first]!;
      let end = first + 1;
      if (batch && start.filter !== 'none') while (end < paints.length
        && paints[end]!.run.y === start.run.y && paints[end]!.filter === start.filter) end++;
      if (end === first + 1 || this.usedTextLayers >= 64) {
        for (let i = first; i < end; i++) this.paintText(target, paints[i]!);
      } else {
        let top = Infinity, bottom = -Infinity;
        for (let i = first; i < end; i++) {
          const { run, metrics } = paints[i]!;
          const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
          const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
          const baseline = run.y + (ascent - descent) * run.scale / 2;
          const halo = Math.max(1, run.blur ?? 0) * 4 + 6;
          top = Math.min(top, baseline - metrics.actualBoundingBoxAscent * run.scale - halo);
          bottom = Math.max(bottom, baseline + metrics.actualBoundingBoxDescent * run.scale + halo);
        }
        // Integer backing-pixel origins preserve subpixel glyph rasterization.
        // Keep the exact font, opacity and blur; one filter serves the row.
        const pixelTop = Math.floor(top * dpr);
        const height = Math.max(32, Math.ceil((bottom * dpr - pixelTop) / 32) * 32);
        let layer = this.textLayers[this.usedTextLayers];
        if (!layer) {
          const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
          if (!context) {
            for (let i = first; i < end; i++) this.paintText(target, paints[i]!);
            first = end;
            continue;
          }
          layer = { canvas, context };
          this.textLayers.push(layer);
        }
        this.usedTextLayers++;
        if (layer.canvas.width !== this.source.width) layer.canvas.width = this.source.width;
        if (layer.canvas.height !== height) layer.canvas.height = height;
        const context = layer.context;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        context.setTransform(dpr, 0, 0, dpr, -this.sourceLeft, -pixelTop);
        context.textAlign = 'center';
        context.textBaseline = 'alphabetic';
        for (let i = first; i < end; i++) this.paintText(context, paints[i]!, 'none');
        target.save();
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.globalAlpha = 1;
        target.filter = start.filter;
        target.drawImage(layer.canvas, 0, pixelTop);
        target.restore();
      }
      first = end;
    }
  }

  private releaseTextLayers() {
    for (const { canvas } of this.textLayers) { canvas.width = 0; canvas.height = 0; }
    this.textLayers = [];
    this.usedTextLayers = 0;
  }

  private measure(run: OpticalRun, text = run.text) {
    const key = `${run.font}\0${run.spacing}\0${text}`;
    let metrics = this.metrics.get(key);
    if (!metrics) {
      this.context!.font = run.font;
      this.context!.letterSpacing = run.spacing;
      metrics = this.context!.measureText(text);
      if (this.metrics.size >= 2048) this.metrics.delete(this.metrics.keys().next().value!);
      this.metrics.set(key, metrics);
    }
    return metrics;
  }

  private fitSource(runs: OpticalRun[], width: number, height: number, dpr: number, crop: boolean) {
    const full = Math.round(width * dpr);
    let left = 0, right = full;
    if (crop && !runs.length) right = 1;
    if (crop && runs.length) {
      let low = width, high = 0;
      for (const run of runs) {
        const metrics = this.measure(run);
        const halo = Math.max(16, Math.max(1, run.blur ?? 0) * 4 + 6);
        low = Math.min(low, run.x - Math.max(metrics.width / 2, metrics.actualBoundingBoxLeft || 0) * run.scale - halo);
        high = Math.max(high, run.x + Math.max(metrics.width / 2, metrics.actualBoundingBoxRight || 0) * run.scale + halo);
      }
      // Integer backing pixels retain original raster positions. The active
      // window can contract even after a wide entrance grew its allocation.
      left = Math.min(full - 1, Math.max(0, Math.floor(low * dpr / 128) * 128));
      right = Math.min(full, Math.max(left + 1, Math.ceil(high * dpr / 128) * 128));
    }
    this.sourceLeft = left;
    this.sourceRight = Math.max(left + 1, right);
    this.sourceCropped = crop;
    this.sourceRegion = planTargetRegion(this.sourceRegion, {
      x: left, y: 0, width: this.sourceRight - left, height: Math.round(height * dpr),
    });
    this.sourceRegion.capacity.width = Math.min(full, this.sourceRegion.capacity.width);
    this.sourceRegion.capacity.height = Math.round(height * dpr);
  }

  private prepareFallback(width: number, height: number, dpr: number, inking: boolean, adhering: boolean) {
    const pixels = this.sourceRegion!.capacity.width, rows = Math.round(height * dpr);
    for (const canvas of [this.source, this.foreground, ...(adhering ? [this.contact] : [])]) {
      if (canvas.width !== pixels) canvas.width = pixels;
      if (canvas.height !== rows) canvas.height = rows;
    }
    if (inking) {
      if (this.ink.width !== Math.round(width * dpr)) this.ink.width = Math.round(width * dpr);
      if (this.ink.height !== rows) this.ink.height = rows;
    }
  }

  private releaseFallback() {
    this.releaseTextLayers();
    this.source.width = 1; this.source.height = 1;
    if (this.context) { this.context.textAlign = 'center'; this.context.textBaseline = 'alphabetic'; }
    for (const canvas of this.fallbackCanvases.values()) { canvas.width = 0; canvas.height = 0; }
    this.fallbackCanvases.clear();
    for (const frame of this.surfaceFrames) { frame.canvas.width = 0; frame.canvas.height = 0; }
    this.surfaceFrames = [];
  }

  private paintSurface(runs: OpticalRun[], width: number, height: number, dpr: number,
    shape: BendSettings, lineBounds: LineBounds, target: HTMLCanvasElement) {
    const ink = this.contactContext!;
    ink.setTransform(1, 0, 0, 1, 0, 0);
    ink.clearRect(0, 0, this.contact.width, this.contact.height);
    ink.setTransform(dpr, 0, 0, dpr, -this.sourceLeft, 0);
    ink.textAlign = 'center';
    ink.textBaseline = 'alphabetic';
    const contactLines = new Map<number, number[]>();
    for (const run of runs) {
      if (!run.folded || !/[\p{L}\p{N}]/u.test(run.text)) continue;
      const metrics = this.measure(run);
      const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
      const baseline = run.y + (ascent - descent) * run.scale / 2;
      if (baseline + metrics.actualBoundingBoxDescent * run.scale < -2
        || baseline - metrics.actualBoundingBoxAscent * run.scale > height + 2) continue;
      const energy = !run.surface || run.surface === 'quote' ? 1 : run.surface === 'fullText' ? .08 : .16;
      ink.save();
      ink.translate(run.x, run.y);
      ink.scale(run.scale, run.scale);
      ink.font = run.font;
      ink.letterSpacing = run.spacing;
      if (run.ink) {
        // Let each newly revealed character join the film once its original
        // ink animation finishes. Never illuminate an unrevealed neighbour,
        // or remove the film from already settled words elsewhere on the page.
        ink.beginPath();
        let prefix = '', left = -metrics.width / 2;
        Array.from(run.text).forEach((char, index, chars) => {
          prefix += char;
          const right = -metrics.width / 2 + this.measure(run, prefix).width;
          if ((run.ink![index] ?? 1) >= 1) {
            const start = left - (index === 0 ? 3 : 0), end = right + (index === chars.length - 1 ? 3 : 0);
            ink.rect(start, -(ascent + descent) / 2 - 3, end - start, ascent + descent + 6);
          }
          left = right;
        });
        ink.clip();
      }
      // Preserve the original glyph mask, colour stops and whole-mask blur.
      const bounds = lineBounds.get(Math.round(run.y * 2))!;
      const lineWidth = Math.max(1, bounds.right - bounds.left);
      const edge = Math.min(.30, 28 / lineWidth);
      const gradient = ink.createLinearGradient((bounds.left - run.x) / run.scale, 0, (bounds.right - run.x) / run.scale, 0);
      const color = (blue: number) => `rgb(${Math.round((run.opacity ?? 1) * 255)}, ${Math.round(energy * 255)}, ${blue})`;
      if (shape.contacts) {
        const steps = Math.max(8, Math.min(128, Math.ceil(lineWidth / 3)));
        const materialY = run.y + (shape.adhesionScroll ?? 0);
        let weights = contactLines.get(run.y);
        if (!weights) {
          weights = Array.from({ length: steps + 1 }, (_, step) => Math.round(liquidContactWeight(
            bounds.left + lineWidth * step / steps - width / 2, materialY,
            shape.perlin ? shape.noisePhase ?? 0 : undefined) * 255));
          contactLines.set(run.y, weights);
        }
        const left = run.x - Math.max(metrics.width / 2, metrics.actualBoundingBoxLeft) * run.scale - 3;
        const right = run.x + Math.max(metrics.width / 2, metrics.actualBoundingBoxRight) * run.scale + 3;
        const first = Math.max(0, Math.min(steps, Math.floor((left - bounds.left) / lineWidth * steps) - 1));
        const last = Math.max(first, Math.min(steps, Math.ceil((right - bounds.left) / lineWidth * steps) + 1));
        for (let step = first; step <= last; step++) gradient.addColorStop(step / steps, color(weights[step]!));
      } else {
        gradient.addColorStop(0, color(255));
        gradient.addColorStop(edge, color(0));
        gradient.addColorStop(1 - edge, color(0));
        gradient.addColorStop(1, color(255));
      }
      ink.fillStyle = gradient;
      ink.fillText(run.text, 0, (ascent - descent) / 2);
      ink.restore();
    }
    if (target.width !== this.contact.width || target.height !== this.contact.height) {
      target.width = this.contact.width;
      target.height = this.contact.height;
    }
    const meniscus = target.getContext('2d')!;
    meniscus.setTransform(1, 0, 0, 1, 0, 0);
    meniscus.clearRect(0, 0, target.width, target.height);
    const radius = shape.liquid ? 2.3 + (shape.adhesion ?? 0) * .65 : 2.6 + (shape.adhesion ?? 0);
    meniscus.filter = `blur(${radius * dpr}px)`;
    meniscus.drawImage(this.contact, 0, 0);
    meniscus.filter = 'none';
  }

  private surfacePair(runs: OpticalRun[], width: number, height: number, dpr: number,
    shape: BendSettings, lineBounds: LineBounds): SurfacePair {
    // Only the slowly changing contact mask is interpolated. Geometry, normals,
    // refraction and caustics still use the exact current phase every frame.
    // Two nearby phases preserve the full-resolution mask without repainting
    // and uploading it at display frequency. Storage stays bounded to two.
    const step = .02, position = (shape.noisePhase ?? 0) / step;
    const lower = Math.floor(position), upper = lower + 1;
    const frameAt = (phase: number) => {
      const cached = this.surfaceFrames.find(frame => frame.phase === phase);
      if (cached) return cached;
      let slot = this.surfaceFrames.findIndex(frame => frame.phase !== lower && frame.phase !== upper);
      if (slot < 0) slot = this.surfaceFrames.length;
      const canvas = this.surfaceFrames[slot]?.canvas ?? document.createElement('canvas');
      this.paintSurface(runs, width, height, dpr, { ...shape, noisePhase: phase * step }, lineBounds, canvas);
      // A fresh object also invalidates the GPU slot when a canvas is reused.
      const frame = { phase, canvas };
      this.surfaceFrames[slot] = frame;
      return frame;
    };
    return { current: frameAt(lower), next: frameAt(upper), mix: position - lower };
  }

  constructor(private canvas: HTMLCanvasElement, private invalidate: () => void, private profile = false) {
    // Only a tiny measuring surface is needed by the GPU path.
    this.source.width = 1; this.source.height = 1;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    // Release the instance while the context is lost. Its handles are invalid
    // after restoration and must never be deleted from the new context.
    this.glyphCache?.destroy(); this.glyphCache = null;
    this.engine?.destroy();
    this.engine = null;
    this.releaseTextLayers();
    this.size = '';
    this.canvas.style.visibility = 'hidden';
    this.canvas.dataset.optics = 'lost';
    this.invalidate();
  };

  private onRestored = () => {
    this.lost = false;
    this.failed = false;
    this.glyphCacheFailed = false;
    this.invalidate();
  };

  draw(runs: OpticalRun[], width: number, height: number, reducedMotion: boolean, shape = bendSettings(width, height), fontRevision = 0, frame?: StreamFramePlan) {
    if (this.disposed || this.lost || this.failed) return;
    if (reducedMotion) {
      this.canvas.style.visibility = 'hidden';
      this.canvas.dataset.optics = 'reduced';
      return;
    }
    const context = this.context;
    if (!context || width < 1 || height < 1) return;
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_000_000 / (width * height)));
      const size = `${width}:${height}:${dpr}`;
      if (this.size !== size) {
        this.glyphCache?.destroy(); this.glyphCache = null;
        this.glyphCacheFailed = false; this.glyphPipeline = 'canvas';
        this.engine?.destroy();
        this.releaseTextLayers();
        this.engine = new StreamGlassRenderer(this.canvas, null, {
          width, height, dpr, refractionScale: .75, opticalProfile: true, bend: true, streamReadability: true, streamDispersion: 1,
          // The final pass covers the whole viewport. Glyph antialiasing is
          // already in the source textures; multisampling this quad adds none.
          antialias: false, preserveDrawingBuffer: false,
          powerPreference: shape.liquid ? 'high-performance' : 'default',
          reducedMotion: false, edgeFadeStart: .82,
          timeline: { position: 0, rowOffset: 0, loop: false, ambientPhase: 0, lastTime: null },
        });
        this.size = size;
        this.sourceCropped = false;
        this.sourceRegion = undefined;
        this.lastRuns = undefined;
      }
      if (this.fontRevision !== fontRevision) {
        this.metrics.clear();
        this.fontRevision = fontRevision;
        this.lastRuns = undefined;
      }
      // Retained rows carry an explicit source version. Legacy callers may
      // still supply a new run list; neither path confuses layout with fonts.
      let sourceChanged = this.lastRuns !== runs || (frame !== undefined && this.sourceRevision !== frame.sourceRevision) || this.sourceCropped !== !!shape.liquid;
      if (sourceChanged) this.fitSource(runs, width, height, dpr, !!shape.liquid);
      if (sourceChanged) for (const frame of this.surfaceFrames) frame.phase = NaN;
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      const inking = runs.some(run => run.ink?.some(progress => progress < 1));
      const sourcePaints: TextPaint[] = [], foregroundPaints: TextPaint[] = [];
      this.usedTextLayers = 0;
      const adhering = !!shape.adhesion;
      const lineBounds = sourceChanged ? new Map<number, { left: number; right: number }>() : this.lineBounds;
      if (adhering && sourceChanged) for (const run of runs) {
        if (!/[\p{L}\p{N}]/u.test(run.text)) continue;
        const key = Math.round(run.y * 2);
        const half = (run.width ?? 0) * run.scale / 2;
        const leadingText = run.text.match(/^[\p{P}\s]+/u)?.[0];
        const trailingText = run.text.match(/[\p{P}\s]+$/u)?.[0];
        const leading = leadingText ? this.measure(run, leadingText).width * run.scale : 0;
        const trailing = trailingText ? this.measure(run, trailingText).width * run.scale : 0;
        const previous = lineBounds.get(key);
        lineBounds.set(key, { left: Math.min(previous?.left ?? Infinity, run.x - half + leading),
          right: Math.max(previous?.right ?? -Infinity, run.x + half - trailing) });
      }
      const sourceWindow = { left: this.sourceLeft / Math.round(width * dpr), width: this.sourceRegion!.capacity.width / Math.round(width * dpr),
        activeWidth: this.sourceRegion!.activeRect.width / Math.round(width * dpr) };
      if (shape.liquid && this.engine?.gl && this.engine.drawGpuSource && !this.glyphCacheFailed) {
        try {
          this.glyphCache ??= new StreamGlyphCache(this.engine.gl, this.profile);
          const changed = sourceChanged || this.glyphPipeline !== 'cached';
          const sources = this.glyphCache.draw(runs, width, height, dpr, shape, fontRevision,
            (run, text) => this.measure(run, text), lineBounds, this.sourceLeft, this.sourceRegion!.capacity.width, changed, this.sourceRegion);
          if (sources) {
            this.engine.drawGpuSource(sources, shape, changed, sourceWindow);
            if (this.glyphPipeline !== 'cached') this.releaseFallback();
            this.lastRuns = runs; this.sourceRevision = frame?.sourceRevision ?? -1; this.lineBounds = lineBounds; this.glyphPipeline = 'cached';
            this.canvas.dataset.glyphs = 'cached';
            if (this.canvas.style.visibility !== 'visible') this.canvas.style.visibility = 'visible';
            if (this.canvas.dataset.optics !== 'ready') this.canvas.dataset.optics = 'ready';
            return;
          }
          this.glyphCache.restoreState();
        } catch {
          this.glyphCache?.restoreState(); this.glyphCache?.destroy(); this.glyphCache = null;
          this.glyphCacheFailed = true;
        }
      }
      // Unsupported rows or an unavailable GPU cache retain the original
      // Canvas path, including focus underlines and the original ink masks.
      if (this.glyphPipeline === 'cached') sourceChanged = true;
      this.prepareFallback(width, height, dpr, inking, adhering);
      const foreground = this.foregroundContext, ink = inking ? this.inkContext : null;
      if (!foreground || (inking && !ink)) throw new Error('Canvas glyph fallback unavailable');
      for (const target of [context, foreground]) {
        if (sourceChanged) { target.setTransform(1, 0, 0, 1, 0, 0); target.clearRect(0, 0, this.source.width, this.source.height); }
        target.setTransform(dpr, 0, 0, dpr, -this.sourceLeft, 0);
        target.textAlign = 'center'; target.textBaseline = 'alphabetic';
      }
      this.glyphPipeline = 'canvas'; this.canvas.dataset.glyphs = 'canvas';
      // The immutable run list also owns reveal progress. Surface-only motion
      // can reuse this metadata, even while a paused character is unfinished.
      if (ink && sourceChanged) {
        ink.setTransform(dpr, 0, 0, dpr, 0, 0);
        ink.clearRect(0, 0, width, height);
        ink.textAlign = 'center';
        ink.textBaseline = 'alphabetic';
      }
      if (sourceChanged) for (const run of runs) {
        const metrics = this.measure(run);
        const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
        const baseline = run.y + (ascent - descent) * run.scale / 2;
        const halo = Math.max(1, run.blur ?? 0) * 4 + 2;
        if (baseline + (Math.max(descent, metrics.actualBoundingBoxDescent) + 3) * run.scale + halo < 0
          || baseline - Math.max(ascent, metrics.actualBoundingBoxAscent) * run.scale - halo > height) continue;
        const energy = !run.surface || run.surface === 'quote' ? 1 : run.surface === 'fullText' ? .08 : .16;
        if (sourceChanged) {
          // The quotation supplies the fire; explanatory prose stays on the
          // reading plane with only a quiet trace of transmitted light.
          sourcePaints.push({ run, metrics,
            alpha: Math.min(1, Math.sqrt(run.opacity ?? 1) * energy * (run.fire ?? 1)),
            filter: `blur(${.25 + Math.min(run.blur ?? 0, 2) * .1}px)` });
        }
        if (run.ink && ink) {
          // Ownership rectangles never overlap neighbouring glyphs. Only their
          // progress is masked; the source texture supplies the actual strokes.
          ink.save();
          ink.translate(run.x, run.y);
          ink.scale(run.scale, run.scale);
          const chars = Array.from(run.text), halo = Math.ceil((run.blur ?? 0) * 3 + 2);
          let prefix = '', left = -metrics.width / 2;
          chars.forEach((char, index) => {
            prefix += char;
            const right = -metrics.width / 2 + this.measure(run, prefix).width;
            const start = left - (index === 0 ? halo : 0), end = right + (index === chars.length - 1 ? halo : 0);
            const progress = Math.round(Math.max(0, Math.min(1, run.ink![index] ?? 1)) * 255);
            const seed = ((char.codePointAt(0) || 0) * 17 + index * 53) % 251;
            ink.fillStyle = `rgb(${progress}, ${seed}, ${Math.min(255, Math.round(ascent + descent))})`;
            ink.fillRect(start, -(ascent + descent) / 2 - halo, end - start, ascent + descent + halo * 2);
            left = right;
          });
          ink.restore();
        }
        if (sourceChanged && (run.folded || run.ink)) {
          foregroundPaints.push({ run, metrics, alpha: run.highlighted ? 1 : run.opacity ?? 1,
            filter: run.highlighted || !run.blur ? 'none' : `blur(${run.blur}px)`, underline: !!run.highlighted });
        }
      }
      this.paintTextRuns(context, sourcePaints, dpr, !!shape.liquid);
      this.paintTextRuns(foreground, foregroundPaints, dpr, !!shape.liquid);
      const pair = adhering && shape.perlin && shape.liquid && !sourceChanged
        ? this.surfacePair(runs, width, height, dpr, shape, lineBounds) : undefined;
      if (adhering && !pair) this.paintSurface(runs, width, height, dpr, shape, lineBounds, this.meniscus);
      this.engine?.drawSource(this.source, this.foreground, shape, inking ? this.ink : undefined,
        adhering ? pair?.current.canvas ?? this.meniscus : undefined, sourceChanged, pair,
        sourceWindow);
      this.lastRuns = runs;
      this.sourceRevision = frame?.sourceRevision ?? -1;
      this.lineBounds = lineBounds;
      if (this.canvas.style.visibility !== 'visible') this.canvas.style.visibility = 'visible';
      // This attribute controls descendant selectors across the whole reader.
      if (this.canvas.dataset.optics !== 'ready') this.canvas.dataset.optics = 'ready';
    } catch {
      this.glyphCache?.destroy(); this.glyphCache = null;
      this.engine?.destroy();
      this.engine = null;
      this.releaseTextLayers();
      this.failed = true;
      this.canvas.style.visibility = 'hidden';
      this.canvas.dataset.optics = 'unavailable';
      this.invalidate();
    }
  }

  destroy() {
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.glyphCache?.destroy(); this.glyphCache = null;
    this.engine?.destroy();
    this.engine = null;
    this.releaseTextLayers();
    this.metrics.clear();
    this.lastRuns = undefined;
    this.lineBounds.clear();
    this.source.width = 0;
    this.source.height = 0;
    for (const canvas of this.fallbackCanvases.values()) { canvas.width = 0; canvas.height = 0; }
    this.fallbackCanvases.clear();
    for (const frame of this.surfaceFrames) { frame.canvas.width = 0; frame.canvas.height = 0; }
    this.surfaceFrames = [];
  }
}
