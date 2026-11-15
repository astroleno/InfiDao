/** A thick glass lens that forms over a pressed word. It grows across the
 * long-press threshold, holds while the meaning is open and recedes from
 * wherever it was when released. Coordinates are CSS px in the reader. */
export const LENS = { radius: 68, growMs: 450, releaseMs: 320 } as const;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;

export class LensMotion {
  x = 0;
  y = 0;
  private from = 0;
  private to = 0;
  private start = 0;
  private duration = 1;
  private value = 0;

  press(x: number, y: number, time: number) {
    this.x = x; this.y = y;
    this.retarget(1, time, LENS.growMs);
  }

  /** The meaning opened: keep the lens at full strength. */
  hold() {
    if (this.to === 1) return;
    this.from = this.to = this.value = 1;
  }

  release(time: number) {
    if (this.to === 0) return;
    this.retarget(0, time, LENS.releaseMs);
  }

  sample(time: number, reducedMotion = false) {
    if (reducedMotion) { this.from = this.to = this.value = 0; return 0; }
    const t = Math.max(0, Math.min(1, (time - this.start) / this.duration));
    const eased = this.to > this.from ? easeOut(t) : easeIn(t);
    this.value = t >= 1 ? this.to : this.from + (this.to - this.from) * eased;
    return this.value;
  }

  get moving() { return this.value !== this.to; }
  get active() { return this.value > 0 || this.to > 0; }

  private retarget(to: number, time: number, duration: number) {
    this.sample(time);
    this.from = this.value; this.to = to; this.start = time; this.duration = duration;
  }
}
