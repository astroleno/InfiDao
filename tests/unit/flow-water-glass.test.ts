import { streamBendSettings } from '@/lib/flow-browser/motion-profile';
import { bendSettings } from '@/lib/flow-browser/bend';

const { StreamGlassRenderer } = require('../../miniprogram/flow/renderer');

test('the living reader material ripples like water; retained comparisons stay unchanged', () => {
  expect(streamBendSettings(390, 844, 'liquid-live', 0).ripple).toBeGreaterThan(0);
  for (const variant of ['current', 'liquid', 'liquid-contact', 'liquid-flow', 'liquid-live-before'] as const) {
    expect(streamBendSettings(390, 844, variant, 0).ripple ?? 0).toBe(0);
  }
  expect(streamBendSettings(390, 844, 'current', 0)).toEqual(bendSettings(390, 844));
});

test.each([[false, 1], [true, 0]])('the Bend pass receives the water ripple (reduced motion %s)', (reducedMotion, ripple) => {
  const gl = new Proxy({ viewport: jest.fn(), texImage2D: jest.fn(), uniform1f: jest.fn(), isContextLost: () => false }, {
    get: (target: any, key) => key in target ? target[key] : () => {},
  });
  const renderer = Object.assign(Object.create(StreamGlassRenderer.prototype), {
    gl, uploadSizes: new Map(), screenProgram: { program: 'screen', uniforms: { sourceWindow: 'window' } },
    textTexture: 'source-input', foregroundTexture: 'foreground-input', inkTexture: 'ink-input',
    drawSurfaceQuad: jest.fn(), bindBendRows: jest.fn(), reducedMotion,
    canvas: { width: 1440, height: 900 }, glassProgram: 'original-glass', backgroundProgram: 'background',
    bendProgram: { program: {}, uniforms: { bendRipple: 'ripple' } }, glass: 'cylinder', backgroundQuad: 'quad', mesh: jest.fn(),
    composite: { buffer: 3, texture: 'composed', width: 1440, height: 900 },
    targets: [{ buffer: 1, texture: 'source', width: 720, height: 450 }, { buffer: 2, texture: 'rear', width: 720, height: 450 }],
  });
  renderer.drawSource({}, {}, { zone: 1 / 6, rounding: .12, angle: 1.2, perspective: .84, ripple: 1 });
  expect(gl.uniform1f).toHaveBeenCalledWith('ripple', ripple);
});

test('the reader water clings lightly; retained liquid comparisons keep their full adhesion', () => {
  expect(streamBendSettings(390, 844, 'liquid-live', 0).adhesion).toBeLessThan(.6);
  expect(streamBendSettings(390, 844, 'liquid-contact', 0).adhesion).toBe(1.2);
});

test('the reader glass stays crisp in the folds, keeping only a trace of depth', () => {
  const { streamProjection } = require('@/lib/flow-browser/motion-profile');
  const word = { x: 195, y: 120, wordWidth: 30, scrollTop: 0, viewportWidth: 390, viewportHeight: 844, reducedMotion: false };
  const live = streamProjection(word, 'liquid-live'), previous = streamProjection(word, 'liquid-flow');
  expect(previous.blur).toBeGreaterThan(2);
  expect(live.blur).toBeGreaterThan(0);
  expect(live.blur).toBeLessThan(previous.blur * .5);
});

const { WheelRenderer } = require('../../miniprogram/flow/renderer');

test.each([[undefined, 0], [.6, .6], [-1, 0], [4, 1]])('glass echo damping is opt-in and bounded (%s)', (echoQuiet, expected) => {
  const gl = new Proxy({ uniform1f: jest.fn() }, { get: (target: any, key) => key in target ? target[key] : () => {} });
  const renderer = Object.assign(Object.create(WheelRenderer.prototype), { gl, echoQuiet,
    timeline: { position: 0, rowOffset: 0, ambientPhase: 0, loop: false }, width: 390, height: 844, radius: 100 });
  renderer.mesh({ program: {}, uniforms: { echoQuiet: 'quiet' }, attributes: [] }, { buffer: {}, count: 6 }, 2, false);
  expect(gl.uniform1f).toHaveBeenCalledWith('quiet', expected);
});

test('the reader quiets the glass echoes behind each line; comparisons keep theirs', () => {
  expect(streamBendSettings(390, 844, 'liquid-live', 0).echoQuiet).toBeGreaterThan(0);
  expect(streamBendSettings(390, 844, 'liquid-flow', 0).echoQuiet ?? 0).toBe(0);
});
