/** Keep the reading position continuous when native scrollTop rounds writes.
 * Layout stays native; the caller applies only the unrepresented remainder. */
export class StreamScrollMotion {
  private logical: number;
  private physical: number;
  private previousTime: number | undefined;

  constructor(top = 0) {
    this.logical = top;
    this.physical = top;
  }

  position(actual: number) {
    return this.logical + actual - this.physical;
  }

  reset(logical: number, physical = logical) {
    this.logical = logical;
    this.physical = physical;
    this.previousTime = undefined;
  }

  frame(actual: number, time: number, playing: boolean, maximum: number) {
    this.logical = this.position(actual);
    if (playing && this.previousTime !== undefined) {
      this.logical += Math.max(0, Math.min(48, time - this.previousTime)) * .012;
    }
    this.logical = Math.max(0, Math.min(Math.max(0, maximum), this.logical));
    this.physical = actual;
    this.previousTime = playing ? time : undefined;
    return this.logical;
  }

  applied(actual: number) {
    this.physical = actual;
    return this.logical - actual;
  }
}

/** Manual travel may outrun the ink reveal. Automatic flow and saved-position
 * jumps never opt in; a short hold joins wheel/touch inertia across frames. */
export class StreamManualScroll {
  private previousTop = 0;
  private previousTime: number | undefined;
  private inputUntil = -Infinity;
  private fastUntil = -Infinity;

  input(top: number, time: number) {
    if (time > this.inputUntil) { this.previousTop = top; this.previousTime = time; }
    this.inputUntil = time + 1200;
  }

  sample(top: number, time: number, height: number) {
    const previousTop = this.previousTop, previousTime = this.previousTime;
    this.previousTop = top; this.previousTime = time;
    if (previousTime === undefined || time > this.inputUntil || time < previousTime) {
      this.fastUntil = -Infinity;
      return false;
    }
    const elapsed = Math.max(8, time - previousTime);
    if (Math.abs(top - previousTop) >= Math.max(700, height) * elapsed / 1000) this.fastUntil = time + 180;
    return time <= this.fastUntil;
  }

  reset() {
    this.previousTime = undefined;
    this.inputUntil = this.fastUntil = -Infinity;
  }
}
