import { StreamGlass } from '@/lib/flow-browser/stream-glass';

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
  measureText: jest.fn((text: string) => ({ width: Array.from(text).length * 30, fontBoundingBoxAscent: 20, fontBoundingBoxDescent: 4 })),
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
  expect(mockDestroy).toHaveBeenCalledTimes(1);
  glass.draw([run], 390, 844, false); expect(mockDraw).toHaveBeenCalledTimes(1);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  expect(invalidate).toHaveBeenCalledTimes(1); expect(mockDestroy).toHaveBeenCalledTimes(1);
  glass.draw([{ ...run, text: '先后' }], 390, 844, false);
  expect(context.fillText).toHaveBeenLastCalledWith('先后', 0, 8);
  expect(mockEngine).toHaveBeenCalledTimes(2);
  glass.destroy();
  canvas.dispatchEvent(new Event('webglcontextrestored')); expect(invalidate).toHaveBeenCalledTimes(1);
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
