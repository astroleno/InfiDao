import { bendSettings, bendSourcePoint, bendDisplayPoint, bindBendInteraction } from '@/lib/flow-browser/bend';

test.each([[1440, 900], [390, 844], [320, 740], [844, 390]])('fold and inverse agree at %i × %i', (width, height) => {
  const settings = bendSettings(width, height);
  for (const x of [width * .2, width * .5, width * .8]) {
    for (const y of [8, 40, height * .21, height * .3, height * .5, height * .7, height * .79, height - 40, height - 8]) {
      const shown = bendDisplayPoint(x, y, settings);
      const source = bendSourcePoint(shown.x, shown.y, settings);
      expect(Math.abs(source.x - x)).toBeLessThan(.5);
      expect(Math.abs(source.y - y)).toBeLessThan(.5);
      if (y === height * .5) expect(shown).toEqual({ x, y });
    }
  }
  const top = bendDisplayPoint(width / 4, 40, settings);
  const bottom = bendDisplayPoint(width / 4, height - 40, settings);
  expect(top.x).toBeCloseTo(bottom.x);
  expect(top.y + bottom.y).toBeCloseTo(height);
  expect(settings.zone).toBeLessThanOrEqual(.46 + Number.EPSILON);
  expect(settings.zone * height).toBeCloseTo(Math.min(480, height * .46));
});

test('the continuous arc reaches the clear adjacent lines and leaves a narrow central plane', () => {
  const shape = bendSettings(1440, 900);
  expect(bendDisplayPoint(500, 200, shape).y).not.toBeCloseTo(200, 1);
  for (const y of [350, 550]) expect(bendDisplayPoint(500, y, shape).x).toBeLessThan(499);
  for (const y of [425, 450, 475]) expect(bendDisplayPoint(500, y, shape)).toEqual({ x: 500, y });
});

test('the concave rim comes nearer and enlarges around the same center on both edges', () => {
  const shape = bendSettings(390, 844), x = 80;
  const flat = bendDisplayPoint(x, 422, shape);
  const near = bendDisplayPoint(x, 160, shape);
  const rim = bendDisplayPoint(x, 60, shape);
  const bottom = bendDisplayPoint(x, 784, shape);
  expect(flat.x).toBe(x);
  expect(near.x).toBeLessThan(flat.x);
  expect(rim.x).toBeLessThan(near.x);
  expect(bottom.x).toBeCloseTo(rim.x);
});

test.each([[390, 844], [320, 740], [430, 932]])('mobile letters and line spacing foreshorten at %i × %i', (width, height) => {
  const shape = bendSettings(width, height), x = width * .25;
  const ratio = (y: number) => {
    const horizontal = (width / 2 - bendDisplayPoint(x, y, shape).x) / (width / 2 - x);
    const vertical = (bendDisplayPoint(x, y + .5, shape).y - bendDisplayPoint(x, y - .5, shape).y);
    return { horizontal, vertical, ratio: vertical / horizontal };
  };
  const near = ratio(height * .2), rim = ratio(height * .1);
  expect(near.horizontal).toBeGreaterThan(1);
  expect(near.vertical).toBeLessThan(.9);
  expect(near.ratio).toBeLessThan(.82);
  expect(rim.ratio).toBeLessThan(.62);
  expect(rim.vertical).toBeLessThan(near.vertical);
  expect(ratio(height * .8).ratio).toBeCloseTo(near.ratio);
});

test('camera distance adapts continuously and preserves the desktop projection', () => {
  expect(bendSettings(390, 844).perspective * 844).toBe(1400);
  expect(bendSettings(1440, 900).perspective * 900).toBe(400);
  expect(bendSettings(390, 844).flare).toBe(.5);
  expect(bendSettings(1440, 900).flare).toBe(0);
  for (const width of [600, 750, 900]) {
    expect(Math.abs(bendSettings(width + .1, 844).perspective - bendSettings(width - .1, 844).perspective)).toBeLessThan(.002);
    expect(Math.abs(bendSettings(width + .1, 844).flare! - bendSettings(width - .1, 844).flare!)).toBeLessThan(.002);
  }
});

test.each([[390, 844], [320, 740], [430, 932]])('a narrow mobile column visibly opens towards both rims at %i × %i', (width, height) => {
  const shape = bendSettings(width, height);
  const columnWidth = (y: number) => bendDisplayPoint(width * .86, y, shape).x - bendDisplayPoint(width * .14, y, shape).x;
  const center = columnWidth(height * .5);
  expect(center / width).toBeCloseTo(.72);
  expect(columnWidth(height * .2) / center).toBeGreaterThan(1.23);
  expect(columnWidth(height * .1) / center).toBeGreaterThan(1.45);
  expect(columnWidth(height * .8)).toBeCloseTo(columnWidth(height * .2));
  expect(columnWidth(height * .9)).toBeCloseTo(columnWidth(height * .1));
});

test('the flat-to-arc joins have continuous position, tangent and curvature', () => {
  const shape = bendSettings(390, 844), h = .02;
  const point = (y: number) => bendDisplayPoint(90, y, shape);
  for (const join of [shape.zone * shape.height, (shape.zone - shape.rounding) * shape.height]) {
    const at = point(join), left = point(join - h), right = point(join + h);
    const left2 = point(join - 2 * h), right2 = point(join + 2 * h);
    for (const axis of ['x', 'y'] as const) {
      expect(Math.abs(left[axis] - right[axis])).toBeLessThan(.05);
      expect(Math.abs((at[axis] - left[axis]) / h - (right[axis] - at[axis]) / h)).toBeLessThan(.001);
      expect(Math.abs((at[axis] - 2 * left[axis] + left2[axis]) / h ** 2 -
        (right2[axis] - 2 * right[axis] + at[axis]) / h ** 2)).toBeLessThan(.001);
    }
  }
});

test.each([[1440, 900], [390, 844], [320, 740], [844, 390], [768, 1024]])(
  'the stronger arc has no overlap or inverse jump at %i × %i', (width, height) => {
    const shape = bendSettings(width, height);
    let previousY = -Infinity;
    for (let y = 0; y <= height; y += 2) {
      const shown = bendDisplayPoint(width * .4, y, shape);
      expect(shown.y).toBeGreaterThan(previousY);
      previousY = shown.y;
      if (shown.y < 0 || shown.y > height) continue;
      const source = bendSourcePoint(shown.x, shown.y, shape);
      expect(source.alpha).toBe(1);
      expect(Math.abs(source.y - y)).toBeLessThan(.5);
      expect(Math.abs(source.x - width * .4)).toBeLessThan(.5);
    }
  },
);

test('projected pointer clicks the visible word once, while keyboard and controls remain native', () => {
  const panel = document.createElement('div');
  panel.innerHTML = '<span data-flow-optic><button>旧位置</button><button>可见词</button></span><button>原文</button>';
  document.body.append(panel);
  const [old, visible, control] = Array.from(panel.querySelectorAll('button')) as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
  const oldClick = jest.fn(), visibleClick = jest.fn(), controlClick = jest.fn();
  old.addEventListener('click', oldClick); visible.addEventListener('click', visibleClick); control.addEventListener('click', controlClick);
  const resolve = jest.fn(() => visible);
  const cleanup = bindBendInteraction(panel, resolve, jest.fn());
  old.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ctrlKey: true }));
  expect(oldClick).not.toHaveBeenCalled();
  expect(visibleClick).toHaveBeenCalledTimes(1);
  expect(visibleClick.mock.calls[0]![0].ctrlKey).toBe(true);
  expect(visible).toHaveFocus();
  old.click();
  control.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(oldClick).toHaveBeenCalledTimes(1); expect(controlClick).toHaveBeenCalledTimes(1);
  cleanup(); panel.remove();
});

test('empty folded space does not activate an invisible source word; cleanup restores native input', () => {
  const panel = document.createElement('div');
  panel.innerHTML = '<span data-flow-optic><button>经文</button></span>';
  document.body.append(panel);
  const button = panel.querySelector('button')!, clicked = jest.fn();
  button.addEventListener('click', clicked);
  const cleanup = bindBendInteraction(panel, () => null, jest.fn());
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(clicked).not.toHaveBeenCalled();
  cleanup();
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(clicked).toHaveBeenCalledTimes(1);
  panel.remove();
});
