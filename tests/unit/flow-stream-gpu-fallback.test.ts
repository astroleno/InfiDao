import { StreamGlass } from '@/lib/flow-browser/stream-glass';
import { streamBendSettings } from '@/lib/flow-browser/motion-profile';

const mockCanvasDraw = jest.fn(), mockGpuDraw = jest.fn(), mockRendererDestroy = jest.fn();
const mockCacheDraw = jest.fn(), mockCacheDestroy = jest.fn(), mockRestore = jest.fn(), mockCacheCreate = jest.fn();
jest.mock('../../miniprogram/flow/renderer', () => ({ StreamGlassRenderer: jest.fn().mockImplementation(() => ({
  gl: {}, drawSource: mockCanvasDraw, drawGpuSource: mockGpuDraw, destroy: mockRendererDestroy,
})) }));
jest.mock('@/lib/flow-browser/stream-glyph-cache', () => ({ StreamGlyphCache: jest.fn().mockImplementation(() => {
  mockCacheCreate(); return { draw: mockCacheDraw, destroy: mockCacheDestroy, restoreState: mockRestore };
}) }));
const context = {
  setTransform: jest.fn(), clearRect: jest.fn(), fillText: jest.fn(), fillRect: jest.fn(),
  save: jest.fn(), restore: jest.fn(), translate: jest.fn(), scale: jest.fn(), drawImage: jest.fn(),
  beginPath: jest.fn(), rect: jest.fn(), clip: jest.fn(),
  createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  measureText: jest.fn(() => ({ width: 60, actualBoundingBoxLeft: 30, actualBoundingBoxRight: 30,
    actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 4, fontBoundingBoxAscent: 20, fontBoundingBoxDescent: 4 })),
};
const run = { text: '知止', font: '28px Kangxi', spacing: '2px', color: '#fff', x: 195, y: 120, width: 60, scale: 1 };
const sources = { source: {}, foreground: {}, adhesion: {} };
const shape = streamBendSettings(390, 844, 'liquid-live');
let spy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks(); mockCacheDraw.mockReset().mockReturnValue(sources); mockGpuDraw.mockReset();
  spy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => spy.mockRestore());

test('only the liquid candidate uses the GPU cache; stable runs retain the original composition', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn()), runs = [run];
  glass.draw(runs, 390, 844, false);
  expect(mockCacheCreate).not.toHaveBeenCalled(); expect(mockCanvasDraw).toHaveBeenCalledTimes(1);
  expect(glass.diagnostics.fallbackCanvasBytes).toBeGreaterThan(4);
  glass.draw(runs, 390, 844, false, shape);
  expect(canvas.dataset.glyphs).toBe('cached'); expect(mockGpuDraw.mock.calls[0]![2]).toBe(true);
  expect(glass.diagnostics.fallbackCanvasBytes).toBe(4);
  glass.draw(runs, 390, 844, false, { ...shape, noisePhase: 1.3 });
  expect(mockGpuDraw.mock.calls[1]![2]).toBe(false); expect(mockCacheCreate).toHaveBeenCalledTimes(1);
  glass.draw(runs, 390, 844, false, shape, 2);
  expect(mockGpuDraw.mock.calls[2]![2]).toBe(true);
  glass.draw(runs, 390, 844, true, shape);
  expect(mockGpuDraw).toHaveBeenCalledTimes(3); expect(canvas.dataset.optics).toBe('reduced');
  glass.destroy(); expect(mockCacheDestroy).toHaveBeenCalledTimes(1);
});

test('unsupported rows use Canvas for that frame, then rebuild cached sources when supported again', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn()), runs = [run];
  glass.draw(runs, 390, 844, false, shape);
  mockCacheDraw.mockReturnValueOnce(null);
  glass.draw(runs, 390, 844, false, shape);
  expect(canvas.dataset.glyphs).toBe('canvas'); expect(mockCanvasDraw.mock.calls[0]![5]).toBe(true);
  expect(mockRestore).toHaveBeenCalledTimes(1); expect(mockCacheDestroy).not.toHaveBeenCalled();
  glass.draw(runs, 390, 844, false, shape);
  expect(mockGpuDraw.mock.calls[1]![2]).toBe(true); expect(canvas.dataset.glyphs).toBe('cached');
  expect(glass.diagnostics.fallbackCanvasBytes).toBe(4);
  glass.destroy();
});

test.each(['cache', 'compositor'])('%s failure falls back and does not retry the failed cache until size changes', failure => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  (failure === 'cache' ? mockCacheDraw : mockGpuDraw).mockImplementationOnce(() => { throw new Error('GPU failure'); });
  glass.draw([run], 390, 844, false, shape);
  expect(canvas.dataset.glyphs).toBe('canvas'); expect(canvas.dataset.optics).toBe('ready');
  expect(mockCacheDestroy).toHaveBeenCalledTimes(1); expect(mockRestore).toHaveBeenCalledTimes(1);
  glass.draw([run], 390, 844, false, shape);
  expect(mockCacheCreate).toHaveBeenCalledTimes(1); expect(mockCanvasDraw).toHaveBeenCalledTimes(2);
  glass.draw([run], 420, 844, false, streamBendSettings(420, 844, 'liquid-live'));
  expect(mockCacheCreate).toHaveBeenCalledTimes(2); expect(canvas.dataset.glyphs).toBe('cached');
  glass.destroy();
});

test('context loss releases the cache and restored drawing builds it again', () => {
  const canvas = document.createElement('canvas'), invalidate = jest.fn(), glass = new StreamGlass(canvas, invalidate);
  glass.draw([run], 390, 844, false, shape);
  const event = new Event('webglcontextlost', { cancelable: true }); canvas.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); expect(mockCacheDestroy).toHaveBeenCalledTimes(1);
  expect(canvas.style.visibility).toBe('hidden');
  glass.draw([run], 390, 844, false, shape); expect(mockGpuDraw).toHaveBeenCalledTimes(1);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  glass.draw([run], 390, 844, false, shape);
  expect(mockCacheCreate).toHaveBeenCalledTimes(2); expect(mockGpuDraw).toHaveBeenCalledTimes(2);
  expect(canvas.dataset.optics).toBe('ready'); expect(invalidate).toHaveBeenCalledTimes(2);
  glass.destroy(); expect(mockCacheDestroy).toHaveBeenCalledTimes(2);
});

test('GPU drawing keeps only the tiny measuring canvas and contracts active bounds without shrinking allocation', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  const shape = streamBendSettings(1440, 900, 'liquid-live');
  glass.draw([{ ...run, x: 200 }, { ...run, x: 1200 }], 1440, 900, false, shape);
  const wide = glass.diagnostics.sourceRegion!;
  glass.draw([{ ...run, x: 700 }], 1440, 900, false, shape);
  expect(glass.diagnostics.sourceRegion!.activeRect.width).toBeLessThan(wide.activeRect.width);
  expect(glass.diagnostics.sourceRegion!.capacity).toEqual(wide.capacity);
  expect(glass.diagnostics.fallbackCanvasBytes).toBe(4);
  expect(context.clearRect).not.toHaveBeenCalled(); expect(context.fillText).not.toHaveBeenCalled();
  glass.destroy();
});

test('retained mutable runs update through source revisions while surface-only frames reuse composition', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn()), runs = [{ ...run }];
  const frame = { sourceRevision: 1, fontRevision: 0, sourceChanged: true, surfaceChanged: true, reasons: 1 };
  glass.draw(runs, 390, 844, false, shape, 0, frame);
  runs[0]!.x += 1;
  glass.draw(runs, 390, 844, false, shape, 0, { ...frame, sourceRevision: 2 });
  expect(mockGpuDraw.mock.calls[1]![2]).toBe(true);
  glass.draw(runs, 390, 844, false, { ...shape, noisePhase: .8 }, 0, { ...frame, sourceRevision: 2 });
  expect(mockGpuDraw.mock.calls[2]![2]).toBe(false);
  expect(mockCacheDraw.mock.calls.every(call => call[5] === 0)).toBe(true);
  glass.destroy();
});
