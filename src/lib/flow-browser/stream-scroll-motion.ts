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
