import { bendSettings, bendDisplayPoint, bendSourcePoint } from '@/lib/flow-browser/bend';
import { streamBendSettings } from '@/lib/flow-browser/motion-profile';

const { perlinNoise, noiseHashGrid } = require('../../miniprogram/flow/stream-liquid');

type HashGrid = { left: number; top: number; width: number; height: number; z: number; data: Uint8Array };

function cachedNoise(x: number, y: number, z: number, grid: HashGrid) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const dx = x - ix, dy = y - iy, dz = z - iz;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const gradient = (cx: number, cy: number, cz: number) => {
    const h = grid.data[((iy + cy - grid.top) * grid.width + ix + cx - grid.left) * 4 + cz]!;
    const d = [dx - cx, dy - cy, dz - cz], u = h < 8 ? d[0]! : d[1]!;
    const v = h < 4 ? d[1]! : h === 12 || h === 14 ? d[0]! : d[2]!;
    return (h % 2 < 1 ? u : -u) + (Math.floor(h / 2) % 2 < 1 ? v : -v);
  };
  const layer = (cz: number) => mix(mix(gradient(0, 0, cz), gradient(1, 0, cz), fade(dx)),
    mix(gradient(0, 1, cz), gradient(1, 1, cz), fade(dx)), fade(dy));
  expect(iz).toBe(grid.z);
  return mix(layer(0), layer(1), fade(dz));
}

test.each([[390, 844, 0, .26], [1440, 900, 450, .713], [2560, 1440, 125000, 288.999], [320, 568, -120, -.4]])(
  'cached gradient cells retain the exact noise field at %i × %i, scroll %i, phase %f', (width, height, scroll, phase) => {
    for (const contact of [true, false]) {
      const grid: HashGrid = noiseHashGrid(width, height, scroll, phase, contact);
      const z = contact ? Math.fround(phase) : Math.fround(Math.fround(phase) + Math.fround(.73));
      for (const xf of [0, .01, .25, .5, .75, .99, 1]) for (const yf of [0, .03, .5, .97, 1]) {
        const x = (xf - .5) * width * (contact ? .034 : .019) + (contact ? 11.7 : 4.3);
        const y = (scroll + yf * height) * (contact ? .012 : .011) + (contact ? 3.1 : 7.2);
        expect(cachedNoise(x, y, z, grid)).toBeCloseTo(perlinNoise(x, y, z), 12);
      }
      expect(grid.data.length).toBeLessThan(16_384);
      expect(noiseHashGrid(width, height, scroll, phase, contact, grid)).toBe(grid);
      const next: HashGrid = noiseHashGrid(width, height, scroll, phase + 1, contact, grid);
      expect(next).not.toBe(grid);
      expect(next.data).toBe(grid.data);
    }
  },
);

test('gradient caching uses the same float phase boundary as the shader', () => {
  for (const phase of [.26999999, .27, .99999999, 288.99999999]) {
    const contact = noiseHashGrid(1440, 900, 0, phase, true);
    const surface = noiseHashGrid(1440, 900, 0, phase, false);
    expect(contact.z).toBe(Math.floor(Math.fround(phase)));
    expect(surface.z).toBe(Math.floor(Math.fround(Math.fround(phase) + Math.fround(.73))));
  }
});

test.each([[450, 361], [390, 477], [390, 844], [1440, 900]])(
  'distributed contacts preserve a continuous, clickable fold at %i × %i', (width, height) => {
    for (const scroll of [0, 145, 420, 900]) {
      const shape = streamBendSettings(width, height, 'liquid-contact', scroll);
      for (const x of [width * .25, width * .4, width * .5, width * .6, width * .75]) {
        let previousY = -Infinity;
        for (let y = 4; y < height - 3; y += 8) {
          const shown = bendDisplayPoint(x, y, shape);
          expect(shown.y).toBeGreaterThan(previousY);
          previousY = shown.y;
          const source = bendSourcePoint(shown.x, shown.y, shape);
          if (!source.alpha) continue;
          expect(Math.hypot(source.x - x, source.y - y)).toBeLessThan(.5);
        }
      }
    }
  },
);

test('middle strokes can attach at either rim with different contacts for successive lines', () => {
  const width = 450, height = 361, base = bendSettings(width, height);
  for (const y of [height * .18, height * .82]) {
    const samples = [0, 58, 116, 174, 232, 290, 348, 406, 464, 522].map(scroll => {
      const shape = streamBendSettings(width, height, 'liquid-contact', scroll);
      return [-60, -30, 0, 30, 60].map(offset => {
        const x = width / 2 + offset;
        return Math.abs(bendDisplayPoint(x, y, shape).y - bendDisplayPoint(x, y, base).y);
      });
    });
    expect(Math.max(...samples.map(row => row[2]!))).toBeGreaterThan(2);
    expect(new Set(samples.map(row => row.indexOf(Math.max(...row)))).size).toBeGreaterThan(2);
    expect(samples.some(row => Math.abs(row[0]! - row[4]!) > 1)).toBe(true);
  }
});

test('scrubbing back restores the same contacts and the central reading plane stays clear', () => {
  const width = 390, height = 844;
  const before = streamBendSettings(width, height, 'liquid-contact', 205);
  const saved = bendDisplayPoint(190, 110, before);
  for (const scroll of [420, 900, 0, 145, 205]) {
    const shape = streamBendSettings(width, height, 'liquid-contact', scroll);
    for (const x of [90, 195, 300]) {
      expect(bendDisplayPoint(x, height / 2, shape)).toEqual({ x, y: height / 2 });
    }
  }
  expect(bendDisplayPoint(190, 110, streamBendSettings(width, height, 'liquid-contact', 205))).toEqual(saved);
  expect(streamBendSettings(width, height, 'current', 205)).toEqual(bendSettings(width, height));
  expect(streamBendSettings(width, height, 'liquid-caustic', 205).contacts).toBe(false);
});
