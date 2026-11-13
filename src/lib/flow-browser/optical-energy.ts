/** Scroll speed drives the glass material: the slow reading drift stays quiet,
 * a flick lights the dispersion and the rim, and the light settles on a long tail. */
export const OPTICAL_ENERGY = {
  restDispersion: .45, peakDispersion: 1,
  restSheen: .35,
  // px/s. Automatic reading advances 12px/s; manual flicks start near 700px/s.
  quietSpeed: 60, fullSpeed: 1400,
  // Frame gaps and saved-position jumps are not motion the reader produced.
  maxFrameGap: 100, jumpSpeed: 20_000,
  attackMs: 60, releaseMs: 480,
  steps: 32,
} as const;

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export class OpticalEnergy {
  private previousTop: number | undefined;
  private previousTime: number | undefined;
  private reduced = false;
  value = 0;

  sample(top: number, time: number, reducedMotion: boolean) {
    const previousTop = this.previousTop, previousTime = this.previousTime;
    this.previousTop = top; this.previousTime = time;
    this.reduced = reducedMotion;
    if (reducedMotion) { this.value = 0; return this.value; }
    if (previousTop === undefined || previousTime === undefined || time <= previousTime) return this.value;
    const elapsed = time - previousTime;
    const speed = Math.abs(top - previousTop) * 1000 / elapsed;
    const genuine = elapsed <= OPTICAL_ENERGY.maxFrameGap && speed < OPTICAL_ENERGY.jumpSpeed;
    const target = genuine ? smooth((speed - OPTICAL_ENERGY.quietSpeed) / (OPTICAL_ENERGY.fullSpeed - OPTICAL_ENERGY.quietSpeed)) : 0;
    const tau = target > this.value ? OPTICAL_ENERGY.attackMs : OPTICAL_ENERGY.releaseMs;
    const next = this.value + (target - this.value) * (1 - Math.exp(-Math.min(elapsed, 250) / tau));
    this.value = next < .01 && target === 0 ? 0 : next;
    return this.value;
  }

  /** Quantized so that sub-perceptible changes do not recompose the glass. */
  get level() { return Math.round(this.value * OPTICAL_ENERGY.steps); }
  get moving() { return this.value > 0; }
  get dispersion() {
    const value = this.level / OPTICAL_ENERGY.steps;
    return OPTICAL_ENERGY.restDispersion + (OPTICAL_ENERGY.peakDispersion - OPTICAL_ENERGY.restDispersion) * value;
  }
  get sheen() {
    if (this.reduced) return 0;
    return OPTICAL_ENERGY.restSheen + (1 - OPTICAL_ENERGY.restSheen) * this.level / OPTICAL_ENERGY.steps;
  }
}
