/** Steps the reader's material down when a device keeps missing frames, so a
 * weaker GPU reads smoothly instead of stuttering at full quality.
 *   1: glass at 1x   2: glass at 0.8x   3: glass at 0.67x   4: static glass
 * Resolution is what the glass costs; its water, fire and ripple cost almost
 * nothing, so they stay until the glass must stand still. Settled central
 * lettering is native text, so a lower glass resolution softens only the
 * already defocused folds. Quality only steps down within a session, so it
 * can never oscillate. */
export const FRAME_BUDGET = {
  tiers: 4,
  // Judged per window of active frame intervals.
  window: 120,
  // A frame is slow beyond 1.6 display periods; a window fails above 20%.
  slowFactor: 1.6, slowRatio: .2,
  // Glyph rasterization and shader warm-up follow the first reveal.
  warmupMs: 4000,
  // Let a new tier take effect before judging it.
  cooldownMs: 3000,
  // A window whose median frame exceeds this many display periods is a severe
  // stall: it steps down two tiers, so a struggling device is not left
  // stuttering through one long window per tier.
  severeFactor: 3,
} as const;

const DISPLAY_PERIOD_MS = 1000 / 60;

// Glass backing resolution per live tier; undefined keeps the reader default.
const TIER_MAX_DPR = [undefined, 1, .8, .67] as const;

export type QualitySettings = { static: boolean; maxDpr?: number };

/** What a quality tier changes. Only resolution, then a still glass. */
export function qualitySettings(tier: number): QualitySettings {
  const index = Math.max(0, Math.min(FRAME_BUDGET.tiers, Math.floor(tier)));
  if (index >= FRAME_BUDGET.tiers) return { static: true };
  const maxDpr = TIER_MAX_DPR[index];
  return maxDpr === undefined ? { static: false } : { static: false, maxDpr };
}

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

  /** Records one rendered frame. The caller excludes background and deliberate waits.
   * Returns true when the tier changed. */
  sample(time: number, fullRate: boolean) {
    if (this.locked || this.tier >= FRAME_BUDGET.tiers) return false;
    this.start ??= time;
    const previous = this.previous;
    this.previous = fullRate ? time : undefined;
    if (previous === undefined || !fullRate) return false;
    const gap = time - previous;
    if (gap <= 0) return false;
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
    const severe = sorted[Math.floor(sorted.length / 2)]! > DISPLAY_PERIOD_MS * FRAME_BUDGET.severeFactor;
    this.tier = Math.min(FRAME_BUDGET.tiers, this.tier + (severe ? 2 : 1));
    this.changedAt = time;
    return true;
  }
}
