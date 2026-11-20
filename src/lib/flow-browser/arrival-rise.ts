/** The first passage rises out of the water once, when the loading light hands
 * off. The reader renders as if it were scrolled up from beneath the lower rim,
 * so the existing water, fire and ripple respond exactly as to a real scroll;
 * none of the material changes. Native layout and scrolling stay untouched. */
export const ARRIVAL_RISE = {
  durationMs: 1100,
  // Fraction of the viewport the passage starts below its resting place. The
  // first passage rests near 28% of the height; this begins it under the
  // lower rim, inside the deepest part of the fold.
  depth: .6,
} as const;

// Fast through the surface, so the scroll energy lights the fire; slow into rest.
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

export class ArrivalRise {
  private startedAt: number | null = null;
  private distance = 0;
  private finished = false;

  /** Starts the rise; any later call is ignored, so it plays once per reader. */
  begin(now: number, viewportHeight: number) {
    if (this.startedAt !== null || this.finished) return;
    this.startedAt = now;
    this.distance = Math.max(0, viewportHeight) * ARRIVAL_RISE.depth;
  }

  /** Arrival without the rise: restored or already settled reading. */
  skip() { this.finished = true; }

  /** Pixels the rendered content sits below its native position. */
  offset(now: number, reducedMotion = false) {
    if (this.finished || this.startedAt === null) return 0;
    if (reducedMotion) { this.finished = true; return 0; }
    const progress = Math.max(0, Math.min(1, (now - this.startedAt) / ARRIVAL_RISE.durationMs));
    if (progress === 1) { this.finished = true; return 0; }
    return this.distance * (1 - easeOutCubic(progress));
  }

  get started() { return this.startedAt !== null || this.finished; }
  get active() { return this.startedAt !== null && !this.finished; }
}
