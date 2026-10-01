const { WheelRenderer } = require('../../miniprogram/flow/renderer');

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
