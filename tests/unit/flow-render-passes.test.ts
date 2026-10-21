const { WheelRenderer, StreamGlassRenderer } = require('../../miniprogram/flow/renderer');

test('draws refraction at half dimensions and the visible text at full dimensions', () => {
  const gl = new Proxy({ viewport: jest.fn(), isContextLost: () => false }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = Object.assign(Object.create(WheelRenderer.prototype), {
    gl, quotations: {}, canvas: { width: 2000, height: 1000 },
    targets: [{ buffer: 1, width: 1000, height: 500 }, { buffer: 2, width: 1000, height: 500 }], mesh: jest.fn(),
  });
  renderer.draw();
  expect(gl.viewport.mock.calls).toEqual([[0, 0, 1000, 500], [0, 0, 1000, 500], [0, 0, 2000, 1000]]);
  expect(renderer.mesh).toHaveBeenCalledTimes(6);
});

test.each([[0, 4], [32, 2]])('a %i ms interval draws %i of four display frames', (minFrameInterval, count) => {
  let callback: (time: number) => void = () => {};
  const renderer = Object.assign(Object.create(WheelRenderer.prototype), {
    minFrameInterval, motionGeneration: 0, timeline: { tick: jest.fn() }, draw: jest.fn(),
    canvas: { requestAnimationFrame: (fn: typeof callback) => { callback = fn; return 1; }, cancelAnimationFrame() {} },
  });
  renderer.start();
  [0, 16.67, 33.34, 50.01].forEach(time => callback(time));
  expect(renderer.draw).toHaveBeenCalledTimes(count);
  renderer.stop();
  callback(66.68);
  expect(renderer.draw).toHaveBeenCalledTimes(count);
});

test.each([[false, false, 0, 1], [true, false, 1, 1], [true, true, 1, 0]])('optical profile %s and reduced motion %s select the expected shader controls', (opticalProfile, reducedMotion, profile, strength) => {
  const gl = new Proxy({ uniform1f: jest.fn() }, { get: (target: any, key) => key in target ? target[key] : () => {} });
  const renderer = Object.assign(Object.create(WheelRenderer.prototype), { gl, opticalProfile, reducedMotion, reading: 1,
    timeline: { position: 0, rowOffset: 0, ambientPhase: 0, loop: true }, width: 390, height: 844, radius: 100 });
  renderer.mesh({ program: {}, uniforms: { opticalProfile: 'profile', chromaticStrength: 'strength', reading: 'reading', edgeFadeStart: 'edge' }, attributes: [] }, { buffer: {}, count: 6 }, 2, true);
  expect(gl.uniform1f).toHaveBeenCalledWith('profile', profile);
  expect(gl.uniform1f).toHaveBeenCalledWith('strength', strength);
  expect(gl.uniform1f).toHaveBeenCalledWith('reading', 1);
  expect(gl.uniform1f).toHaveBeenCalledWith('edge', 0.9);
});

test.each([false, true])('stream readability %s leaves the original wheel opt-in only', streamReadability => {
  const gl = new Proxy({ uniform1f: jest.fn() }, { get: (target: any, key) => key in target ? target[key] : () => {} });
  const renderer = Object.assign(Object.create(WheelRenderer.prototype), { gl, streamReadability,
    timeline: { position: 0, rowOffset: 0, ambientPhase: 0, loop: false }, width: 390, height: 844, radius: 100 });
  renderer.mesh({ program: {}, uniforms: { streamReadability: 'clarity' }, attributes: [] }, { buffer: {}, count: 6 }, 2, false);
  expect(gl.uniform1f).toHaveBeenCalledWith('clarity', Number(streamReadability));
});

test.each([
  [false, false, 1, 0], [true, false, undefined, 0], [true, true, 1, 0],
  [true, false, 1, 1], [true, false, -1, 0], [true, false, 8, 1],
])('original dispersion enhancement is explicit, bounded and respects reduced motion (%s, %s, %s)', (streamReadability, reducedMotion, streamDispersion, expected) => {
  const gl = new Proxy({ uniform1f: jest.fn() }, { get: (target: any, key) => key in target ? target[key] : () => {} });
  const renderer = Object.assign(Object.create(WheelRenderer.prototype), { gl, streamReadability, reducedMotion, streamDispersion,
    timeline: { position: 0, rowOffset: 0, ambientPhase: 0, loop: false }, width: 390, height: 844, radius: 100 });
  renderer.mesh({ program: {}, uniforms: { streamDispersion: 'strength' }, attributes: [] }, { buffer: {}, count: 6 }, 2, false);
  expect(gl.uniform1f).toHaveBeenCalledWith('strength', expected);
});

test('the continuous stream uses the existing glass twice and paints no duplicate foreground text', () => {
  const gl = new Proxy({ viewport: jest.fn(), texImage2D: jest.fn(), isContextLost: () => false }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = Object.assign(Object.create(StreamGlassRenderer.prototype), {
    gl, canvas: { width: 1440, height: 900 }, screenProgram: 'screen', glassProgram: 'original-glass',
    backgroundProgram: 'background', glass: 'cylinder', backgroundQuad: 'screen-quad', mesh: jest.fn(),
    targets: [{ buffer: 1, texture: 'source', width: 720, height: 450 }, { buffer: 2, texture: 'rear', width: 720, height: 450 }],
  });
  const source = { currentVisibleGlyphs: true };
  renderer.drawSource(source);
  expect(renderer.mesh.mock.calls).toEqual([
    ['screen', 'screen-quad', 0, false],
    ['original-glass', 'cylinder', 1, false],
    ['screen', 'screen-quad', 1, false],
    ['background', 'screen-quad', 2, false],
    ['original-glass', 'cylinder', 2, false],
  ]);
  expect(gl.viewport.mock.calls).toEqual([[0, 0, 720, 450], [0, 0, 720, 450], [0, 0, 1440, 900]]);
  expect(gl.texImage2D.mock.calls[0].at(-1)).toBe(source);
  expect(Object.getPrototypeOf(StreamGlassRenderer.prototype)).toBe(WheelRenderer.prototype);
});

test('edge glyphs and original dispersion are composed before the single Bend pass', () => {
  const gl = new Proxy({ viewport: jest.fn(), texImage2D: jest.fn(), uniform1f: jest.fn(), isContextLost: () => false }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const bendProgram = { program: {}, uniforms: { bendFlare: 'flare' } };
  const renderer = Object.assign(Object.create(StreamGlassRenderer.prototype), {
    gl, canvas: { width: 1440, height: 900 }, screenProgram: 'screen', glassProgram: 'original-glass',
    backgroundProgram: 'background', bendProgram, glass: 'cylinder', backgroundQuad: 'quad', mesh: jest.fn(),
    composite: { buffer: 3, texture: 'composed', width: 1440, height: 900 },
    targets: [{ buffer: 1, texture: 'source', width: 720, height: 450 }, { buffer: 2, texture: 'rear', width: 720, height: 450 }],
  });
  const source = {}, foreground = {};
  const bend = { zone: 1 / 6, rounding: .12, angle: 1.2, perspective: .84, flare: .5 };
  renderer.drawSource(source, foreground, bend);
  expect(gl.uniform1f).toHaveBeenCalledWith('flare', .5);
  expect(renderer.mesh.mock.calls.filter((call: any[]) => call[0] === 'original-glass')).toHaveLength(2);
  expect(renderer.mesh.mock.calls.slice(-2)).toEqual([['screen', 'quad', 2, false], [bendProgram, 'quad', 3, false]]);
  expect(gl.viewport.mock.calls).toEqual([[0, 0, 720, 450], [0, 0, 720, 450], [0, 0, 1440, 900], [0, 0, 1440, 900]]);
  expect(gl.texImage2D.mock.calls.map((call: any[]) => call.at(-1))).toEqual([source, foreground]);
});

test('one ink texture feeds both glass sources and the foreground, and stops uploading when settled', () => {
  const gl = new Proxy({ TEXTURE0: 0, TEXTURE1: 1, TEXTURE2: 2, TEXTURE_2D: '2d', activeTexture: jest.fn(),
    bindTexture: jest.fn(), texImage2D: jest.fn(), isContextLost: () => false }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = Object.assign(Object.create(StreamGlassRenderer.prototype), {
    gl, canvas: { width: 390, height: 844 }, screenProgram: 'screen', glassProgram: 'glass',
    backgroundProgram: 'background', bendProgram: { program: {}, uniforms: {} },
    inkTexture: 'ink', foregroundTexture: 'foreground', textTexture: 'source',
    composite: { buffer: 3, texture: 'composite', width: 390, height: 844 },
    targets: [{ buffer: 1, texture: 'source', width: 195, height: 422 }, { buffer: 2, texture: 'rear', width: 195, height: 422 }],
    mesh: jest.fn(),
  });
  const source = {}, foreground = {}, ink = {};
  renderer.drawSource(source, foreground, {}, ink);
  expect(renderer.inkEnabled).toBe(true);
  expect(gl.activeTexture).toHaveBeenCalledWith(2);
  expect(gl.bindTexture).toHaveBeenCalledWith('2d', 'ink');
  expect(gl.texImage2D.mock.calls.map((call: any[]) => call.at(-1))).toEqual([source, foreground, ink]);
  expect(renderer.mesh.mock.calls.filter((call: any[]) => call[0] === 'screen').map((call: any[]) => call[2])).toEqual([0, 1, 2]);
  renderer.drawSource(source, foreground, {});
  expect(renderer.inkEnabled).toBe(false);
  expect(gl.texImage2D.mock.calls.map((call: any[]) => call.at(-1))).toEqual([source, foreground, ink, source, foreground]);
});
