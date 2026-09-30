import { observeFlowViewport } from '@/lib/flow-browser/viewport';

test('keeps overlays above the keyboard, follows viewport panning, and cleans up listeners', () => {
  const viewport = Object.assign(new EventTarget(), { height: 390, offsetTop: 0, scale: 1 });
  const host = Object.assign(new EventTarget(), { visualViewport: viewport, innerHeight: 390 });
  const root = document.createElement('main');
  root.getBoundingClientRect = () => ({ top: 0, bottom: 390 } as DOMRect);
  const stop = observeFlowViewport(root, host as unknown as Window);
  expect(root.style.getPropertyValue('--flow-visible-height')).toBe('390px');
  viewport.height = 180;
  viewport.dispatchEvent(new Event('resize'));
  expect(root.style.getPropertyValue('--flow-visible-bottom')).toBe('210px');
  viewport.offsetTop = 60;
  viewport.dispatchEvent(new Event('scroll'));
  expect(root.style.getPropertyValue('--flow-visible-top')).toBe('60px');
  expect(root.style.getPropertyValue('--flow-visible-bottom')).toBe('150px');
  viewport.scale = 2;
  viewport.height = 90;
  viewport.dispatchEvent(new Event('resize'));
  expect(root.style.getPropertyValue('--flow-visible-height')).toBe('180px');
  stop();
  viewport.scale = 1;
  viewport.dispatchEvent(new Event('resize'));
  expect(root.style.getPropertyValue('--flow-visible-height')).toBe('180px');
});

test('uses window dimensions without VisualViewport and follows rotation', () => {
  const host = Object.assign(new EventTarget(), { innerHeight: 844 });
  const root = document.createElement('main');
  root.getBoundingClientRect = () => ({ top: 0, bottom: host.innerHeight } as DOMRect);
  const stop = observeFlowViewport(root, host as unknown as Window);
  expect(root.style.getPropertyValue('--flow-visible-height')).toBe('844px');
  host.innerHeight = 390;
  host.dispatchEvent(new Event('resize'));
  expect(root.style.getPropertyValue('--flow-visible-height')).toBe('390px');
  expect(root.style.getPropertyValue('--flow-visible-bottom')).toBe('0px');
  stop();
});
