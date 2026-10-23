import { EntranceMotion, InkMotion } from '@/lib/flow-browser/entrance-motion';

test('the final reveal invalidates its native ownership even if progress already rounded to 255', () => {
  const ink = new InkMotion(), target: number[] = [];
  ink.sync('止'); ink.begin(0); ink.sample(649.5, false);
  const revision = ink.revision;
  expect(ink.progress(0, 1, target)).toBe(target);
  expect(Math.round(target[0]! * 255)).toBe(255);
  ink.sample(650, false);
  expect(ink.revision).toBeGreaterThan(revision);
  expect(ink.phase).toBe('settled');
  expect(ink.progress(0, 1, target)).toEqual([1]);
});

test('three parts enter left, right, left and the next passage starts from the right', () => {
  const parts = Array.from({ length: 6 }, (_, index) => new EntranceMotion(index % 2 ? 1 : -1));
  parts.forEach(part => { part.begin(0); part.sample(0, 1440, false); });
  expect(parts.map(part => part.offset)).toEqual([-48, 48, -48, 48, -48, 48]);
  parts.forEach(part => { expect(part.sample(560, 1440, false)).toBe(false); expect(part.offset).toBe(0); });
});

test('stagger overlaps and streamed text updates cannot restart an entrance', () => {
  const first = new EntranceMotion(-1), next = new EntranceMotion(1);
  first.begin(100); next.begin(100, 90);
  first.sample(200, 390, false); next.sample(200, 390, false);
  expect(Math.abs(first.offset)).toBeLessThan(next.offset);
  expect(next.offset).toBeLessThan(390 * .06);
  first.begin(500);
  first.sample(660, 390, false);
  expect(first.done).toBe(true); expect(first.offset).toBe(0);
  first.begin(1000); expect(first.sample(1000, 390, false)).toBe(false);
});

test('pointer down freezes the actual painted position and resume does not jump', () => {
  const part = new EntranceMotion(-1);
  part.begin(0); part.sample(160, 390, false);
  const offset = part.offset;
  part.pause(160);
  expect(part.phase).toBe('paused');
  expect(part.sample(900, 390, false)).toBe(false);
  expect(part.offset).toBe(offset);
  part.resume(900); part.sample(900, 390, false);
  expect(part.offset).toBe(offset);
  part.sample(1300, 390, false);
  expect(part.offset).toBe(0); expect(part.phase).toBe('settled');
});

test('reduced motion is immediately centered and does not replay on a later change', () => {
  const part = new EntranceMotion(1);
  expect(part.waiting).toBe(true);
  part.sample(0, 390, true);
  expect(part.offset).toBe(0); expect(part.done).toBe(true);
  part.begin(100); expect(part.sample(200, 390, false)).toBe(false);
});

test('glyphs reveal in order within 830ms, including a long paragraph', () => {
  const ink = new InkMotion();
  ink.sync('知止而后有定'.repeat(20)); ink.begin(100);
  expect(ink.sample(100, false)).toBe(true);
  expect(ink.progress(0, 120).every(p => p === 0)).toBe(true);
  ink.sample(400, false);
  expect(ink.progress(0, 1)[0]).toBeGreaterThan(ink.progress(119, 1)[0]!);
  expect(ink.sample(930, false)).toBe(false);
  expect(ink.phase).toBe('settled');
});

test('streaming and token remeasurement preserve the prefix and animate only new code points', () => {
  const ink = new InkMotion();
  ink.sync('知𠮷'); ink.begin(0); ink.sample(900, false);
  ink.sync('知𠮷而后'); ink.begin(1000); ink.sample(1200, false);
  expect(ink.progress(0, 2)).toEqual([1, 1]);
  expect(ink.progress(2, 2).every(p => p > 0 && p < 1)).toBe(true);
  const key = ink.key;
  ink.sync('知𠮷而后'); ink.begin(1200); ink.sample(1200, false);
  expect(ink.key).toBe(key);
  ink.sample(2000, false); ink.begin(3000); ink.sample(3000, false);
  expect(ink.progress(0, 4)).toEqual([1, 1, 1, 1]);
});

test('pause freezes the exact ink frame; resume continues and reduced motion finishes permanently', () => {
  const ink = new InkMotion();
  ink.sync('知止而后'); ink.begin(0); ink.sample(240, false);
  const key = ink.key;
  ink.pause(240); expect(ink.phase).toBe('paused');
  ink.sample(3000, false); expect(ink.key).toBe(key);
  ink.resume(3000); ink.sample(3000, false); expect(ink.key).toBe(key);
  ink.sample(3200, true); expect(ink.progress(0, 4)).toEqual([1, 1, 1, 1]);
  ink.sync('知止而后'); ink.begin(4000); expect(ink.sample(4000, false)).toBe(false);
});

test('focus and restored past text finish immediately, without discarding a later suffix', () => {
  const ink = new InkMotion();
  ink.sync('知止'); ink.finish();
  ink.sync('知止而后'); ink.begin(100);
  expect(ink.progress(0, 4)).toEqual([1, 1, 0, 0]);
  ink.finish(); expect(ink.phase).toBe('settled');
});
