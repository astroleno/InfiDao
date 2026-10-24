import { StreamGlass } from '@/lib/flow-browser/stream-glass';
import { streamBendSettings } from '@/lib/flow-browser/motion-profile';

const mockDraw = jest.fn();
const mockDestroy = jest.fn();
const mockEngine = jest.fn();
jest.mock('../../miniprogram/flow/renderer', () => ({
  StreamGlassRenderer: jest.fn().mockImplementation((...args) => {
    mockEngine(...args);
    return { drawSource: mockDraw, destroy: mockDestroy };
  }),
}));

const context = {
  setTransform: jest.fn(), clearRect: jest.fn(), save: jest.fn(), restore: jest.fn(),
  translate: jest.fn(), scale: jest.fn(), fillText: jest.fn(), fillRect: jest.fn(),
  beginPath: jest.fn(), rect: jest.fn(), clip: jest.fn(), drawImage: jest.fn(),
  createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  measureText: jest.fn((text: string) => ({ width: Array.from(text).length * 30,
    actualBoundingBoxLeft: Array.from(text).length * 15, actualBoundingBoxRight: Array.from(text).length * 15,
    actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 4, fontBoundingBoxAscent: 20, fontBoundingBoxDescent: 4 })),
  font: '', letterSpacing: '', fillStyle: '', textAlign: '', textBaseline: '',
  globalAlpha: 1, filter: 'none',
};
let getContext: jest.SpyInstance;
const run = { text: '知止', font: 'normal 400 28px Kangxi', spacing: '2px', color: '#ffffff', x: 195, y: 422, scale: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => getContext.mockRestore());

test('only the supplied visible words and their actual positions feed the original material', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  glass.draw([run], 390, 844, false);
  expect(context.fillText).toHaveBeenCalledWith('知止', 0, 8);
  expect(context.translate).toHaveBeenCalledWith(195, 422);
  expect(context.scale).toHaveBeenCalledWith(1, 1);
  expect(context.font).toBe(run.font); expect(context.letterSpacing).toBe('2px');
  expect(mockDraw).toHaveBeenCalledTimes(1);
  expect(canvas.dataset.optics).toBe('ready');
  glass.draw([], 390, 844, false);
  expect(context.clearRect).toHaveBeenCalledTimes(4);
  expect(context.fillText).toHaveBeenCalledTimes(1);
  expect(mockEngine).toHaveBeenCalledTimes(1);
  glass.destroy(); expect(mockDestroy).toHaveBeenCalledTimes(1);
});

test('refraction receives sharp faded strokes while focused foreground stays clear', () => {
  const paints: Array<{ opacity: number; filter: string }> = [];
  context.fillText.mockImplementation(() => { paints.push({ opacity: context.globalAlpha, filter: context.filter }); });
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  glass.draw([{ ...run, folded: true, opacity: .3, blur: 2, highlighted: true }], 390, 844, false);
  expect(paints).toEqual([{ opacity: Math.sqrt(.3), filter: 'blur(0.45px)' }, { opacity: 1, filter: 'none' }]);
  expect(mockEngine.mock.calls[0]![2]).toMatchObject({ bend: true, streamReadability: true, streamDispersion: 1, refractionScale: .75 });
  glass.destroy(); context.fillText.mockImplementation(() => {});
});

test('ordinary small filters shrink tightly while saturated blur retains its sampling phase and scaled lettering keeps its raster', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  glass.draw([{ ...run, y: 120, folded: true, blur: 9 }], 390, 844, false);
  expect(context.rect).toHaveBeenCalledTimes(2);
  expect(context.rect).toHaveBeenNthCalledWith(1, 155, 98, 80, 44);
  expect(context.rect).toHaveBeenNthCalledWith(2, 121, 56, 148, 120);
  expect(context.filter).toBe('blur(9px)');
  context.rect.mockClear();
  glass.draw([{ ...run, y: 120, folded: true, blur: 3, scale: .8 }], 390, 844, false);
  expect(context.rect).not.toHaveBeenCalled();
  expect(canvas.dataset.glyphs).toBe('canvas');
  glass.destroy();
});

test('native glyph position metadata stays bounded and releases with font invalidation', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn(), true);
  glass.draw(Array.from({ length: 300 }, (_, index) => ({ ...run, text: `知${String.fromCodePoint(0x4e00 + index)}` })), 390, 844, false);
  expect(glass.diagnostics.nativePositions?.entries).toBeLessThanOrEqual(256);
  expect(glass.diagnostics.nativePositions?.bytes).toBeLessThanOrEqual(32 * 1024);
  glass.draw([], 390, 844, false, undefined, 1);
  expect(glass.diagnostics.nativePositions).toEqual({ entries: 0, bytes: 0 });
  glass.destroy();
});

test('resizing releases the old resources and reduced motion does not draw optical motion', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  glass.draw([run], 390, 844, false);
  glass.draw([run], 1440, 900, false);
  expect(mockDestroy).toHaveBeenCalledTimes(1); expect(mockEngine).toHaveBeenCalledTimes(2);
  glass.draw([run], 1440, 900, true);
  expect(mockDraw).toHaveBeenCalledTimes(2);
  expect(canvas.style.visibility).toBe('hidden'); expect(canvas.dataset.optics).toBe('reduced');
  glass.draw([run], 1440, 900, false);
  expect(canvas.style.visibility).toBe('visible');
  glass.destroy();
});

test('context loss keeps the text independent and restoration redraws only the current flow', () => {
  const canvas = document.createElement('canvas'), invalidate = jest.fn(), glass = new StreamGlass(canvas, invalidate);
  glass.draw([run], 390, 844, false);
  const lost = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lost);
  expect(lost.defaultPrevented).toBe(true); expect(canvas.style.visibility).toBe('hidden');
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(mockDestroy).toHaveBeenCalledTimes(1);
  glass.draw([run], 390, 844, false); expect(mockDraw).toHaveBeenCalledTimes(1);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  expect(invalidate).toHaveBeenCalledTimes(2); expect(mockDestroy).toHaveBeenCalledTimes(1);
  glass.draw([{ ...run, text: '先后' }], 390, 844, false);
  expect(context.fillText).toHaveBeenLastCalledWith('先后', 0, 8);
  expect(mockEngine).toHaveBeenCalledTimes(2);
  glass.destroy();
  canvas.dispatchEvent(new Event('webglcontextrestored')); expect(invalidate).toHaveBeenCalledTimes(2);
});

test('active central glyphs and their dispersion receive the same per-character ink progress', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  glass.draw([{ ...run, ink: [0, .5] }], 390, 844, false);
  expect(context.fillText).toHaveBeenCalledTimes(2);
  expect(context.fillRect).toHaveBeenCalledWith(-32, -14, 32, 28);
  expect(context.fillRect).toHaveBeenCalledWith(0, -14, 32, 28);
  const meta = mockDraw.mock.calls[0]![3] as HTMLCanvasElement;
  expect(meta).toBeInstanceOf(HTMLCanvasElement);
  expect(meta.width).toBeGreaterThanOrEqual(390);
  glass.draw([run], 390, 844, false);
  expect(mockDraw.mock.calls[1]![3]).toBeUndefined();
  expect(context.fillText).toHaveBeenCalledTimes(3);
  expect(mockEngine).toHaveBeenCalledTimes(1);
  glass.destroy(); expect(meta.width).toBe(0);
});

test('surface-only frames reuse unfinished ink until progress, font or size changes', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  const shape = streamBendSettings(390, 844, 'liquid-live');
  const runs = [{ ...run, width: 60, folded: true, ink: [1, .5] }];
  glass.draw(runs, 390, 844, false, shape);
  const metadata = mockDraw.mock.calls[0]![3];
  context.fillRect.mockClear();
  glass.draw(runs, 390, 844, false, { ...shape, noisePhase: .013 });
  expect(context.fillRect).not.toHaveBeenCalled();
  expect(mockDraw.mock.calls[1]![3]).toBe(metadata);
  expect(mockDraw.mock.calls[1]![5]).toBe(false);
  const progressed = [{ ...runs[0]!, ink: [1, .75] }];
  glass.draw(progressed, 390, 844, false, shape);
  expect(context.fillRect).toHaveBeenCalledTimes(2);
  expect(mockDraw.mock.calls[2]![5]).toBe(true);
  context.fillRect.mockClear();
  glass.draw(progressed, 390, 844, false, shape, 1);
  expect(context.fillRect).toHaveBeenCalledTimes(2);
  context.fillRect.mockClear();
  glass.draw(progressed, 420, 844, false, streamBendSettings(420, 844, 'liquid-live'), 1);
  expect(context.fillRect).toHaveBeenCalledTimes(2);
  glass.destroy();
});

test('liquid crops transparent columns at unchanged pixel density and expands for entering words', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  const shape = streamBendSettings(1440, 900, 'liquid-live');
  const runs = [{ ...run, x: 720, width: 60, folded: true }];
  glass.draw(runs, 1440, 900, false, shape);
  const source = mockDraw.mock.calls[0]![0] as HTMLCanvasElement;
  const mask = mockDraw.mock.calls[0]![4] as HTMLCanvasElement;
  const window = mockDraw.mock.calls[0]![7];
  expect(source.width).toBe(128);
  expect(source.height).toBe(900);
  expect(mask.width).toBe(source.width);
  expect(window).toEqual({ left: 640 / 1440, width: 128 / 1440, activeWidth: 128 / 1440 });
  expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, -640, 0);
  glass.draw([{ ...runs[0]!, x: 1400 }], 1440, 900, false, shape);
  expect(mockDraw.mock.calls[1]![7]).toEqual({ left: 1280 / 1440, width: 256 / 1440, activeWidth: 160 / 1440 });
  glass.draw(runs, 1440, 900, false, shape);
  expect(source.width).toBe(256); // Movement changes the active origin, not its retained allocation.
  glass.draw(runs, 1440, 900, false, streamBendSettings(1440, 900));
  expect(source.width).toBe(1440);
  expect(mockDraw.mock.calls[3]![7]).toEqual({ left: 0, width: 1, activeWidth: 1 });
  glass.destroy(); expect(source.width).toBe(0); expect(mask.width).toBe(0);
});

test('new ink keeps settled water contacts and uses separate metadata without revealing unfinished letters', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  const shape = streamBendSettings(390, 844, 'liquid-live');
  const runs = [{ ...run, width: 60, folded: true, ink: [1, 0] }, { ...run, y: 800, width: 60, folded: true }];
  glass.draw(runs, 390, 844, false, shape);
  const ink = mockDraw.mock.calls[0]![3] as HTMLCanvasElement;
  const surface = mockDraw.mock.calls[0]![4] as HTMLCanvasElement;
  expect(ink).toBeInstanceOf(HTMLCanvasElement);
  expect(surface).toBeInstanceOf(HTMLCanvasElement);
  expect(ink).not.toBe(surface);
  const contact = context.drawImage.mock.calls[0]![0];
  expect(contact).not.toBe(ink);
  expect(context.rect.mock.calls).toEqual([[-33, -15, 33, 30]]);
  expect(context.clip).toHaveBeenCalledTimes(1);
  glass.draw(runs, 390, 844, false, { ...shape, noisePhase: .013 });
  expect(mockDraw.mock.calls[1]![3]).toBe(ink);
  expect(mockDraw.mock.calls[1]![6]).toMatchObject({ current: { canvas: expect.any(HTMLCanvasElement) }, next: { canvas: expect.any(HTMLCanvasElement) } });
  const pair = mockDraw.mock.calls[1]![6];
  expect(pair.mix).toBeCloseTo(.65);
  glass.destroy();
  for (const resource of [ink, surface, contact, pair.current.canvas, pair.next.canvas]) expect(resource.width).toBe(0);
});

test('liquid batches equal row filters at original pixel density and releases the bounded layers', () => {
  const canvas = document.createElement('canvas'), glass = new StreamGlass(canvas, jest.fn());
  const shape = streamBendSettings(1440, 900, 'liquid-live');
  const paints: Array<{ filter: string; alpha: number }> = [];
  const composites: Array<{ canvas: HTMLCanvasElement; filter: string; alpha: number }> = [];
  context.fillText.mockImplementation(() => paints.push({ filter: context.filter, alpha: context.globalAlpha }));
  context.drawImage.mockImplementation((canvas: HTMLCanvasElement) => composites.push({ canvas, filter: context.filter, alpha: context.globalAlpha }));
  const runs = [0, 1, 2].map(index => ({ ...run, x: 640 + index * 80, y: 120.25,
    width: 60, folded: true, blur: 2, opacity: .4 }));
  glass.draw(runs, 1440, 900, false, shape);
  expect(paints.slice(0, 6).map(paint => paint.filter)).toEqual(Array(6).fill('none'));
  expect(paints.slice(0, 3).map(paint => paint.alpha)).toEqual(Array(3).fill(Math.sqrt(.4)));
  expect(paints.slice(3, 6).map(paint => paint.alpha)).toEqual(Array(3).fill(.4));
  expect(composites.slice(0, 2).map(({ filter, alpha }) => ({ filter, alpha })))
    .toEqual([{ filter: 'blur(0.45px)', alpha: 1 }, { filter: 'blur(2px)', alpha: 1 }]);
  const source = mockDraw.mock.calls[0]![0] as HTMLCanvasElement;
  const layers = composites.slice(0, 2).map(paint => paint.canvas);
  for (const layer of layers) { expect(layer.width).toBe(source.width); expect(layer.height).toBeLessThan(128); }
  glass.draw(runs.map(item => ({ ...item, y: item.y + 1 })), 1440, 900, false, shape);
  expect(composites.slice(3, 5).map(paint => paint.canvas)).toEqual(layers);
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  for (const layer of layers) expect(layer.width).toBe(0);
  glass.destroy();
  context.fillText.mockImplementation(() => {});
  context.drawImage.mockImplementation(() => {});
});
