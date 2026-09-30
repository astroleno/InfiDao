import { crossedDragThreshold, isPrimaryPointer, pointerLocalPoint } from '@/lib/flow-browser/pointer';
import { shouldPrefetchFlow } from '@/lib/flow-browser/prefetch';

describe('browser flow pointer coordinates', () => {
  test('maps viewport coordinates into canvas logical pixels after layout scaling', () => {
    expect(pointerLocalPoint({ clientX: 200, clientY: 384 }, { left: 40, top: 64, width: 320, height: 640 }, 640, 1280))
      .toEqual({ x: 320, y: 640 });
  });

  test('locks a tap until movement crosses the native drag threshold', () => {
    const start = { x: 100, y: 200 };
    expect(crossedDragThreshold(start, { x: 104, y: 204 })).toBe(false);
    expect(crossedDragThreshold(start, { x: 100, y: 208 })).toBe(true);
    expect(isPrimaryPointer({ button: 0 })).toBe(true);
    expect(isPrimaryPointer({ button: 2 })).toBe(false);
  });
});

test('stationary static reading does not spend model calls; animation or movement near the edge can continue', () => {
  const first = { ordinal: 1, lastOrdinal: 1, frameCount: 1, moved: false, paused: true, reducedMotion: false };
  expect(shouldPrefetchFlow(first)).toBe(false);
  expect(shouldPrefetchFlow({ ...first, paused: false, reducedMotion: true })).toBe(false);
  expect(shouldPrefetchFlow({ ...first, paused: false })).toBe(true);
  expect(shouldPrefetchFlow({ ...first, moved: true })).toBe(true);
  expect(shouldPrefetchFlow({ ...first, frameCount: 2, lastOrdinal: 2, paused: false })).toBe(false);
  expect(shouldPrefetchFlow({ ...first, frameCount: 3, lastOrdinal: 3, ordinal: 2, moved: true })).toBe(true);
  expect(shouldPrefetchFlow({ ...first, frameCount: 4, lastOrdinal: 4, ordinal: 1, moved: true })).toBe(false);
});
