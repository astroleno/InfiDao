import { OPTICAL_ENERGY, OpticalEnergy } from '@/lib/flow-browser/optical-energy';

const drive = (energy: OpticalEnergy, speed: number, from: number, until: number, step = 16) => {
  let top = 0;
  for (let time = from; time <= until; time += step) { top += speed * step / 1000; energy.sample(top, time, false); }
  return top;
};

test('the slow automatic reading drift keeps the glass at rest', () => {
  const energy = new OpticalEnergy();
  drive(energy, 12, 0, 3000);
  expect(energy.value).toBeLessThan(.02);
  expect(energy.dispersion).toBeCloseTo(OPTICAL_ENERGY.restDispersion, 1);
});

test('a flick lights the glass quickly and releases it over a long tail', () => {
  const energy = new OpticalEnergy();
  const top = drive(energy, 2400, 0, 160);
  expect(energy.value).toBeGreaterThan(.8);
  expect(energy.dispersion).toBeGreaterThan(OPTICAL_ENERGY.restDispersion);
  expect(energy.dispersion).toBeLessThanOrEqual(OPTICAL_ENERGY.peakDispersion);
  const lit = energy.value;
  energy.sample(top, 300, false);
  expect(energy.value).toBeLessThan(lit);
  expect(energy.value).toBeGreaterThan(.3);
  for (let time = 316; time <= 2400; time += 16) energy.sample(top, time, false);
  expect(energy.value).toBe(0);
  expect(energy.moving).toBe(false);
});

test('restored positions and long frame gaps do not read as speed', () => {
  const energy = new OpticalEnergy();
  energy.sample(0, 0, false);
  energy.sample(40_000, 16, false);
  expect(energy.value).toBe(0);
  energy.sample(40_400, 1016, false);
  expect(energy.value).toBeLessThan(.05);
});

test('reduced motion keeps the material still', () => {
  const energy = new OpticalEnergy();
  drive(energy, 2400, 0, 160);
  energy.sample(1000, 176, true);
  expect(energy.value).toBe(0);
  expect(energy.sheen).toBe(0);
});

test('only perceptible steps change the drawn level', () => {
  const energy = new OpticalEnergy();
  energy.sample(0, 0, false);
  const level = energy.level;
  energy.sample(.01, 16, false);
  expect(energy.level).toBe(level);
  drive(energy, 2400, 32, 96);
  expect(energy.level).toBeGreaterThan(level);
});

test('motion blur follows the lit level and vanishes at rest', () => {
  const energy = new OpticalEnergy();
  drive(energy, 12, 0, 1000);
  expect(energy.blur).toBe(0);
  drive(energy, 2400, 1016, 1200);
  expect(energy.blur).toBeGreaterThan(OPTICAL_ENERGY.maxBlurPx * .6);
  expect(energy.blur).toBeLessThanOrEqual(OPTICAL_ENERGY.maxBlurPx);
  energy.sample(5000, 1216, true);
  expect(energy.blur).toBe(0);
});
