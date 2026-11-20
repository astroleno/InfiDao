/**
 * Frozen reader material. Core water, emergence/submersion, fire-coloured
 * caustics and the random ripple are product decisions, not tuning knobs.
 * A failure here means one of them changed. Do not update these snapshots
 * unless that change was explicitly approved.
 */
import { createHash } from 'node:crypto';
import { ScrollNoiseMotion, SettlingScrollNoiseMotion } from '@/lib/flow-browser/liquid-motion';
import { LIVE_ADHESION, streamBendSettings, streamProjection } from '@/lib/flow-browser/motion-profile';
import { bendSourcePoint } from '@/lib/flow-browser/bend';

const liquid = require('../../miniprogram/flow/stream-liquid');
const { BEND_FRAGMENT } = require('../../miniprogram/flow/stream-bend');
const { SHADER_PROGRAMS } = require('../../miniprogram/flow/renderer');

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const round = (value: number) => Math.round(value * 1e6) / 1e6;

test('core water, caustics and ripple shader sources are unchanged', () => {
  const sources = {
    PERLIN_GLSL: hash(liquid.PERLIN_GLSL),
    CONTACT_GLSL: hash(liquid.CONTACT_GLSL),
    ADHESION_PROFILE_GLSL: hash(liquid.ADHESION_PROFILE_GLSL),
    LIQUID_FIELD_FRAGMENT: hash(liquid.LIQUID_FIELD_FRAGMENT),
    LIQUID_OPTICS_GLSL: hash(liquid.LIQUID_OPTICS_GLSL),
    // Fold geometry, submersion, ripple fire, meniscus and caustics.
    BEND_FRAGMENT: hash(BEND_FRAGMENT),
  };
  expect(sources).toMatchSnapshot();
});

test('linked liquid, bend and glass programs are unchanged', () => {
  const programs = Object.fromEntries((SHADER_PROGRAMS as { name: string; vertex: string; fragment: string }[])
    .filter(({ name }) => /^(liquid|bend|glass)/.test(name))
    .map(({ name, vertex, fragment }) => [name, hash(`${vertex}\n${fragment}`)]));
  expect(programs).toMatchSnapshot();
});

test('the random ripple field and contact weights are unchanged', () => {
  const samples: number[] = [];
  for (let i = 0; i < 24; i++) {
    samples.push(round(liquid.perlinNoise(i * 1.37 + .2, i * .71 + 3.1, i * .29)));
    samples.push(round(liquid.liquidContactWeight(i * 17.3, i * 41.9, i * .5)));
  }
  expect(samples).toMatchSnapshot();
});

test('scroll noise motion advances and settles exactly as before', () => {
  const scroll = new ScrollNoiseMotion(12.5);
  const settling = new SettlingScrollNoiseMotion(12.5, true, true);
  const trace: number[] = [];
  for (let frame = 0; frame < 90; frame++) {
    const top = frame < 40 ? frame * 23 : 920;
    trace.push(round(scroll.advance(top)), round(settling.sample(top, frame * 16).phase));
  }
  expect(trace).toMatchSnapshot();
});

test('live water settings and the emergence/submersion projection are unchanged', () => {
  expect(LIVE_ADHESION).toBe(.4);
  const sizes = [[390, 844], [820, 1180], [1440, 900]] as const;
  const shapes = sizes.map(([width, height]) => streamBendSettings(width, height, 'liquid-live', 300));
  const projection = sizes.flatMap(([width, height]) => [0, .1, .25, .4, .5, .6, .75, .9, 1].map(fraction => {
    const result = streamProjection({ x: width / 2, y: height * fraction, wordWidth: 40,
      viewportWidth: width, viewportHeight: height, scrollTop: 0, reducedMotion: false }, 'liquid-live');
    return [round(result.blur), round(result.opacity), round(result.fire)];
  }));
  // Display pixels across both folds, off-axis so lateral flare is covered.
  const fold = shapes.flatMap(shape => [.02, .05, .15, .3, .5, .7, .85, .95, .98].map(y => {
    const point = bendSourcePoint(shape.width * .3, shape.height * y, shape);
    return [round(point.x), round(point.y), round(point.alpha)];
  }));
  expect({ shapes, projection, fold }).toMatchSnapshot();
});
