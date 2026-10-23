import { ScrollNoiseMotion, SettlingScrollNoiseMotion } from '@/lib/flow-browser/liquid-motion';
import { streamBendSettings } from '@/lib/flow-browser/motion-profile';
import { bendDisplayPoint, bendSourcePoint } from '@/lib/flow-browser/bend';

const { perlinNoise, liquidContactWeight } = require('../../miniprogram/flow/stream-liquid') as {
  perlinNoise: (x: number, y: number, z: number) => number;
  liquidContactWeight: (x: number, materialY: number, phase?: number) => number;
};

test('the candidate keeps a bounded recoil and living surface after scrolling stops', () => {
  const motion = new SettlingScrollNoiseMotion(12.3, true, true);
  motion.sample(0, 0);
  const fast = motion.sample(2000, 16);
  expect(fast.settling).toBe(true);
  expect(Number.isFinite(fast.phase)).toBe(true);
  let at = fast;
  for (let time = 32; time <= 8000; time += 16) at = motion.sample(2000, time);
  expect(at.moving).toBe(true); expect(at.settling).toBe(false);
  const later = motion.sample(2000, 8016);
  expect(later.phase).not.toBe(at.phase);
  expect(Math.abs(later.phase - at.phase)).toBeLessThan(.01);
});

test('reduced motion and a hidden page stop the surface clock without a resumed time jump', () => {
  const motion = new SettlingScrollNoiseMotion(19, true, true);
  motion.sample(0, 0); motion.sample(20, 16);
  const hidden = motion.sample(20, 32, true);
  expect(hidden).toMatchObject({ moving: false, settling: false });
  expect(motion.sample(20, 60_000, true).phase).toBe(hidden.phase);
  const resumed = motion.sample(20, 60_016);
  expect(resumed.moving).toBe(true);
  expect(Number.isFinite(resumed.phase)).toBe(true);
});

test('the same line changes during a roll, continues changing on reversal, and holds while paused', () => {
  const motion = new ScrollNoiseMotion(12.3);
  const start = motion.advance(100);
  const rolling = motion.advance(140);
  const samples = (phase: number) => [-70, -40, -10, 20, 50, 80].map(x => liquidContactWeight(x, 260, phase));
  const difference = (a: number[], b: number[]) => Math.max(...a.map((value, i) => Math.abs(value - b[i]!)));
  expect(difference(samples(start), samples(rolling))).toBeGreaterThan(.1);
  expect(motion.advance(140)).toBe(rolling);
  const reversed = motion.advance(100);
  expect(difference(samples(start), samples(reversed))).toBeGreaterThan(.1);
  expect(difference(samples(rolling), samples(rolling + .001))).toBeLessThan(.02);
});

test('noise evolution depends on travelled distance rather than frame count', () => {
  const coarse = new ScrollNoiseMotion(32.1), fine = new ScrollNoiseMotion(32.1);
  coarse.advance(0); fine.advance(0);
  const end = coarse.advance(200);
  for (let top = 1; top <= 200; top++) fine.advance(top);
  expect(fine.advance(200)).toBeCloseTo(end, 10);
});

test('gradient noise is continuous across cells and its phase wrap', () => {
  const h = .0001;
  for (const y of [1.31, 9.27, 21.74]) {
    const at = perlinNoise(5, y, 12.4), left = perlinNoise(5 - h, y, 12.4), right = perlinNoise(5 + h, y, 12.4);
    expect(Math.abs(left - right)).toBeLessThan(.002);
    expect(Math.abs((at - left) / h - (right - at) / h)).toBeLessThan(.02);
    expect(perlinNoise(5.37, y, 289.2)).toBeCloseTo(perlinNoise(5.37, y, .2), 10);
  }
});

test.each([[450, 361], [390, 844], [1440, 900]])(
  'moving contact fields retain readable centres and accurate hits at %i × %i', (width, height) => {
    for (const noisePhase of [2.1, 9.3, 21.7, 287.6]) {
      const shape = { ...streamBendSettings(width, height, 'liquid-flow', 205), noisePhase };
      expect(bendDisplayPoint(width / 2, height / 2, shape)).toEqual({ x: width / 2, y: height / 2 });
      for (const x of [width * .3, width * .5, width * .7]) {
        let previousY = -Infinity;
        for (let y = 4; y < height - 3; y += 8) {
          const shown = bendDisplayPoint(x, y, shape);
          expect(shown.y).toBeGreaterThan(previousY);
          previousY = shown.y;
          const source = bendSourcePoint(shown.x, shown.y, shape);
          if (source.alpha) expect(Math.hypot(source.x - x, source.y - y)).toBeLessThan(.5);
        }
      }
    }
  },
);
