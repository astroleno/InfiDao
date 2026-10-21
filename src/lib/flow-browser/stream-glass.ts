import { bendSettings, type BendSettings } from './bend';

type GlassEngine = { drawSource: (source: HTMLCanvasElement, foreground: HTMLCanvasElement, bend: BendSettings, ink?: HTMLCanvasElement) => void; destroy: () => void };
const { StreamGlassRenderer } = require('../../../miniprogram/flow/renderer') as {
  StreamGlassRenderer: new (canvas: HTMLCanvasElement, atlas: null, options: object) => GlassEngine;
};

export type OpticalRun = {
  text: string; font: string; spacing: string; color: string;
  x: number; y: number; scale: number;
  folded?: boolean; opacity?: number; blur?: number; highlighted?: boolean;
  ink?: number[];
  surface?: 'quote' | 'meaning' | 'reflection' | 'fullText';
};

/** The old glass material receives the currently visible text, not its own flow. */
export class StreamGlass {
  private source = document.createElement('canvas');
  private context = this.source.getContext('2d');
  private foreground = document.createElement('canvas');
  private foregroundContext = this.foreground.getContext('2d');
  private ink = document.createElement('canvas');
  private inkContext = this.ink.getContext('2d');
  private engine: GlassEngine | null = null;
  private size = '';
  private lost = false;
  private failed = false;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, private invalidate: () => void) {
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    // Release the instance while the context is lost. Its handles are invalid
    // after restoration and must never be deleted from the new context.
    this.engine?.destroy();
    this.engine = null;
    this.size = '';
    this.canvas.style.visibility = 'hidden';
    this.canvas.dataset.optics = 'lost';
  };

  private onRestored = () => {
    this.lost = false;
    this.failed = false;
    this.invalidate();
  };

  draw(runs: OpticalRun[], width: number, height: number, reducedMotion: boolean) {
    if (this.disposed || this.lost || this.failed) return;
    if (reducedMotion) {
      this.canvas.style.visibility = 'hidden';
      this.canvas.dataset.optics = 'reduced';
      return;
    }
    const context = this.context, foreground = this.foregroundContext, ink = this.inkContext;
    if (!context || !foreground || !ink || width < 1 || height < 1) return;
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_000_000 / (width * height)));
      const size = `${width}:${height}:${dpr}`;
      if (this.size !== size) {
        this.engine?.destroy();
        this.engine = new StreamGlassRenderer(this.canvas, null, {
          width, height, dpr, refractionScale: .75, opticalProfile: true, bend: true, streamReadability: true, streamDispersion: 1,
          reducedMotion: false, edgeFadeStart: .82,
          timeline: { position: 0, rowOffset: 0, loop: false, ambientPhase: 0, lastTime: null },
        });
        this.source.width = Math.round(width * dpr);
        this.source.height = Math.round(height * dpr);
        this.foreground.width = this.source.width;
        this.foreground.height = this.source.height;
        this.ink.width = this.source.width;
        this.ink.height = this.source.height;
        this.size = size;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      foreground.setTransform(dpr, 0, 0, dpr, 0, 0);
      foreground.clearRect(0, 0, width, height);
      foreground.textAlign = 'center';
      foreground.textBaseline = 'alphabetic';
      const inking = runs.some(run => run.ink?.some(progress => progress < 1));
      if (inking) {
        ink.setTransform(dpr, 0, 0, dpr, 0, 0);
        ink.clearRect(0, 0, width, height);
      }
      for (const run of runs) {
        context.save();
        context.translate(run.x, run.y);
        context.scale(run.scale, run.scale);
        context.font = run.font;
        if ('letterSpacing' in context) (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = run.spacing;
        context.fillStyle = run.color;
        // The quotation supplies the fire; explanatory prose stays on the
        // reading plane with only a quiet trace of transmitted light.
        const energy = !run.surface || run.surface === 'quote' ? 1 : run.surface === 'fullText' ? .08 : .16;
        context.globalAlpha = Math.sqrt(run.opacity ?? 1) * energy;
        context.filter = `blur(${.25 + Math.min(run.blur ?? 0, 2) * .1}px)`;
        const metrics = context.measureText(run.text);
        const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
        context.fillText(run.text, 0, (ascent - descent) / 2);
        if (run.ink) {
          // Ownership rectangles never overlap neighbouring glyphs. Only their
          // progress is masked; the source texture supplies the actual strokes.
          ink.save();
          ink.translate(run.x, run.y);
          ink.scale(run.scale, run.scale);
          const chars = Array.from(run.text), halo = Math.ceil((run.blur ?? 0) * 3 + 2);
          let prefix = '', left = -metrics.width / 2;
          chars.forEach((char, index) => {
            prefix += char;
            const right = -metrics.width / 2 + context.measureText(prefix).width;
            const start = left - (index === 0 ? halo : 0), end = right + (index === chars.length - 1 ? halo : 0);
            const progress = Math.round(Math.max(0, Math.min(1, run.ink![index] ?? 1)) * 255);
            const seed = ((char.codePointAt(0) || 0) * 17 + index * 53) % 251;
            ink.fillStyle = `rgb(${progress}, ${seed}, ${Math.min(255, Math.round(ascent + descent))})`;
            ink.fillRect(start, -(ascent + descent) / 2 - halo, end - start, ascent + descent + halo * 2);
            left = right;
          });
          ink.restore();
        }
        context.restore();
        if (run.folded || run.ink) {
          foreground.save();
          foreground.translate(run.x, run.y);
          foreground.scale(run.scale, run.scale);
          foreground.font = run.font;
          foreground.letterSpacing = run.spacing;
          foreground.fillStyle = run.color;
          foreground.globalAlpha = run.highlighted ? 1 : run.opacity ?? 1;
          foreground.filter = run.highlighted || !run.blur ? 'none' : `blur(${run.blur}px)`;
          foreground.fillText(run.text, 0, (ascent - descent) / 2);
          if (run.highlighted) {
            foreground.filter = 'none';
            foreground.fillRect(-metrics.width / 2, (ascent + descent) / 2 + 2, metrics.width, 1);
          }
          foreground.restore();
        }
      }
      this.engine?.drawSource(this.source, this.foreground, bendSettings(width, height), inking ? this.ink : undefined);
      this.canvas.style.visibility = 'visible';
      this.canvas.dataset.optics = 'ready';
    } catch {
      this.engine?.destroy();
      this.engine = null;
      this.failed = true;
      this.canvas.style.visibility = 'hidden';
      this.canvas.dataset.optics = 'unavailable';
    }
  }

  destroy() {
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.engine?.destroy();
    this.engine = null;
    this.source.width = 0;
    this.source.height = 0;
    this.foreground.width = 0;
    this.foreground.height = 0;
    this.ink.width = 0;
    this.ink.height = 0;
  }
}
