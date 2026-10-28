import { createFlowHistory } from '@/lib/flow-browser/history';
import { registerFlowOverlay } from '@/lib/flow-browser/overlay-history';
import { waitFor } from '@testing-library/react';

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 25));
const readers: Array<ReturnType<typeof createFlowHistory>> = [];
const createReader = (navigate: (pathId: string | null) => void) => { const reader = createFlowHistory(navigate); readers.push(reader); return reader; };
afterEach(() => { readers.splice(0).forEach(reader => reader.dispose()); });

test('Back dismisses the tool first and the next Back returns the reading branch', async () => {
  const navigate = jest.fn(), reader = createReader(navigate);
  reader.initialize('overlay-root'); reader.push('overlay-child');
  let unregister = () => {};
  const close = jest.fn(() => unregister());
  unregister = registerFlowOverlay(close);
  expect(history.state.flowOverlay).toEqual(expect.any(String));
  history.back(); await tick();
  expect(close).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  expect(history.state.flowPathId).toBe('overlay-child');
  history.back(); await tick();
  expect(navigate).toHaveBeenLastCalledWith('overlay-root');
  reader.dispose();
});

test('explicit dismissal consumes its entry; Forward cannot revive a dismissed task', async () => {
  const navigate = jest.fn(), reader = createReader(navigate);
  reader.initialize('dismiss-root'); reader.push('dismiss-child');
  const close = jest.fn(), unregister = registerFlowOverlay(close);
  unregister(); await tick();
  expect(history.state.flowPathId).toBe('dismiss-child');
  expect(history.state.flowOverlay).toBeUndefined();
  expect(navigate).not.toHaveBeenCalled();
  history.forward(); await tick(); await tick();
  expect(close).not.toHaveBeenCalled();
  expect(history.state.flowOverlay).toBeUndefined();
  history.back(); await tick();
  expect(navigate).toHaveBeenLastCalledWith('dismiss-root');
  reader.dispose();
});

test('menu to destination reuses one tool entry and real reading navigation replaces it', async () => {
  const navigate = jest.fn(), reader = createReader(navigate);
  reader.initialize('replace-root');
  const push = jest.spyOn(history, 'pushState');
  const menu = registerFlowOverlay(jest.fn());
  const id = history.state.flowOverlay;
  menu();
  const meaning = registerFlowOverlay(jest.fn());
  await Promise.resolve();
  expect(history.state.flowOverlay).toBe(id);
  expect(push).toHaveBeenCalledTimes(1);
  reader.push('replace-child');
  meaning(); await tick();
  expect(history.state.flowOverlay).toBeUndefined();
  expect(history.state.flowPathId).toBe('replace-child');
  history.back(); await tick();
  expect(navigate).toHaveBeenLastCalledWith('replace-root');
  reader.dispose();
  push.mockRestore();
});

test('return to parent includes the temporary tool in the browser offset', async () => {
  const navigate = jest.fn(), reader = createReader(navigate);
  reader.initialize('parent-root'); reader.push('parent-child');
  let unregister = () => {};
  unregister = registerFlowOverlay(() => unregister());
  reader.returnTo('parent-root'); await tick();
  expect(history.state.flowPathId).toBe('parent-root');
  expect(navigate).toHaveBeenLastCalledWith('parent-root');
  unregister(); reader.dispose();
});

test.each(['close-first', 'navigate-first'])('menu return traverses once during same-commit cleanup (%s)', async order => {
  const navigate = jest.fn(), reader = createReader(navigate);
  reader.initialize('commit-root'); reader.push('commit-middle'); reader.push('commit-leaf');
  const unregister = registerFlowOverlay(jest.fn());
  const go = jest.spyOn(history, 'go'), back = jest.spyOn(history, 'back');
  try {
    if (order === 'close-first') unregister();
    reader.returnTo('commit-middle');
    if (order === 'navigate-first') unregister();
    await tick(); await tick();
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(-2);
    expect(back).not.toHaveBeenCalled();
    expect(history.state.flowPathId).toBe('commit-middle');
    expect(history.state.flowOverlay).toBeUndefined();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenLastCalledWith('commit-middle');
  } finally { go.mockRestore(); back.mockRestore(); }
});

test('a navigation arriving during explicit dismissal is applied after the transient pop', async () => {
  const navigate = jest.fn(), reader = createReader(navigate);
  reader.initialize('race-root');
  const unregister = registerFlowOverlay(jest.fn());
  unregister(); await Promise.resolve();
  reader.push('race-child');
  await tick();
  expect(history.state.flowPathId).toBe('race-child');
  expect(navigate).not.toHaveBeenCalled();
  reader.dispose();
});

test('jumping forward over a stale tool still restores its actual reading destination', async () => {
  const navigate = jest.fn(), reader = createReader(navigate);
  reader.initialize('jump-root'); reader.push('jump-child');
  const unregister = registerFlowOverlay(jest.fn());
  unregister(); await tick();
  history.back(); await tick();
  navigate.mockClear();
  history.go(2); await tick(); await tick();
  expect(history.state.flowPathId).toBe('jump-child');
  expect(history.state.flowOverlay).toBeUndefined();
  expect(navigate).toHaveBeenLastCalledWith('jump-child');
});

test('a refreshed reader consumes an orphaned task entry before opening new tools', async () => {
  history.replaceState({ flowPathId: 'reload-child', flowTrail: ['reload-child'] }, '', '/InfiDao?reading=reload-child');
  history.pushState({ ...history.state, flowOverlay: 'old-document' }, '');
  const navigate = jest.fn(), reader = createReader(navigate);
  await waitFor(() => expect(history.state.flowOverlay).toBeUndefined());
  expect(history.state.flowPathId).toBe('reload-child');
  expect(history.state.flowOverlay).toBeUndefined();
  expect(navigate).not.toHaveBeenCalled();
});

test('a tool opened during the first load retains its own Back after initialization', async () => {
  history.replaceState(null, '', '/InfiDao');
  const navigate = jest.fn(), reader = createReader(navigate);
  let unregister = () => {};
  const close = jest.fn(() => unregister());
  unregister = registerFlowOverlay(close);
  reader.initialize('late-root');
  history.back(); await tick();
  expect(close).toHaveBeenCalledTimes(1);
  expect(history.state.flowPathId).toBe('late-root');
  expect(history.state.flowOverlay).toBeUndefined();
  expect(navigate).not.toHaveBeenCalled();
});
