/** Advance the noise field by travelled distance, not a per-frame random draw. */
export class ScrollNoiseMotion {
  private previous: number | undefined;

  constructor(private phase = Math.random() * 289) {}

  advance(scrollTop: number) {
    if (this.previous !== undefined) {
      // One noise cell per 100 CSS pixels. The noise has a 289-cell period,
      // making this wrap continuous while keeping shader coordinates small.
      this.phase = (this.phase + Math.abs(scrollTop - this.previous) * .01) % 289;
    }
    this.previous = scrollTop;
    return this.phase;
  }
}

/** A bounded, damped spring lets the same noise field settle after scrolling. */
export class SettlingScrollNoiseMotion {
  private noise: ScrollNoiseMotion;
  private previousTop: number | undefined;
  private previousTime: number | undefined;
  private offset = 0;
  private velocity = 0;
  private ambientTime = 0;
  private ambientSeed: number;

  constructor(seed = Math.random() * 289, private persistent = false, private drifting = false) {
    this.noise = new ScrollNoiseMotion(seed);
    this.ambientSeed = seed;
  }

  sample(scrollTop: number, time: number, reducedMotion = false) {
    const phase = this.noise.advance(scrollTop);
    const elapsed = this.previousTime === undefined ? 0 : Math.max(0, (time - this.previousTime) / 1000);
    const travelled = this.previousTop === undefined ? 0 : Math.abs(scrollTop - this.previousTop) * .01;
    this.previousTop = scrollTop;
    this.previousTime = time;

    // Integrate the free response exactly, including after a long idle frame.
    // The living surface has a slower, more visible recoil before its quiet
    // ambient floor takes over; the previous comparison keeps its old spring.
    const damping = this.persistent ? 1.7 : 2.464;
    const stiffness = this.persistent ? 6.6 : 8.8;
    const frequency = Math.sqrt(stiffness * stiffness - damping * damping);
    const decay = Math.exp(-damping * elapsed);
    const cosine = Math.cos(frequency * elapsed), sine = Math.sin(frequency * elapsed);
    const a = this.offset, b = (this.velocity + damping * a) / frequency;
    this.offset = decay * (a * cosine + b * sine);
    this.velocity = decay * ((b * frequency - damping * a) * cosine - (a * frequency + damping * b) * sine);

    // Moving the equilibrium excites the spring. The cap keeps wheel jumps
    // and fast scrubbing to a small fraction of one noise cell, while
    // ordinary scrolling supplies less energy.
    const limit = this.persistent ? .16 : .065;
    this.offset = Math.max(-limit, Math.min(limit, this.offset - travelled));
    const settling = !reducedMotion && (Math.abs(this.offset) > .00015 || Math.abs(this.velocity) > .0015);
    if (!settling) { this.offset = 0; this.velocity = 0; }
    // This clock is independent of playback. A forward drift keeps the new
    // surface moving through the noise field even at a wave's turning point.
    // Its minimum phase speed is .085 - .018 * 1.3 > 0. Hidden tabs hold time.
    if (!reducedMotion) this.ambientTime += Math.min(.1, elapsed);
    const ambient = this.persistent && !reducedMotion
      ? this.drifting
        ? this.ambientTime * .085 + .018 * Math.sin(this.ambientTime * 1.3 + this.ambientSeed * .57)
        : .035 * Math.sin(this.ambientTime * .9 + this.ambientSeed * .23)
        + .018 * Math.sin(this.ambientTime * 1.47 + this.ambientSeed * .57) : 0;
    return { phase: (phase + this.offset + ambient + 289) % 289,
      moving: !reducedMotion && (settling || this.persistent), settling };
  }
}
