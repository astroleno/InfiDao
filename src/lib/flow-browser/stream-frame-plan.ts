export type StreamInvalidation = 'layout' | 'font' | 'interaction' | 'motion' | 'restore';
const reasons: Record<StreamInvalidation, number> = { layout: 1, font: 2, interaction: 4, motion: 8, restore: 16 };
type FrameState = {
  scrollTop: number; width: number; height: number; reducedMotion: boolean;
  variant: string; surfacePhase: number; focus: unknown; canvasReady: boolean;
};
export type StreamFramePlan = {
  sourceRevision: number; fontRevision: number;
  sourceChanged: boolean; surfaceChanged: boolean; reasons: number;
};

/** Explicit invalidation prevents pointer/layout updates from evicting font rasters. */
export class StreamFramePlanner {
  private pending = reasons.layout;
  private fontRevision = 0;
  private sourceRevision = 0;
  private previous: FrameState | undefined;

  invalidate(reason: StreamInvalidation) {
    this.pending |= reasons[reason];
    if (reason === 'font') this.fontRevision++;
  }

  frame(state: FrameState): StreamFramePlan {
    const old = this.previous;
    const changed = this.pending !== 0 || !old || old.scrollTop !== state.scrollTop
      || old.width !== state.width || old.height !== state.height || old.variant !== state.variant
      || old.reducedMotion !== state.reducedMotion || old.focus !== state.focus || old.canvasReady !== state.canvasReady;
    const plan = { sourceRevision: changed ? ++this.sourceRevision : this.sourceRevision,
      fontRevision: this.fontRevision, sourceChanged: changed,
      surfaceChanged: changed || old?.surfacePhase !== state.surfacePhase, reasons: this.pending };
    this.previous = state;
    this.pending = 0;
    return plan;
  }
}

export type PixelRect = { x: number; y: number; width: number; height: number };
export type TargetRegion = { capacity: { width: number; height: number }; activeRect: PixelRect; dirtyRect: PixelRect };

/** Avoid moving native glyphs across a quarter-pixel raster rounding boundary.
 * The margin covers float32 translations anywhere on this drawing surface. */
export function nativeRasterUnambiguous(x: number, baseline: number, dpr: number, advances: ArrayLike<number>, width: number, height: number) {
  if (![x, baseline, dpr, width, height].every(Number.isFinite)) return false;
  const tolerance = Math.max(width, height, Math.abs(x), Math.abs(baseline)) * .000001;
  const nearBoundary = (value: number) => !Number.isFinite(value)
    || Math.abs(value * 4 - Math.floor(value * 4) - .5) <= tolerance * 4;
  if (nearBoundary(baseline)) return false;
  for (let index = 0; index < advances.length; index++) if (nearBoundary(x + advances[index]! * dpr)) return false;
  return true;
}

/** A native blur downsamples about its input center. Moving that center by 7
 * pixels preserves the 4/7 grid; 18 preserves both 1/2 and 4/9 grids. */
function nativeBlurInterval(low: number, high: number, size: number, period: number) {
  let begin = Math.max(0, Math.min(size, Math.floor(low)));
  let end = Math.max(begin, Math.min(size, Math.ceil(high)));
  const step = period * 2, positive = ((size - begin - end) % step + step) % step;
  const negative = positive - step;
  const rightFits = positive <= size - end, leftFits = negative >= -begin;
  if (rightFits && (!leftFits || positive <= -negative)) end += positive;
  else if (leftFits) begin += negative;
  else return { begin: 0, end: size };
  return { begin, end };
}

/** Direct kernels can use tight bounds when raster rounding is unambiguous.
 * Saturated 7/9px filters keep their original sampling phase with a small
 * integer expansion. Other large blurs keep their full native region. */
export function planNativeFilterClip(bounds: PixelRect, width: number, height: number, sigma: number, stableRaster = false): PixelRect | undefined {
  if (sigma < 0 || (sigma > 4 && (!stableRaster || (sigma !== 7 && sigma !== 9)))
    || ![bounds.x, bounds.y, bounds.width, bounds.height, width, height, sigma].every(Number.isFinite)
    || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return;
  const halo = Math.ceil(sigma * 4 + 8);
  const left = bounds.x - halo, right = bounds.x + bounds.width + halo;
  const top = bounds.y - halo, bottom = bounds.y + bounds.height + halo;
  let x = 0, y = 0, endX = Math.min(width, Math.ceil(right)), endY = Math.min(height, Math.ceil(bottom));
  if (sigma > 4) {
    const period = sigma === 9 ? 18 : 7;
    const horizontal = nativeBlurInterval(left, right, width, period);
    const vertical = nativeBlurInterval(top, bottom, height, period);
    x = horizontal.begin; endX = horizontal.end; y = vertical.begin; endY = vertical.end;
  } else if (stableRaster) {
    x = Math.max(0, Math.floor(left)); y = Math.max(0, Math.floor(top));
  }
  return { x, y, width: Math.max(0, endX - x), height: Math.max(0, endY - y) };
}

/** Allocation may grow; the active pixels and the old/new clear union may shrink. */
export function planTargetRegion(previous: TargetRegion | undefined, activeRect: PixelRect, tile = 128): TargetRegion {
  const capacity = { width: Math.max(previous?.capacity.width ?? 0, Math.ceil(activeRect.width / tile) * tile),
    height: Math.max(previous?.capacity.height ?? 0, Math.ceil(activeRect.height / tile) * tile) };
  const old = previous?.activeRect ?? activeRect;
  const x = Math.min(old.x, activeRect.x), y = Math.min(old.y, activeRect.y);
  return { capacity, activeRect, dirtyRect: { x, y,
    width: Math.max(old.x + old.width, activeRect.x + activeRect.width) - x,
    height: Math.max(old.y + old.height, activeRect.y + activeRect.height) - y } };
}
