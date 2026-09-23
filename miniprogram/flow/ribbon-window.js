const { modulo } = require('./timeline');

// The GPU always sees the same number of slots. Content arrivals must never
// change the modulus that positions already visible quotations.
const SLOT_COUNT = 32;
class RibbonWindow {
  constructor(lines, cursor = 0, snapshot, origin = 0) {
    this.lines = lines;
    this.origin = snapshot?.origin ?? origin;
    this.rows = new Map();
    this.pending = [];
    this.unseen = new Set(snapshot?.unseen || []);
    const byId = new Map(lines.map(line => [line.id, line]));
    if (snapshot) {
      for (const [serial, id] of snapshot.rows || []) if (byId.has(id)) this.rows.set(serial, byId.get(id));
      this.pending = (snapshot.pending || []).filter(id => byId.has(id));
    }
    this.refresh(cursor);
  }
  nextLine(previous, direction = 1) {
    const index = previous ? this.lines.findIndex(line => line.id === previous.id) : -1;
    const natural = this.lines[modulo(index + direction, this.lines.length)];
    if (direction > 0 && this.pending.length) {
      const first = this.lines.find(line => line.id === this.pending[0]);
      // Join new passages at a sentence boundary, never between two clauses
      // of a passage which has already begun entering the window.
      if (first?.lineIndex === 0 && natural.lineIndex > 0 && natural.passageId === previous?.passageId) return natural;
      const id = this.pending.shift(), line = this.lines.find(item => item.id === id);
      if (line) return line;
    }
    return natural;
  }
  refresh(cursor) {
    const center = Math.round(cursor), first = center - SLOT_COUNT / 2, last = first + SLOT_COUNT - 1;
    let changed = false;
    const keys = Array.from(this.rows.keys());
    if (keys.length && (first > Math.max(...keys) + SLOT_COUNT || last < Math.min(...keys) - SLOT_COUNT)) this.rows.clear();
    if (!this.rows.size) {
      for (let serial = first; serial <= last; serial++) this.rows.set(serial, this.lines[modulo(serial - this.origin, this.lines.length)]);
      changed = true;
    } else {
      // Fill forward and backward independently, preserving the identity of
      // every surviving occurrence, including repetitions of the same passage.
      const known = Array.from(this.rows.keys()).sort((a, b) => a - b);
      for (let serial = known[known.length - 1] + 1; serial <= last; serial++) {
        this.rows.set(serial, this.nextLine(this.rows.get(serial - 1))); changed = true;
      }
      for (let serial = known[0] - 1; serial >= first; serial--) {
        this.rows.set(serial, this.nextLine(this.rows.get(serial + 1), -1)); changed = true;
      }
    }
    for (const serial of this.rows.keys()) if (serial < first || serial > last) this.rows.delete(serial);
    for (const [serial, line] of this.rows) if (serial <= center) this.unseen.delete(line.id);
    return changed;
  }
  update(lines, cursor, guard = 6) {
    const old = new Set(this.lines.map(line => line.id)), byId = new Map(lines.map(line => [line.id, line]));
    const added = lines.filter(line => !old.has(line.id));
    this.lines = lines;
    for (const [serial, line] of this.rows) {
      const fresh = byId.get(line.id);
      // Explanations may become ready, but an occurrence's visible glyphs
      // cannot be rewritten by a later payload with the same identity.
      if (fresh && fresh.quote === line.quote) this.rows.set(serial, fresh);
    }
    if (added.length) {
      let cut = Math.ceil(cursor) + guard + 1;
      while (this.rows.get(cut)?.lineIndex > 0 && this.rows.get(cut)?.passageId === this.rows.get(cut - 1)?.passageId) cut++;
      const displaced = Array.from(this.rows).filter(([serial, line]) => serial >= cut && this.unseen.has(line.id))
        .sort((a, b) => a[0] - b[0]).map(([, line]) => line.id);
      this.pending = Array.from(new Set([...displaced, ...this.pending, ...added.map(line => line.id)]));
      for (const line of added) this.unseen.add(line.id);
      for (const serial of this.rows.keys()) if (serial >= cut) this.rows.delete(serial);
    }
    this.refresh(cursor);
  }
  frames(cursor) {
    this.refresh(cursor);
    const slots = Array(SLOT_COUNT);
    for (const [serial, line] of this.rows) slots[modulo(serial - this.origin, SLOT_COUNT)] = { ...line, occurrence: serial };
    return slots;
  }
  seek(passageId, cursor) {
    const target = this.lines.findIndex(line => line.passageId === passageId);
    if (target < 0) return;
    this.rows.clear(); this.pending = []; this.unseen.clear();
    const center = Math.round(cursor);
    for (let serial = center - SLOT_COUNT / 2; serial < center + SLOT_COUNT / 2; serial++) {
      this.rows.set(serial, this.lines[modulo(target + serial - center, this.lines.length)]);
    }
  }
  usedPassages() { return new Set(Array.from(this.rows.values(), line => line.passageId)); }
  snapshot() { return { origin: this.origin, rows: Array.from(this.rows, ([serial, line]) => [serial, line.id]), pending: this.pending.slice(), unseen: Array.from(this.unseen) }; }
}
module.exports = { RibbonWindow, SLOT_COUNT };
