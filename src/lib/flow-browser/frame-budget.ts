/** Steps the reader's material down when a device keeps missing frames, so a
 * weaker GPU reads smoothly instead of stuttering at full quality.
 *   1: glass at 1x resolution    2: no ripple fire    3: static glass
 * Quality only steps down within a session, so it can never oscillate. */
export const FRAME_BUDGET = {
  tiers: 3,
  // Judged per window of consecutive full-rate frames.
  window: 120,
  // A frame is slow beyond 1.6 display periods; a window fails above 20%.
  slowFactor: 1.6, slowRatio: .2,
  // Glyph rasterization and shader warm-up follow the first reveal.
  warmupMs: 4000,
  // Let a new tier take effect before judging it.
  cooldownMs: 3000,
  // Longer gaps are hidden tabs or pauses, not rendering cost.
  maxGapMs: 250,
} as const;

const DISPLAY_PERIOD_MS = 1000 / 60;

export function readQualityOverride(search: string) {
  const value = new URLSearchParams(search).get('quality');
  if (value === null || !/^\d$/.test(value)) return undefined;
  const tier = Number(value);
  return tier <= FRAME_BUDGET.tiers ? tier : undefined;
}

export class FrameBudget {
  tier: number;
  private readonly locked: boolean;
  private gaps: number[] = [];
  private previous: number | undefined;
  private start: number | undefined;
  private changedAt = -Infinity;

  constructor(override?: number) {
    this.locked = override !== undefined;
    this.tier = override ?? 0;
  }

  /** Records one rendered frame. fullRate is false for idle-cadence frames.
   * Returns true when the tier changed. */
  sample(time: number, fullRate: boolean) {
    if (this.locked || this.tier >= FRAME_BUDGET.tiers) return false;
    this.start ??= time;
    const previous = this.previous;
    this.previous = fullRate ? time : undefined;
    if (previous === undefined || !fullRate) return false;
    const gap = time - previous;
    if (gap <= 0 || gap > FRAME_BUDGET.maxGapMs) return false;
    if (time - this.start < FRAME_BUDGET.warmupMs || time - this.changedAt < FRAME_BUDGET.cooldownMs) return false;
    this.gaps.push(gap);
    if (this.gaps.length < FRAME_BUDGET.window) return false;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    this.gaps = [];
    // A steady 30fps on a 60Hz display is still missing frames; a 120Hz
    // display keeps its own shorter period.
    const period = Math.min(sorted[Math.floor(sorted.length * .1)]!, DISPLAY_PERIOD_MS);
    const slow = sorted.filter(value => value > period * FRAME_BUDGET.slowFactor).length;
    if (slow / sorted.length <= FRAME_BUDGET.slowRatio) return false;
    this.tier++;
    this.changedAt = time;
    return true;
  }
}
