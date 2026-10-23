import { StreamSceneIndex } from '@/lib/flow-browser/stream-scene';
import { StreamFramePlanner, planTargetRegion } from '@/lib/flow-browser/stream-frame-plan';

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
