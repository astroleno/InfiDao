export type SceneRange = { top: number; bottom: number; order: number };

/** Content coordinates survive scrolling. Rebuild only after DOM layout changes. */
export class StreamSceneIndex<T extends SceneRange> {
  private items: T[] = [];
  private byBottom: T[] = [];
  private maxima: number[] = [];
  private finished = 0;
  /** Diagnostic work count, independent of the number of retained DOM nodes. */
  visited = 0;

  setLayout(items: readonly T[]) {
    this.items = [...items].sort((a, b) => a.top - b.top || a.order - b.order);
    this.byBottom = [...items].sort((a, b) => a.bottom - b.bottom || a.order - b.order);
    this.finished = 0;
    this.maxima.length = items.length * 4;
    const build = (low: number, high: number, node: number): number => {
      if (low === high) return -Infinity;
      if (high - low === 1) return this.maxima[node] = this.items[low]!.bottom;
      const middle = (low + high) >>> 1;
      return this.maxima[node] = Math.max(build(low, middle, node * 2), build(middle, high, node * 2 + 1));
    };
    build(0, this.items.length, 1);
  }

  visible(top: number, bottom: number, result: T[] = []) {
    result.length = 0;
    this.visited = 0;
    const visit = (low: number, high: number, node: number) => {
      if (low === high || this.maxima[node]! < top || this.items[low]!.top > bottom) return;
      this.visited++;
      if (high - low === 1) { result.push(this.items[low]!); return; }
      const middle = (low + high) >>> 1;
      visit(low, middle, node * 2);
      visit(middle, high, node * 2 + 1);
    };
    visit(0, this.items.length, 1);
    // Entrance staggering and compositing preserve DOM order, even when ranges overlap.
    result.sort((a, b) => a.order - b.order);
    return result;
  }

  /** Finishing an already passed paragraph is paid once per layout, not per RAF. */
  finishBefore(top: number, finish: (item: T) => void) {
    while (this.finished < this.byBottom.length && this.byBottom[this.finished]!.bottom < top) {
      finish(this.byBottom[this.finished++]!);
    }
  }

  atOrBefore(top: number) {
    let low = 0, high = this.items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.items[middle]!.top <= top) low = middle + 1;
      else high = middle;
    }
    return this.items[Math.max(0, low - 1)];
  }

  get last() { return this.items.at(-1); }
}
