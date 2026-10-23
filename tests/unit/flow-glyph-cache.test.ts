import { StreamGlyphCache } from '@/lib/flow-browser/stream-glyph-cache';
import { streamBendSettings } from '@/lib/flow-browser/motion-profile';
import type { OpticalRun } from '@/lib/flow-browser/stream-glass';

const context = {
  setTransform: jest.fn(), fillText: jest.fn(), fillRect: jest.fn(), drawImage: jest.fn(), clearRect: jest.fn(), putImageData: jest.fn(),
  getImageData: jest.fn(() => ({ data: new Uint8Array([255, 255, 255, 255]) })),
};
const measure = (_run: OpticalRun, text = _run.text) => ({
  width: text.length * 30, actualBoundingBoxLeft: text.length * 15, actualBoundingBoxRight: text.length * 15,
  actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 4, fontBoundingBoxAscent: 20, fontBoundingBoxDescent: 4,
}) as TextMetrics;
const run: OpticalRun = { text: '知止', font: '28px Kangxi', spacing: '2px', color: '#fff', x: 195, y: 120,
  width: 60, scale: 1, folded: true, opacity: .6, blur: 2 };
let spy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  spy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => spy.mockRestore());

function harness(textureSize = 4096, profile = false) {
  let id = 0;
  const api: Record<string, any> = {
    getParameter: jest.fn((name: string) => name === 'MAX_TEXTURE_SIZE' ? textureSize : 8),
    getShaderParameter: jest.fn(() => true), getProgramParameter: jest.fn(() => true),
    getAttribLocation: jest.fn(() => 0), getUniformLocation: jest.fn((_program, name) => name),
    checkFramebufferStatus: jest.fn(() => 'FRAMEBUFFER_COMPLETE'),
  };
  const gl = new Proxy(api, { get: (target, key: string) => {
    if (key in target) return target[key];
    if (key === key.toUpperCase()) return key;
    return target[key] = jest.fn(key.startsWith('create') ? () => ({ id: ++id }) : undefined);
  } });
  const cache = new StreamGlyphCache(gl as WebGLRenderingContext, profile);
  const draw = (runs: OpticalRun[] = [run], changed = true, revision = 1, width = 390) => cache.draw(runs, width, 844, 1.5,
    streamBendSettings(width, 844, 'liquid-live'), revision, measure,
    new Map(runs.map(item => [Math.round(item.y * 2), { left: 165, right: 225 }])), 0, Math.round(width * 1.5), changed);
  return { gl, cache, draw };
}

test('scroll, opacity, blur and ink progress reuse glyph pixels at twice the existing backing density', () => {
  const { gl, cache, draw } = harness();
  const first = draw();
  expect(first).toMatchObject({ source: expect.anything(), foreground: expect.anything(), adhesion: expect.anything() });
  expect(context.setTransform).toHaveBeenCalledWith(3, 0, 0, 3, expect.any(Number), expect.any(Number));
  const rasterUploads = () => gl.texSubImage2D.mock.calls.filter((call: unknown[]) => call.at(-1) instanceof HTMLCanvasElement);
  expect(rasterUploads()).toHaveLength(1);
  context.fillText.mockClear();
  const moved = { ...run, x: 196, y: 121.5, opacity: .4, blur: 3 };
  draw([moved]);
  draw([{ ...moved, ink: [.1, 1] }]);
  draw([{ ...moved, ink: [.7, 1] }]);
  expect(context.fillText).not.toHaveBeenCalled();
  expect(rasterUploads()).toHaveLength(1);
  cache.destroy();
});

test('new rows use native coverage composition without full-row pixel readback', () => {
  const { cache, draw } = harness();
  draw();
  expect(context.getImageData).toHaveBeenCalledTimes(1); // The one-pixel CSS color parser only.
  expect(context.getImageData).toHaveBeenCalledWith(0, 0, 1, 1);
  expect(context.putImageData).not.toHaveBeenCalled();
  context.getImageData.mockClear();
  draw([{ ...run, text: '定静' }]);
  expect(context.getImageData).not.toHaveBeenCalled();
  cache.destroy();
});

test('unchanged contact bytes do not upload again, and changed rows upload only their range', () => {
  const { gl, cache, draw } = harness();
  draw();
  const uploads = () => gl.texSubImage2D.mock.calls.filter((call: unknown[]) => call.at(-1) instanceof Uint8Array);
  expect(uploads()).toHaveLength(1);
  expect(uploads()[0]!.slice(2, 6)).toEqual([0, 0, 129, 1]);
  draw([run], false);
  expect(uploads()).toHaveLength(1);
  draw([{ ...run, y: 250 }]);
  expect(uploads()).toHaveLength(2);
  expect(cache.diagnostics.gradientUploads).toBe(2);
  cache.destroy();
});

test('CPU phase timing is opt in and reports cache hits without new-cell work', () => {
  const now = jest.spyOn(performance, 'now');
  const normal = harness(); normal.draw();
  expect(now).not.toHaveBeenCalled();
  expect(normal.cache.diagnostics).not.toHaveProperty('timings');
  normal.cache.destroy();
  const profiled = harness(4096, true); profiled.draw();
  expect(profiled.cache.diagnostics.timings).toMatchObject({ rowsMs: expect.any(Number), newCellsMs: expect.any(Number) });
  profiled.draw();
  expect(profiled.cache.diagnostics.timings).toMatchObject({ newGlyphsMs: 0, newCellsMs: 0, atlasUploadMs: 0 });
  profiled.cache.destroy(); now.mockRestore();
});

test('only font identity and raster origin invalidate glyph pixels; row layout reuses them', () => {
  const { cache, draw } = harness();
  draw(); draw([run], true, 2); draw([{ ...run, spacing: '3px' }], true, 2);
  draw([run, { ...run, x: 275 }], true, 2); draw([run, { ...run, x: 280 }], true, 2);
  draw([run], true, 2, 420);
  expect(context.fillText).toHaveBeenCalledTimes(3);
  expect(cache.diagnostics.fontInvalidations).toBe(1);
  cache.destroy();
});

test('a phase-only frame retains the source, foreground and ink targets and performs no lettering upload', () => {
  const { gl, cache, draw } = harness();
  const runs = [{ ...run, ink: [.5, 1] }], first = draw(runs);
  context.fillText.mockClear(); gl.texImage2D.mockClear(); gl.texSubImage2D.mockClear(); gl.bufferData.mockClear(); gl.bufferSubData.mockClear();
  expect(draw(runs, false)).toEqual(first);
  expect(context.fillText).not.toHaveBeenCalled(); expect(gl.texImage2D).not.toHaveBeenCalled();
  expect(gl.texSubImage2D.mock.calls.every((call: unknown[]) => call.at(-1) instanceof Uint8Array)).toBe(true);
  expect(gl.bufferData).not.toHaveBeenCalled();
  expect(gl.bufferSubData).toHaveBeenCalledTimes(2); // Contact mask, horizontal and vertical.
  cache.destroy();
});

test('settled frames omit ink work while focused and fully revealed central words keep their foreground', () => {
  const { gl, cache, draw } = harness();
  expect(draw()).not.toHaveProperty('ink');
  expect(gl.bufferSubData).toHaveBeenCalledTimes(6); // Three separable layers; no metadata rectangles.
  expect(context.fillRect).toHaveBeenCalledWith(-30, 14, 60, 1);
  context.fillRect.mockClear();
  context.fillText.mockClear();
  draw([{ ...run, highlighted: true }]);
  expect(context.fillRect).not.toHaveBeenCalled(); expect(context.fillText).not.toHaveBeenCalled();
  gl.bufferSubData.mockClear();
  draw([{ ...run, folded: false, ink: [1, 1] }]);
  expect(gl.bufferSubData).toHaveBeenCalledTimes(4); // Both source and foreground survive.
  cache.destroy();
});

test('unsupported scales, blur or row counts request the original Canvas path without lowering quality', () => {
  const { cache, draw } = harness();
  expect(draw([{ ...run, scale: .9 }])).toBeNull();
  expect(draw([{ ...run, blur: 9 }])).toBeNull();
  expect(draw(Array.from({ length: 65 }, (_, index) => ({ ...run, y: index * 2 })))).toBeNull();
  expect(draw()).not.toBeNull();
  cache.destroy();
});

test('destroy releases every cache texture, framebuffer, shader program and buffer', () => {
  const { gl, cache, draw } = harness(); draw(); cache.destroy();
  for (const [create, remove] of [['createTexture', 'deleteTexture'], ['createFramebuffer', 'deleteFramebuffer'],
    ['createProgram', 'deleteProgram'], ['createBuffer', 'deleteBuffer']]) {
    const created = gl[create!].mock.results.map((result: { value: unknown }) => result.value);
    expect(gl[remove!].mock.calls.map((call: unknown[]) => call[0])).toEqual(expect.arrayContaining(created));
  }
});

test('splitting a row for focus reuses basic glyph pixels and does not reset its font atlas', () => {
  const { cache, draw } = harness();
  const left = { ...run, text: '知', x: 165, width: 30 }, right = { ...run, text: '止', x: 200, width: 30 };
  draw([left, right]); context.fillText.mockClear();
  draw([left, { ...right, highlighted: true, blur: 0 }]);
  draw([left, right]);
  expect(context.fillText).not.toHaveBeenCalled();
  expect(cache.diagnostics).toMatchObject({ rasterizations: 2, fontInvalidations: 0 });
  cache.destroy();
});

test('a full atlas evicts old cells while pinning visible text, with a fixed memory bound', () => {
  const { gl, cache, draw } = harness(512);
  const fixed = { ...run, text: '定', width: 30 };
  draw([fixed]);
  const texturesBefore = gl.deleteTexture.mock.calls.length;
  for (let i = 0; i < 90; i++) draw([fixed, { ...run, text: String.fromCodePoint(0x5000 + i), width: 30, y: 300 }]);
  expect(cache.diagnostics.evictions).toBeGreaterThan(0);
  expect(cache.diagnostics.fontInvalidations).toBe(0);
  expect(cache.diagnostics.atlasBytes).toBe(2 * 512 * 512 * 4);
  expect(cache.diagnostics.glyphBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(context.fillText.mock.calls.filter(call => call[0] === '定')).toHaveLength(1);
  expect(gl.deleteTexture.mock.calls.length).toBe(texturesBefore); // Cell reuse, not atlas destruction.
  cache.destroy();
});
