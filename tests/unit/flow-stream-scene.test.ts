import { StreamSceneIndex } from '@/lib/flow-browser/stream-scene';
import { StreamFramePlanner, nativeRasterUnambiguous, planNativeFilterClip, planTargetRegion } from '@/lib/flow-browser/stream-frame-plan';

test('visible work depends on the viewport, while all historical rows remain indexed', () => {
  const index = new StreamSceneIndex<{ top: number; bottom: number; order: number }>();
  const rows = Array.from({ length: 10000 }, (_, order) => ({ top: order * 40, bottom: order * 40 + 32, order }));
  index.setLayout(rows);
  const visible = index.visible(200000, 200800);
  expect(visible).toHaveLength(21);
  expect(visible[0]).toBe(rows[5000]);
  expect(index.visited).toBeLessThan(80);
  expect(index.atOrBefore(399900)).toBe(rows[9997]);
  expect(index.last).toBe(rows[9999]);
});

test('a large enclosing paragraph does not force scanning unrelated historical rows', () => {
  const index = new StreamSceneIndex<{ top: number; bottom: number; order: number }>();
  index.setLayout([{ top: 0, bottom: 500000, order: 0 },
    ...Array.from({ length: 10000 }, (_, order) => ({ top: order * 40, bottom: order * 40 + 32, order: order + 1 }))]);
  expect(index.visible(300000, 300040).map(item => item.order)).toEqual([0, 7501, 7502]);
  expect(index.visited).toBeLessThan(70);
});

test('past paragraphs finish only once per layout, including backward and large scrolls', () => {
  const index = new StreamSceneIndex<{ top: number; bottom: number; order: number }>();
  const rows = Array.from({ length: 100 }, (_, order) => ({ top: order * 40, bottom: order * 40 + 32, order }));
  index.setLayout(rows);
  const finish = jest.fn();
  index.finishBefore(2010, finish); expect(finish).toHaveBeenCalledTimes(50);
  index.finishBefore(200, finish); index.finishBefore(2010, finish); expect(finish).toHaveBeenCalledTimes(50);
  index.finishBefore(4000, finish); expect(finish).toHaveBeenCalledTimes(100);
  index.setLayout(rows); index.finishBefore(40, finish); expect(finish).toHaveBeenCalledTimes(101);
});

test('hover, scroll, append and reveal invalidate the source without evicting font rasters', () => {
  const planner = new StreamFramePlanner();
  const state = { scrollTop: 0, width: 900, height: 700, reducedMotion: false, variant: 'liquid-live', surfacePhase: 0, focus: null, canvasReady: true };
  const first = planner.frame(state);
  expect(first.sourceChanged).toBe(true);
  expect(planner.frame(state).surfaceChanged).toBe(false);
  const phase = planner.frame({ ...state, surfacePhase: 1 });
  expect(phase.sourceChanged).toBe(false); expect(phase.surfaceChanged).toBe(true);
  for (const reason of ['interaction', 'layout', 'motion', 'restore'] as const) {
    planner.invalidate(reason);
    const next = planner.frame(state);
    expect(next.sourceChanged).toBe(true); expect(next.fontRevision).toBe(first.fontRevision);
  }
  expect(planner.frame({ ...state, scrollTop: 100 }).fontRevision).toBe(first.fontRevision);
  planner.invalidate('font');
  expect(planner.frame(state).fontRevision).toBe(first.fontRevision + 1);
});

test('active bounds shrink without losing capacity or leaving the old position uncleared', () => {
  const wide = planTargetRegion(undefined, { x: 0, y: 0, width: 1024, height: 700 });
  const narrow = planTargetRegion(wide, { x: 300, y: 0, width: 240, height: 700 });
  expect(narrow.capacity).toEqual(wide.capacity);
  expect(narrow.activeRect.width).toBe(240);
  expect(narrow.dirtyRect).toEqual(wide.activeRect);
});

test('native small-blur bounds retain the raster origin and the whole filter halo', () => {
  expect(planNativeFilterClip({ x: 30, y: 40, width: 20, height: 30 }, 585, 1266, .45))
    .toEqual({ x: 0, y: 0, width: 60, height: 80 });
  expect(planNativeFilterClip({ x: 560, y: 1250, width: 40, height: 30 }, 585, 1266, 4))
    .toEqual({ x: 0, y: 0, width: 585, height: 1266 });
  expect(planNativeFilterClip({ x: -50, y: 40, width: 20, height: 30 }, 585, 1266, .45)?.width).toBe(0);
});

test('native downsampled filters and unknown bounds preserve their original drawing region', () => {
  const bounds = { x: 30, y: 40, width: 20, height: 30 };
  expect(planNativeFilterClip(bounds, 585, 1266, 4.01)).toBeUndefined();
  expect(planNativeFilterClip(bounds, 585, 1266, 9)).toBeUndefined();
  expect(planNativeFilterClip({ ...bounds, width: NaN }, 585, 1266, .45)).toBeUndefined();
  expect(planNativeFilterClip(bounds, 585, 1266, Infinity)).toBeUndefined();
});

test('native raster safety checks every glyph advance and the baseline near float rounding ties', () => {
  expect(nativeRasterUnambiguous(220, 170, 1.5, [0, 18], 585, 1266)).toBe(true);
  expect(nativeRasterUnambiguous(220.375 - .00001, 170, 1.5, [0, 18], 585, 1266)).toBe(false);
  expect(nativeRasterUnambiguous(220, 170.125, 1.5, [0], 585, 1266)).toBe(false);
  expect(nativeRasterUnambiguous(220, 170, 1.5, [0, .25], 585, 1266)).toBe(false);
  expect(nativeRasterUnambiguous(220.37, 170, 1.5, [0, 18], 585, 1266)).toBe(true);
});

test('unambiguous native filters shrink tightly and preserve the saturated sampling grid', () => {
  const bounds = { x: 200, y: 160, width: 100, height: 30 };
  expect(planNativeFilterClip(bounds, 585, 1266, .45, true))
    .toEqual({ x: 190, y: 150, width: 120, height: 50 });
  const saturated = planNativeFilterClip(bounds, 585, 1266, 9, true)!;
  expect(Math.abs((2 * saturated.x + saturated.width - 585) % 36)).toBe(0);
  expect(Math.abs((2 * saturated.y + saturated.height - 1266) % 36)).toBe(0);
  expect(saturated.width).toBeLessThan(100 + 88 + 36);
  expect(saturated.height).toBeLessThan(30 + 88 + 36);
  expect(planNativeFilterClip(bounds, 585, 1266, 8.1, true)).toBeUndefined();
});

test('native sampling grids remain aligned at every clipped viewport edge', () => {
  for (const [width, height] of [[585, 1266], [1789, 1118]]) for (const sigma of [7, 9]) {
    const period = sigma === 9 ? 18 : 7;
    for (const x of [-40, 0, 200, width! - 20]) for (const y of [-40, 0, 200, height! - 20]) {
      const clip = planNativeFilterClip({ x, y, width: 80, height: 30 }, width!, height!, sigma, true)!;
      expect(clip.x).toBeGreaterThanOrEqual(0); expect(clip.y).toBeGreaterThanOrEqual(0);
      expect(clip.x + clip.width).toBeLessThanOrEqual(width!);
      expect(clip.y + clip.height).toBeLessThanOrEqual(height!);
      expect(Math.abs((2 * clip.x + clip.width - width!) % (period * 2))).toBe(0);
      expect(Math.abs((2 * clip.y + clip.height - height!) % (period * 2))).toBe(0);
    }
  }
});
