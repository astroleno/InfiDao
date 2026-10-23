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
