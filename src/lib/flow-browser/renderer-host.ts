import type { FlowFrame } from '@/lib/flow/contracts';
import type { ReadingSnapshot } from './storage';
import { crossedDragThreshold, isPrimaryPointer, pointerLocalPoint } from './pointer';

type Hit = { frameId: string; anchorId: string; selection: { start: number; end: number; textHash: string; corpusVersion: string }; label: string; left: number; right: number; top: number; bottom: number };
type SlotFrame = FlowFrame & { passageId: string; lineStart: number; lineIndex: number; centerOffset: number; occurrence?: number };
type HostCallbacks = {
  onSelect: (hit: Hit) => void;
  onPreview: (hit: Hit | null) => void;
  onPauseChange: (paused: boolean) => void;
  onActiveChange: (frame: FlowFrame) => void;
  onSnapshot: (snapshot: ReadingSnapshot) => void;
  onError: (error: Error) => void;
  onReady?: () => void;
};
type PointerEventLike = Pick<PointerEvent, 'clientX' | 'clientY' | 'pointerId' | 'button' | 'timeStamp'> & Partial<Pick<PointerEvent, 'isPrimary'>>;
type Gesture = { pointerId: number; x: number; y: number; lastX: number; lastY: number; lastTime: number; hit: Hit | null; moved: boolean; paused: boolean };

const { FlowTimeline, CELL, CENTER_PHASE } = require('../../../shared/flow/timeline') as {
  FlowTimeline: new (count: number) => any;
  CELL: number;
  CENTER_PHASE: number;
};
const { RibbonWindow, SLOT_COUNT } = require('../../../shared/flow/ribbon-window') as {
  RibbonWindow: new (lines: SlotFrame[], cursor?: number, snapshot?: unknown, origin?: number) => any;
  SLOT_COUNT: number;
};
const { readingLines, sceneMetrics, CENTER_SCALE } = require('../../../shared/flow/scene') as {
  readingLines: (frames: FlowFrame[]) => SlotFrame[];
  sceneMetrics: (width: number, height: number) => { pitch: number; radius: number; scrollPitch: number; fontSize: number };
  CENTER_SCALE: number;
};
const { WheelRenderer } = require('../../../miniprogram/flow/renderer') as { WheelRenderer: new (...args: any[]) => any };

const MAX_BACKING_PIXELS = 2_500_000;
const DRAG_THRESHOLD = 7;

export function backingPixelRatio(width: number, height: number, deviceRatio: number, maxPixels = MAX_BACKING_PIXELS) {
  const area = Math.max(1, width * height);
  // Solve (width * ratio + .5) * (height * ratio + .5) <= budget,
  // including rounding of each backing dimension at very large viewport sizes.
  const margin = (width + height) / 2;
  const budgetRatio = 2 * (maxPixels - 0.25) / (margin + Math.sqrt(margin ** 2 + 4 * area * (maxPixels - 0.25)));
  return Math.min(deviceRatio > 0 ? deviceRatio : 1, 2, budgetRatio);
}

export function browserFontSize(width: number, height: number) {
  const metrics = sceneMetrics(width, height);
  if (width <= height) return metrics.fontSize;
  // The native scene assumes a tall phone. In a short viewport its camera is
  // closer to the cylinder: compressing only tracking makes long lines overlap.
  // Fit up to ten glyphs (the shared line limit) inside the focused front arc.
  const camera = height / 2;
  const focusedWidth = metrics.radius * 1.64;
  const fit = focusedWidth / 10 * (camera - metrics.radius) / camera / CENTER_SCALE;
  return Math.min(metrics.fontSize, fit);
}

function createCanvasBridge(canvas: HTMLCanvasElement) {
  return {
    get width() { return canvas.width; },
    set width(value: number) { canvas.width = value; },
    get height() { return canvas.height; },
    set height(value: number) { canvas.height = value; },
    getContext: (type: string, options?: WebGLContextAttributes) => canvas.getContext(type as 'webgl', options),
    requestAnimationFrame: (callback: FrameRequestCallback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (id: number) => window.cancelAnimationFrame(id),
  };
}

export class FlowRendererHost {
  private readonly canvas: HTMLCanvasElement;
  private readonly atlasCanvas: HTMLCanvasElement;
  private readonly callbacks: HostCallbacks;
  private reducedMotion: boolean;
  private frames: FlowFrame[];
  private timeline: any;
  private ribbon: any;
  private renderer: any;
  private observer: ResizeObserver | null = null;
  private gesture: Gesture | null = null;
  private paused: boolean;
  private destroyed = false;
  private lastActiveId = '';
  private restoreRibbon: unknown;
  private lastSnapshotAt = 0;
  private pageHidden = false;
  private visible = document.visibilityState !== 'hidden';
  private contextLost = false;
  private settling = false;

  constructor(canvas: HTMLCanvasElement, atlasCanvas: HTMLCanvasElement, frames: FlowFrame[], options: {
    paused: boolean;
    reducedMotion: boolean;
    snapshot?: ReadingSnapshot | null;
    callbacks: HostCallbacks;
  }) {
    this.canvas = canvas;
    this.atlasCanvas = atlasCanvas;
    this.frames = frames;
    this.paused = options.reducedMotion || (options.snapshot?.paused ?? options.paused);
    this.reducedMotion = options.reducedMotion;
    this.callbacks = options.callbacks;
    this.timeline = new FlowTimeline(SLOT_COUNT);
    this.timeline.loop = true;
    this.timeline.paused = this.paused;
    this.timeline.setVisible(this.visible);
    if (options.snapshot) {
      this.timeline.position = options.snapshot.position;
      this.timeline.rowOffset = options.snapshot.rowOffset;
      this.timeline.ambientPhase = options.snapshot.ambientPhase;
      this.restoreRibbon = options.snapshot.ribbon;
    }
    this.initialize();
    this.callbacks.onPauseChange(this.paused);
    this.emitSnapshot();
    this.observer = new ResizeObserver(() => this.initialize());
    this.observer.observe(canvas);
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onPageShow);
  }

  private initialize() {
    if (this.destroyed || this.contextLost) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (this.settling) {
      this.settling = false;
      this.paused = true;
      this.timeline.paused = true;
      this.callbacks.onPauseChange(true);
    }
    const previousSnapshot = this.ribbon?.snapshot() || this.restoreRibbon;
    const cursor = this.cursor();
    this.clearGesture();
    try {
      this.renderer?.destroy();
      const dpr = backingPixelRatio(rect.width, rect.height, window.devicePixelRatio || 1);
      const metrics = sceneMetrics(rect.width, rect.height);
      this.ribbon = new RibbonWindow(readingLines(this.frames), cursor, previousSnapshot, this.timeline.rowOffset);
      this.restoreRibbon = undefined;
      const runtimeCanvas = createCanvasBridge(this.canvas);
      this.renderer = new WheelRenderer(runtimeCanvas, this.atlasCanvas, {
        width: rect.width,
        height: rect.height,
        dpr,
        timeline: this.timeline,
        reducedMotion: this.reducedMotion,
        onFrame: () => this.syncRows(),
        onError: (error: Error) => this.fail(error),
      });
      this.renderer.borderless = true;
      this.renderer.scrollPitch = metrics.scrollPitch;
      this.renderer.fontSize = browserFontSize(rect.width, rect.height);
      this.renderer.reading = this.paused ? 1 : 0;
      this.drawRows();
      if (!this.paused && this.visible) this.renderer.start();
      this.callbacks.onReady?.();
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error('WEBGL_UNAVAILABLE'));
    }
  }

  private cursor() {
    return this.timeline.position / CELL - CENTER_PHASE + this.timeline.rowOffset;
  }

  private visibleGuard() {
    if (!this.renderer) return 6;
    const metrics = sceneMetrics(this.renderer.width, this.renderer.height);
    return Math.ceil(Math.max(this.renderer.height / 2 - metrics.radius, metrics.pitch) / metrics.pitch) + 1;
  }

  private drawRows() {
    if (!this.renderer || !this.ribbon || this.contextLost) return;
    const rows = this.ribbon.frames(this.cursor()) as Array<SlotFrame | undefined>;
    this.timeline.centers = rows.map(line => line?.centerOffset || 0);
    this.renderer.setFrames(rows as SlotFrame[]);
    this.notifyActive(rows);
  }

  private syncRows() {
    if (!this.ribbon || !this.renderer || this.destroyed) return;
    const cursor = this.cursor();
    const changed = this.ribbon.refresh(cursor);
    const rows = this.ribbon.frames(cursor) as Array<SlotFrame | undefined>;
    if (changed) {
      this.timeline.centers = rows.map(line => line?.centerOffset || 0);
      this.renderer.setFrames(rows as SlotFrame[]);
    }
    this.notifyActive(rows);
    if (this.timeline.needsSettle && this.gesture === null) this.settle();
    const now = performance.now();
    if (now - this.lastSnapshotAt >= 250) {
      this.lastSnapshotAt = now;
      this.emitSnapshot();
    }
  }

  private notifyActive(rows: Array<SlotFrame | undefined>) {
    const frame = rows[this.timeline.index];
    if (frame && frame.passageId !== this.lastActiveId) {
      this.lastActiveId = frame.passageId;
      this.callbacks.onActiveChange(frame);
    }
  }

  setFrames(frames: FlowFrame[]) {
    if (this.destroyed) return;
    this.frames = frames;
    const lines = readingLines(frames);
    if (!this.ribbon) {
      this.initialize();
      return;
    }
    this.ribbon.update(lines, this.cursor(), this.visibleGuard());
    try { this.drawRows(); } catch (error) { this.fail(error as Error); }
  }

  switchChain(frames: FlowFrame[], snapshot: ReadingSnapshot | null, reducedMotion = this.reducedMotion) {
    if (this.destroyed) return;
    this.renderer?.stop();
    this.settling = false;
    this.clearGesture();
    this.frames = frames;
    this.timeline.position = snapshot?.position ?? CELL * CENTER_PHASE;
    this.timeline.rowOffset = snapshot?.rowOffset ?? 0;
    this.timeline.ambientPhase = snapshot?.ambientPhase ?? 0;
    this.paused = !this.renderer || this.contextLost || reducedMotion || (snapshot?.paused ?? false);
    this.timeline.paused = this.paused;
    this.ribbon = new RibbonWindow(readingLines(frames), this.cursor(), snapshot?.ribbon, this.timeline.rowOffset);
    this.lastActiveId = '';
    if (this.renderer && !this.contextLost) {
      this.renderer.reading = this.paused ? 1 : 0;
      try { this.drawRows(); } catch (error) { this.fail(error as Error); }
      if (!this.paused && this.visible) this.renderer?.start();
    }
    this.callbacks.onPauseChange(this.paused);
    this.emitSnapshot();
  }

  snapshot(): ReadingSnapshot {
    return {
      position: this.timeline.position,
      rowOffset: this.timeline.rowOffset,
      ambientPhase: this.timeline.ambientPhase,
      paused: this.paused,
      sourceOpen: false,
      readingPositions: {},
      ribbon: this.ribbon?.snapshot() || null,
      version: 1,
    };
  }

  private emitSnapshot() {
    this.callbacks.onSnapshot(this.snapshot());
  }

  setPaused(paused: boolean) {
    if (this.destroyed) return;
    paused = paused || !this.renderer || this.contextLost;
    this.clearGesture();
    this.settling = false;
    this.paused = paused;
    this.timeline.paused = paused;
    if (this.renderer && !this.contextLost) {
      this.renderer.reading = paused ? 1 : 0;
      if (paused || !this.visible) this.renderer.stop();
      else this.renderer.start();
      try { this.renderer.draw(); } catch (error) { this.fail(error as Error); return; }
    }
    this.callbacks.onPauseChange(paused);
    this.emitSnapshot();
  }

  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    if (this.renderer) this.renderer.reducedMotion = reducedMotion;
    if (reducedMotion) this.setPaused(true);
  }

  togglePause() {
    if (this.paused) this.setPaused(false);
    else this.settle();
  }

  step(direction: -1 | 1) {
    if (!this.renderer || this.destroyed || this.contextLost || !this.visible) return;
    this.setPaused(true);
    this.timeline.move(direction);
    this.syncRows();
    this.timeline.advancePosition(this.timeline.targetFor(this.timeline.index) - this.timeline.position);
    this.syncRows();
    this.renderer.draw();
    this.emitSnapshot();
  }

  private settle() {
    if (!this.renderer || !this.visible || this.contextLost) { this.setPaused(true); return; }
    this.settling = true;
    this.timeline.needsSettle = false;
    this.renderer.animateTo({ position: this.timeline.targetFor(this.timeline.index), reading: 1, duration: 320 }, () => this.setPaused(true));
  }

  private localPoint(event: PointerEventLike) {
    const rect = this.canvas.getBoundingClientRect();
    return pointerLocalPoint(event, rect, this.renderer?.width || rect.width, this.renderer?.height || rect.height);
  }

  pointerDown(event: PointerEventLike) {
    if (!this.renderer || this.destroyed || !this.visible || this.contextLost || this.gesture || !isPrimaryPointer(event)) return;
    this.settling = false;
    const point = this.localPoint(event);
    this.timeline.cancelFling();
    this.timeline.dragging = true;
    const hit = this.renderer.hitText(point.x, point.y) as Hit | null;
    this.gesture = { pointerId: event.pointerId, ...point, lastX: point.x, lastY: point.y, lastTime: event.timeStamp, hit, moved: false, paused: this.paused };
    this.callbacks.onPreview(hit);
    this.renderer.stop();
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* The pointer can already be released by the browser. */ }
  }

  pointerMove(event: PointerEventLike) {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId || !this.renderer) return;
    const point = this.localPoint(event);
    const distance = Math.hypot(point.x - gesture.x, point.y - gesture.y);
    if (crossedDragThreshold(gesture, point, DRAG_THRESHOLD) && !gesture.moved) {
      gesture.moved = true;
      gesture.hit = null;
      this.callbacks.onPreview(null);
    }
    if (gesture.moved) {
      this.renderer.reading = Math.max(0, (gesture.paused ? 1 : 0) * (1 - distance / 45));
      const dt = (event.timeStamp - gesture.lastTime) / 1000;
      this.timeline.scrub(point.y - gesture.lastY, this.renderer.scrollPitch, dt);
      this.syncRows();
      this.renderer.draw();
    }
    gesture.lastX = point.x;
    gesture.lastY = point.y;
    gesture.lastTime = event.timeStamp;
  }

  pointerUp(event: PointerEventLike) {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    // A browser can coalesce the last move into pointerup; still distinguish a drag.
    const point = this.localPoint(event);
    if (point.x !== gesture.lastX || point.y !== gesture.lastY) this.pointerMove(event);
    this.gesture = null;
    this.callbacks.onPreview(null);
    this.timeline.dragging = false;
    const flung = this.timeline.release();
    if (!gesture.moved) {
      if (gesture.hit) {
        this.emitSnapshot();
        this.callbacks.onSelect(gesture.hit);
        if (!gesture.paused) this.renderer?.start();
      } else if (gesture.paused) this.setPaused(false);
      else this.settle();
    } else if (gesture.paused) {
      if (flung) this.renderer?.start();
      else this.settle();
    } else this.renderer?.start();
    try { if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); } catch { /* Ignore a browser-released pointer. */ }
  }

  pointerCancel(event: Pick<PointerEvent, 'pointerId'>) {
    if (!this.gesture || this.gesture.pointerId !== event.pointerId) return;
    const paused = this.gesture.paused;
    this.clearGesture();
    if (paused) this.settle(); else this.renderer?.start();
  }

  wheel(deltaY: number) {
    if (!this.renderer || this.destroyed || this.contextLost || !this.visible || this.gesture) return;
    this.timeline.cancelFling();
    this.timeline.scrub(deltaY, this.renderer.scrollPitch, 0.016);
    this.syncRows();
    this.renderer.draw();
    this.emitSnapshot();
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.clearGesture();
    // Release the old generation while the context is lost. Deleting its handles
    // after restoration can leave INVALID_OPERATION for the first glyph upload.
    this.renderer?.destroy();
    this.renderer = null;
    this.setPaused(true);
    this.callbacks.onError(new Error('WEBGL_CONTEXT_LOST'));
  };

  private onContextRestored = () => {
    this.contextLost = false;
    this.initialize();
  };

  private fail(error: Error) {
    this.clearGesture();
    this.renderer?.destroy();
    this.renderer = null;
    this.setPaused(true);
    this.callbacks.onError(error);
  }

  private clearGesture() {
    const pointerId = this.gesture?.pointerId;
    this.gesture = null;
    this.timeline.dragging = false;
    this.timeline.cancelFling();
    this.callbacks.onPreview(null);
    try {
      if (pointerId !== undefined && this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    } catch { /* The browser may have released capture already. */ }
  }

  private onWheel = (event: WheelEvent) => {
    if (!this.renderer || this.contextLost || this.gesture) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.renderer.height : 1;
    this.wheel(event.deltaY * unit);
  };

  private onVisibilityChange = () => {
    this.visible = !this.pageHidden && document.visibilityState !== 'hidden';
    this.timeline.setVisible(this.visible);
    if (!this.visible) {
      this.renderer?.stop();
      this.clearGesture();
      if (this.settling) this.setPaused(true);
      this.emitSnapshot();
    } else if (this.renderer && !this.contextLost) {
      this.renderer.reading = this.paused ? 1 : 0;
      if (this.paused) this.renderer.draw(); else this.renderer.start();
    }
  };

  private onPageHide = () => { this.pageHidden = true; this.onVisibilityChange(); };
  private onPageShow = () => { this.pageHidden = false; this.onVisibilityChange(); };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.canvas.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onPageShow);
    this.clearGesture();
    this.renderer?.destroy();
    this.renderer = null;
    this.gesture = null;
  }
}

export function createFlowRendererHost(canvas: HTMLCanvasElement, atlas: HTMLCanvasElement, frames: FlowFrame[], options: {
  paused: boolean;
  reducedMotion: boolean;
  snapshot?: ReadingSnapshot | null;
  callbacks: HostCallbacks;
}) {
  return new FlowRendererHost(canvas, atlas, frames, options);
}
