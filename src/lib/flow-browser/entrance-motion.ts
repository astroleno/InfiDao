/** One entrance per paragraph. Freezing preserves the last painted hit target. */
export class EntranceMotion {
  private started: number | null = null;
  private frozen: number | null = null;
  offset = 0;
  done = false;

  constructor(readonly direction: -1 | 1) {}

  begin(now: number, delay = 0) {
    if (this.started === null && !this.done) this.started = now + delay;
  }

  sample(now: number, width: number, reducedMotion: boolean) {
    if (reducedMotion) this.finish();
    if (this.done || this.started === null || this.frozen !== null) return false;
    const progress = Math.max(0, Math.min(1, (now - this.started) / 560));
    const distance = Math.min(48, Math.max(18, width * .06));
    this.offset = this.direction * distance * (1 - progress) ** 4;
    if (progress === 1) this.finish();
    return !this.done;
  }

  pause(now: number) {
    if (this.started !== null && !this.done && this.frozen === null) this.frozen = now;
  }

  resume(now: number) {
    if (this.frozen !== null && this.started !== null) this.started += now - this.frozen;
    this.frozen = null;
  }

  finish() {
    this.offset = 0;
    this.done = true;
    this.frozen = null;
  }

  get waiting() { return this.started === null && !this.done; }
  get phase() { return this.done ? 'settled' : this.frozen !== null ? 'paused' : this.started === null ? 'waiting' : 'entering'; }
}

/** Glyph progress belongs to the paragraph text, not changing token wrappers. */
export class InkMotion {
  private glyphs: Array<{ char: string; start: number | null; progress: number }> = [];
  private frozen: number | null = null;

  sync(text: string) {
    const chars = Array.from(text);
    let prefix = 0;
    while (prefix < chars.length && this.glyphs[prefix]?.char === chars[prefix]) prefix++;
    this.glyphs = this.glyphs.slice(0, prefix).concat(chars.slice(prefix).map(char => ({ char, start: null, progress: 0 })));
  }

  begin(now: number, delay = 0) {
    const pending = this.glyphs.filter(glyph => glyph.start === null && glyph.progress < 1);
    // Even a long passage completes within 830ms; streamed suffixes get their
    // own bounded stagger while the already revealed prefix stays untouched.
    pending.forEach((glyph, index) => {
      glyph.start = (this.frozen ?? now) + delay + index * Math.min(45, 180 / Math.max(1, pending.length - 1));
    });
  }

  sample(now: number, reducedMotion: boolean) {
    if (reducedMotion) this.finish();
    if (this.frozen !== null) return false;
    let moving = false;
    for (const glyph of this.glyphs) {
      if (glyph.start === null || glyph.progress === 1) continue;
      glyph.progress = Math.max(0, Math.min(1, (now - glyph.start) / 650));
      moving = glyph.progress < 1 || moving;
    }
    return moving;
  }

  pause(now: number) {
    if (this.frozen === null && this.glyphs.some(glyph => glyph.start !== null && glyph.progress < 1)) this.frozen = now;
  }

  resume(now: number) {
    if (this.frozen !== null) for (const glyph of this.glyphs) {
      if (glyph.start !== null && glyph.progress < 1) glyph.start += now - this.frozen;
    }
    this.frozen = null;
  }

  finish() {
    this.glyphs.forEach(glyph => { glyph.progress = 1; });
    this.frozen = null;
  }

  progress(start: number, count: number) { return this.glyphs.slice(start, start + count).map(glyph => glyph.progress); }
  get key() { return this.glyphs.map(glyph => Math.round(glyph.progress * 255)).join(','); }
  get phase() {
    return this.glyphs.every(glyph => glyph.progress === 1) ? 'settled' : this.frozen !== null ? 'paused'
      : this.glyphs.some(glyph => glyph.start !== null && glyph.progress < 1) ? 'entering' : 'waiting';
  }
}
