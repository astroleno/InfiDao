const { WheelRenderer, StreamGlassRenderer } = require('../../miniprogram/flow/renderer');

function streamHarness(gl: unknown, config: Record<string, unknown>) {
  return Object.assign(Object.create(StreamGlassRenderer.prototype), {
    gl, uploadSizes: new Map(), screenProgram: { program: 'screen', uniforms: { sourceWindow: 'window' } },
    textTexture: 'source-input', foregroundTexture: 'foreground-input', inkTexture: 'ink-input',
    drawSurfaceQuad: jest.fn(), bindBendRows: jest.fn(), ...config,
  });
}

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
  const renderer = streamHarness(gl, {
    canvas: { width: 1440, height: 900 }, glassProgram: 'original-glass',
    backgroundProgram: 'background', glass: 'cylinder', backgroundQuad: 'screen-quad', mesh: jest.fn(),
    targets: [{ buffer: 1, texture: 'source', width: 720, height: 450 }, { buffer: 2, texture: 'rear', width: 720, height: 450 }],
  });
  const source = { currentVisibleGlyphs: true };
  renderer.drawSource(source);
  expect(renderer.mesh.mock.calls).toEqual([
    [renderer.screenProgram, 'screen-quad', 0, false],
    ['original-glass', 'cylinder', 1, false],
    [renderer.screenProgram, 'screen-quad', 1, false],
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
  const renderer = streamHarness(gl, {
    canvas: { width: 1440, height: 900 }, glassProgram: 'original-glass',
    backgroundProgram: 'background', bendProgram, glass: 'cylinder', backgroundQuad: 'quad', mesh: jest.fn(),
    composite: { buffer: 3, texture: 'composed', width: 1440, height: 900 },
    targets: [{ buffer: 1, texture: 'source', width: 720, height: 450 }, { buffer: 2, texture: 'rear', width: 720, height: 450 }],
  });
  const source = {}, foreground = {};
  const bend = { zone: 1 / 6, rounding: .12, angle: 1.2, perspective: .84, flare: .5 };
  renderer.drawSource(source, foreground, bend);
  expect(gl.uniform1f).toHaveBeenCalledWith('flare', .5);
  expect(renderer.mesh.mock.calls.filter((call: any[]) => call[0] === 'original-glass')).toHaveLength(2);
  expect(renderer.mesh).toHaveBeenLastCalledWith(renderer.screenProgram, 'quad', 2, false);
  expect(renderer.drawSurfaceQuad).toHaveBeenCalledWith(bendProgram);
  expect(gl.viewport.mock.calls).toEqual([[0, 0, 720, 450], [0, 0, 720, 450], [0, 0, 1440, 900], [0, 0, 1440, 900]]);
  expect(gl.texImage2D.mock.calls.map((call: any[]) => call.at(-1))).toEqual([source, foreground]);
});

test('one ink texture feeds both glass sources and the foreground, and stops uploading when settled', () => {
  const gl = new Proxy({ TEXTURE0: 0, TEXTURE1: 1, TEXTURE2: 2, TEXTURE_2D: '2d', activeTexture: jest.fn(),
    bindTexture: jest.fn(), texImage2D: jest.fn(), texSubImage2D: jest.fn(), isContextLost: () => false }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = streamHarness(gl, {
    canvas: { width: 390, height: 844 }, glassProgram: 'glass',
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
  expect(renderer.mesh.mock.calls.filter((call: any[]) => call[0] === renderer.screenProgram).map((call: any[]) => call[2])).toEqual([0, 1, 2]);
  renderer.drawSource(source, foreground, {}, ink, undefined, false);
  expect(renderer.inkEnabled).toBe(true);
  expect(gl.texImage2D).toHaveBeenCalledTimes(3);
  expect(gl.texSubImage2D).not.toHaveBeenCalled();
  renderer.drawSource(source, foreground, {}, ink);
  expect(gl.texSubImage2D.mock.calls.map((call: any[]) => call.at(-1))).toEqual([source, foreground, ink]);
  renderer.drawSource(source, foreground, {});
  expect(renderer.inkEnabled).toBe(false);
  expect(gl.texImage2D.mock.calls.map((call: any[]) => call.at(-1))).toEqual([source, foreground, ink]);
});

test('cropping keeps render target resolution, all dispersion passes and separate ink/contact textures', () => {
  const gl = new Proxy({ TEXTURE0: 0, TEXTURE1: 1, TEXTURE2: 2, TEXTURE_2D: '2d', SCISSOR_TEST: 'scissor',
    activeTexture: jest.fn(), bindTexture: jest.fn(), texImage2D: jest.fn(), viewport: jest.fn(),
    uniform2f: jest.fn(), scissor: jest.fn(), disable: jest.fn(), clearColor: jest.fn(), isContextLost: () => false }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = streamHarness(gl, {
    canvas: { width: 1440, height: 900 }, glassProgram: 'glass', opticalProfile: true,
    bendProgram: { program: 'bend', uniforms: {} }, backgroundQuad: 'quad', glass: 'cylinder',
    inkTexture: 'ink', textTexture: 'source', foregroundTexture: 'foreground', texture: jest.fn().mockReturnValueOnce('contact-a').mockReturnValueOnce('contact-b'),
    composite: { buffer: 3, texture: 'composite', width: 1440, height: 900 },
    targets: [{ buffer: 1, texture: 'source', width: 1080, height: 675 }, { buffer: 2, texture: 'rear', width: 1080, height: 675 }],
    mesh: jest.fn(), drawLiquidField: jest.fn(),
  });
  const source = { width: 640, height: 900 }, foreground = { ...source }, ink = { width: 1440, height: 900 }, mask = { ...source };
  const window = { left: 400 / 1440, width: 640 / 1440 }, bend = { liquid: true, adhesion: 1.2 };
  renderer.drawSource(source, foreground, bend, ink, mask, true, undefined, window);
  expect(renderer.surfaceTexture).toBe('contact-a');
  expect(renderer.inkTexture).toBe('ink');
  expect(gl.texImage2D.mock.calls.map((call: any[]) => call.at(-1))).toEqual([source, foreground, ink, mask]);
  expect(renderer.mesh.mock.calls.filter((call: any[]) => call[0] === 'glass')).toHaveLength(2);
  expect(gl.scissor.mock.calls).toEqual([[299, 0, 482, 675], [299, 0, 482, 675], [399, 0, 642, 900]]);
  expect(gl.uniform2f).toHaveBeenCalledWith('window', window.left, window.width);
  expect(gl.disable).toHaveBeenCalledWith('scissor');
  expect(gl.clearColor).toHaveBeenCalledWith(2 / 255, 3 / 255, 3 / 255, 1);
  expect(renderer.drawLiquidField).toHaveBeenCalledWith(bend, window);
  expect(renderer.drawSurfaceQuad).toHaveBeenCalledWith(renderer.bendProgram);
  renderer.drawSource(source, foreground, bend, undefined, mask, false, undefined, window);
  expect(renderer.mesh).toHaveBeenCalledTimes(5); // Phase-only frames retain the composite.
  expect(renderer.drawSurfaceQuad).toHaveBeenCalledTimes(2);
  gl.scissor.mockClear();
  renderer.drawSource(source, foreground, bend, undefined, mask, true, undefined, { ...window, activeWidth: 320 / 1440 });
  expect(gl.scissor.mock.calls).toEqual([[299, 0, 242, 675], [299, 0, 242, 675], [399, 0, 322, 900]]);
  expect(gl.uniform2f).toHaveBeenCalledWith('window', window.left, window.width); // Storage UVs do not contract.
});

test('the liquid field clears neutral pixels and draws only guarded fold bands within active source bounds', () => {
  const gl = new Proxy({ SCISSOR_TEST: 'scissor', scissor: jest.fn(), clear: jest.fn(), clearColor: jest.fn(),
    enable: jest.fn(), disable: jest.fn(), uniform2f: jest.fn() }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = streamHarness(gl, { width: 1000, liquidProgram: { program: 'liquid', uniforms: { sourceWindow: 'window' } },
    liquidTarget: { buffer: 1, texture: 'field', width: 660, height: 600 } });
  renderer.drawLiquidField({ zone: .3, adhesion: 1 }, { left: .2, width: .7, activeWidth: .3 });
  expect(gl.clearColor).toHaveBeenCalledWith(128 / 255, 128 / 255, 0, 0);
  expect(gl.clear).toHaveBeenCalledTimes(1);
  expect(gl.scissor.mock.calls).toEqual([[95, 0, 272, 181], [95, 419, 272, 181]]);
  expect(gl.uniform2f).toHaveBeenCalledWith('window', .2, .7);
  expect(renderer.drawSurfaceQuad).toHaveBeenCalledTimes(2);
  expect(gl.disable).toHaveBeenLastCalledWith('scissor');
});

test('noise hashes upload only when integer cells change and are released with the renderer', () => {
  const gl = new Proxy({ TEXTURE0: 0, TEXTURE5: 5, TEXTURE_2D: '2d', activeTexture: jest.fn(),
    texImage2D: jest.fn(), texSubImage2D: jest.fn(), deleteTexture: jest.fn() }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = streamHarness(gl, { width: 1440, height: 900, buffers: [], programs: [], targets: [],
    texture: jest.fn().mockReturnValueOnce('contact-hashes').mockReturnValueOnce('surface-hashes'),
    stop: jest.fn(),
  });
  renderer.bindNoiseHashes({ adhesionScroll: 0, noisePhase: .3 });
  expect(gl.texImage2D).toHaveBeenCalledTimes(2);
  const first = renderer.noiseHashes.map((slot: any) => slot.frame);
  renderer.bindNoiseHashes({ adhesionScroll: 0, noisePhase: .4 });
  expect(renderer.noiseHashes.map((slot: any) => slot.frame)).toEqual(first);
  expect(gl.texImage2D).toHaveBeenCalledTimes(2);
  expect(gl.texSubImage2D).not.toHaveBeenCalled();
  renderer.bindNoiseHashes({ adhesionScroll: 0, noisePhase: 1.4 });
  expect(gl.texSubImage2D).toHaveBeenCalledTimes(2);
  expect(gl.activeTexture).toHaveBeenLastCalledWith(0);
  renderer.destroy();
  expect(gl.deleteTexture).toHaveBeenCalledWith('contact-hashes');
  expect(gl.deleteTexture).toHaveBeenCalledWith('surface-hashes');
  expect(renderer.noiseHashes).toBeNull();
});

test.each([false, true])('GPU glyph sources share the original compositor and retain external texture ownership (failure %s)', fails => {
  const gl = new Proxy({ isContextLost: () => false, deleteTexture: jest.fn(), texImage2D: jest.fn() }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = streamHarness(gl, { buffers: [], programs: [], targets: [], stop: jest.fn(),
    surfaceTexture: 'owned-contact', nextSurfaceTexture: 'owned-next', surfaceMix: .4, sourcePremultiplied: false });
  const sources = { source: 'cached-source', foreground: 'cached-front', ink: 'cached-ink', adhesion: 'cached-contact' };
  renderer.composeSource = jest.fn(() => {
    expect(renderer.textTexture).toBe(sources.source); expect(renderer.foregroundTexture).toBe(sources.foreground);
    expect(renderer.inkTexture).toBe(sources.ink); expect(renderer.surfaceTexture).toBe(sources.adhesion);
    expect(renderer.nextSurfaceTexture).toBeNull(); expect(renderer.sourcePremultiplied).toBe(true);
    if (fails) throw new Error('compositor failed');
  });
  const draw = () => renderer.drawGpuSource(sources, { liquid: true }, false, { left: .2, width: .5 });
  if (fails) expect(draw).toThrow('compositor failed'); else draw();
  expect(renderer.composeSource).toHaveBeenCalledWith({ liquid: true }, sources.ink, sources.adhesion, sources.foreground, false, { left: .2, width: .5 });
  expect(renderer.textTexture).toBe('source-input'); expect(renderer.inkTexture).toBe('ink-input');
  expect(renderer.surfaceTexture).toBe('owned-contact'); expect(renderer.surfaceMix).toBe(.4);
  expect(renderer.sourcePremultiplied).toBe(false); expect(gl.texImage2D).not.toHaveBeenCalled();
  renderer.destroy();
  for (const texture of Object.values(sources)) expect(gl.deleteTexture).not.toHaveBeenCalledWith(texture);
});
