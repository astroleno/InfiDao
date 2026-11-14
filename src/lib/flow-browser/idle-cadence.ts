/** The living water never stops, but alone it moves a fraction of a pixel per
 * frame. Once nothing else has moved for a settling beat, it may drift at a
 * lower rate; any scroll, reveal or flick restores every display frame. */
export const IDLE_CADENCE = { settleMs: 1500, frameMs: 50 } as const;

export class IdleCadence {
  private lastLively = -Infinity;

  note(time: number, lively: boolean) {
    if (lively) this.lastLively = time;
  }

  /** Extra wait before the next frame: 0 keeps the display rate. */
  delay(time: number) {
    return time - this.lastLively >= IDLE_CADENCE.settleMs ? IDLE_CADENCE.frameMs : 0;
  }
}
