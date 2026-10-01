import { createFlowRendererHost } from '@/lib/flow-browser/renderer-host';
import type { FlowFrame } from '@/lib/flow/contracts';

jest.mock('../../miniprogram/flow/renderer', () => ({
  WheelRenderer: jest.fn().mockImplementation((_canvas, _atlas, options) => ({
    ...options, reading: 0,
    start: jest.fn(), stop: jest.fn(), draw: jest.fn(), destroy: jest.fn(),
    animateTo: jest.fn(), hitText: jest.fn(),
    setFrames: jest.fn(function (this: { drawnReading: number; reading: number }) { this.drawnReading = this.reading; }),
  })),
}));

const { WheelRenderer } = require('../../miniprogram/flow/renderer');
const frame = {
  id: 'first', ordinal: 0, quote: '物有本末，事有终始。', fullText: '物有本末，事有终始。',
  quoteStart: 0, quoteEnd: 10, lexicalBreaks: [0, 2, 4, 5, 7, 9, 10], anchors: [],
} as unknown as FlowFrame;
const pointer = (pointerId = 1, y = 200, isPrimary = true) => ({
  pointerId, clientX: 100, clientY: y, button: 0, timeStamp: y, isPrimary,
});

describe('browser wheel lifecycle and input', () => {
  let host: ReturnType<typeof createFlowRendererHost>;
  let canvas: HTMLCanvasElement;
  let callbacks: Parameters<typeof createFlowRendererHost>[3]['callbacks'];
  let visibility: jest.SpyInstance;
  let resize: ResizeObserverCallback;
  let disconnect: jest.Mock;
  const previousObserver = global.ResizeObserver;
  const renderer = () => WheelRenderer.mock.results.at(-1).value;

  beforeEach(() => {
    jest.clearAllMocks();
    visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    disconnect = jest.fn();
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    };
    canvas = document.createElement('canvas');
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 390, height: 844 } as DOMRect);
    canvas.setPointerCapture = jest.fn();
    canvas.hasPointerCapture = jest.fn().mockReturnValue(true);
    canvas.releasePointerCapture = jest.fn();
    callbacks = { onSelect: jest.fn(), onPreview: jest.fn(), onPauseChange: jest.fn(),
      onActiveChange: jest.fn(), onSnapshot: jest.fn(), onError: jest.fn(), onReady: jest.fn() };
    host = createFlowRendererHost(canvas, document.createElement('canvas'), [frame], { paused: false, reducedMotion: false, callbacks });
  });

  afterEach(() => { host.destroy(); visibility.mockRestore(); global.ResizeObserver = previousObserver; });

  test('uses each browser animation frame with smaller refraction targets', () => {
    expect(renderer().minFrameInterval).toBe(0);
    expect(renderer().refractionScale).toBe(0.5);
  });

  test('freezes phase, cancels touch and restores the previous pause state across background and page cache', () => {
    host.pointerDown(pointer());
    const before = host.snapshot();
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(renderer().timeline.visible).toBe(false);
    expect(renderer().timeline.dragging).toBe(false);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(host.snapshot()).toEqual(before);
    const starts = renderer().start.mock.calls.length;
    host.setPaused(false);
    expect(renderer().start).toHaveBeenCalledTimes(starts);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(renderer().start).toHaveBeenCalledTimes(starts + 1);
    expect(renderer().timeline.lastTime).toBeNull();
    host.setPaused(true);
    window.dispatchEvent(new Event('pagehide'));
    expect(renderer().timeline.visible).toBe(false);
    window.dispatchEvent(new Event('pageshow'));
    expect(renderer().timeline.visible).toBe(true);
    expect(renderer().start).toHaveBeenCalledTimes(starts + 1);
    expect(host.snapshot().paused).toBe(true);
  });

  test('ignores secondary fingers and completes only the captured pointer', () => {
    const hit = { frameId: frame.id, label: '本末' };
    renderer().hitText.mockReturnValue(hit);
    host.pointerDown(pointer());
    host.pointerDown(pointer(2, 230, false));
    host.pointerMove(pointer(2, 340, false));
    host.pointerCancel(pointer(2));
    host.pointerUp(pointer(2));
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    expect(renderer().timeline.dragging).toBe(true);
    host.pointerUp(pointer());
    expect(callbacks.onSelect).toHaveBeenCalledWith(hit);
    expect(renderer().hitText).toHaveBeenCalledTimes(1);
  });

  test('treats a moved pointerup as a drag and discards gestures from the previous chain', () => {
    renderer().hitText.mockReturnValue({ frameId: frame.id, label: '本末' });
    host.pointerDown(pointer());
    host.pointerUp(pointer(1, 220));
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    host.pointerDown(pointer());
    host.switchChain([{ ...frame, id: 'second' }], null);
    host.pointerUp(pointer());
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    expect(renderer().timeline.dragging).toBe(false);
  });

  test('keeps reading available during WebGL loss and clears the error only after recovery', () => {
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(host.snapshot().paused).toBe(true);
    expect(callbacks.onError).toHaveBeenCalledWith(new Error('WEBGL_CONTEXT_LOST'));
    host.togglePause();
    expect(host.snapshot().paused).toBe(true);
    resize([], {} as ResizeObserver);
    expect(WheelRenderer).toHaveBeenCalledTimes(1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(WheelRenderer).toHaveBeenCalledTimes(2);
    expect(renderer().drawnReading).toBe(1);
    expect(callbacks.onReady).toHaveBeenCalledTimes(2);
    expect(renderer().start).not.toHaveBeenCalled();
  });

  test('renderer failure still permits static reading and successful resize recovery', () => {
    renderer().onError(new Error('GPU_FAILURE'));
    expect(callbacks.onPauseChange).toHaveBeenLastCalledWith(true);
    host.togglePause();
    expect(host.snapshot().paused).toBe(true);
    resize([], {} as ResizeObserver);
    expect(renderer().drawnReading).toBe(1);
    expect(callbacks.onReady).toHaveBeenCalledTimes(2);
  });

  test('updates reduced-motion transitions and allows explicit resume', () => {
    host.setReducedMotion(true);
    expect(host.snapshot().paused).toBe(true);
    expect(renderer().reducedMotion).toBe(true);
    host.togglePause();
    expect(host.snapshot().paused).toBe(false);
    host.switchChain([frame], host.snapshot());
    expect(host.snapshot().paused).toBe(true);
    host.setReducedMotion(false);
    expect(renderer().reducedMotion).toBe(false);
    expect(host.snapshot().paused).toBe(true);
  });

  test('reports the effective reduced-motion pause when restoring a playing snapshot', () => {
    const snapshot = host.snapshot();
    host.destroy();
    host = createFlowRendererHost(canvas, document.createElement('canvas'), [frame], {
      paused: false, reducedMotion: true, snapshot, callbacks,
    });
    expect(host.snapshot().paused).toBe(true);
    expect(callbacks.onPauseChange).toHaveBeenLastCalledWith(true);
    expect(renderer().start).not.toHaveBeenCalled();
  });

  test('preserves a requested pause when a viewport resize interrupts settling', () => {
    host.togglePause();
    expect(renderer().animateTo).toHaveBeenCalledTimes(1);
    resize([], {} as ResizeObserver);
    expect(host.snapshot().paused).toBe(true);
    expect(renderer().drawnReading).toBe(1);
    expect(renderer().start).not.toHaveBeenCalled();
  });

  test('handles native nonpassive wheel input and releases lifecycle listeners on destruction', () => {
    const wheel = new WheelEvent('wheel', { deltaY: 2, deltaMode: 1, cancelable: true });
    const before = host.snapshot().position;
    canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(host.snapshot().position).not.toBe(before);
    host.destroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
    const snapshots = (callbacks.onSnapshot as jest.Mock).mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(callbacks.onSnapshot).toHaveBeenCalledTimes(snapshots);
    expect(renderer().destroy).toHaveBeenCalledTimes(1);
    const after = new WheelEvent('wheel', { deltaY: 2, cancelable: true });
    canvas.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  test('keyboard steps pause on aligned rows and reverse across the ribbon boundary', () => {
    const before = host.snapshot();
    host.step(-1);
    const back = host.snapshot();
    expect(back.paused).toBe(true);
    expect(back.position + back.rowOffset * 512).toBeLessThan(before.position + before.rowOffset * 512);
    host.step(1);
    const forward = host.snapshot();
    expect(forward.position + forward.rowOffset * 512).toBeGreaterThan(back.position + back.rowOffset * 512);
    expect(renderer().draw).toHaveBeenCalled();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    const lost = host.snapshot();
    host.step(1);
    expect(host.snapshot()).toEqual(lost);
  });
});
