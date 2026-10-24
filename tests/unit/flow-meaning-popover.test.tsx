import { act, fireEvent, render, screen } from '@testing-library/react';
import { FlowStream } from '@/components/flow/FlowStream';
import { entryKey, type StreamEntry } from '@/lib/flow-browser/continuity';
import type { FlowFrame } from '@/lib/flow/contracts';

jest.mock('@/lib/flow-browser/stream-glass', () => ({
  StreamGlass: jest.fn().mockImplementation(() => ({ draw: jest.fn(), destroy: jest.fn() })),
}));

const frame = { id: 'meaning-quote', source: '大学', chapterLabel: '经一章', quote: '知止。', fullText: '知止。',
  quoteStart: 0, quoteEnd: 3, lexicalBreaks: [0, 1, 2, 3], corpusVersion: 'v1', textHash: 'quote', anchors: [],
  meaning: '方向。', textBreaks: { meaning: [2, 3], reflection: [] }, ready: true } as unknown as FlowFrame;
const entry: StreamEntry = { pathId: 'root', chainId: 'chain', kind: 'remote', frame };
const props = { entries: [entry], activeKey: entryKey(entry), paused: true, reducedMotion: true, pending: false,
  connecting: null, restore: { revision: 0, top: 0 }, canContinue: false,
  onContinue: jest.fn(), onPrepareNext: jest.fn(), onPause: jest.fn(), onResume: jest.fn(), onRead: jest.fn(),
  onScroll: jest.fn(), onVisualReady: jest.fn(), onBranch: jest.fn(), sourceOpen: false,
  onToggleSource: jest.fn(), bookmarkKeys: new Set<string>(), onBookmark: jest.fn(), notesFrameId: null, notes: [],
  savingNote: false, onSaveNote: async () => {}, onDeleteNote: async () => {}, onUndoNote: async () => {}, onUpdateNote: async () => {} };
const pointer = (element: Element, type: string, x = 150, y = 300) =>
  fireEvent(element, new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test('meaning stays outside the reading flow and a long press persists after release without branching', () => {
  const view = render(<FlowStream {...props} />);
  const word = screen.getByRole('button', { name: '知' });
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  panel.scrollTop = 47;
  expect(word).not.toHaveFocus();
  expect(view.container.querySelector('[data-flow-surface="meaning"]')).toBeNull();
  expect(screen.queryByRole('button', { name: '方向' })).not.toBeInTheDocument();
  expect(view.container.querySelector('[data-flow-stream]')).toHaveAttribute('data-motion-variant', 'liquid-live');
  pointer(word, 'pointerdown');
  act(() => jest.advanceTimersByTime(449));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  const dialog = screen.getByRole('dialog', { name: '大学 · 经一章 · 释义' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(panel).toHaveAttribute('inert');
  expect(screen.getByRole('button', { name: '关闭释义' })).toHaveFocus();
  pointer(word, 'pointerup');
  act(() => jest.advanceTimersByTime(500));
  fireEvent.click(word, { detail: 1 });
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(props.onBranch).not.toHaveBeenCalled();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(panel).not.toHaveAttribute('inert'); expect(word).toHaveFocus();
  expect(panel.scrollTop).toBe(47); expect(props.onResume).not.toHaveBeenCalled();
});

test.each(['move', 'cancel', 'release', 'leave', 'wheel', 'hidden', 'blur'] as const)('%s cancels a pending long press', reason => {
  render(<FlowStream {...props} />);
  const word = screen.getByRole('button', { name: '知' });
  pointer(word, 'pointerdown');
  if (reason === 'move') pointer(word, 'pointermove', 150, 308);
  if (reason === 'cancel') pointer(word, 'pointercancel');
  if (reason === 'release') pointer(word, 'pointerup');
  if (reason === 'leave') pointer(word, 'pointerout', 400, 900);
  if (reason === 'wheel') fireEvent.wheel(word, { deltaY: 20 });
  if (reason === 'hidden') fireEvent(document, new Event('visibilitychange'));
  if (reason === 'blur') fireEvent(window, new Event('blur'));
  act(() => jest.advanceTimersByTime(500));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  if (reason === 'release') { fireEvent.click(word, { detail: 1 }); expect(props.onBranch).toHaveBeenCalledTimes(1); }
  if (reason === 'move') { fireEvent.click(word, { detail: 1 }); expect(props.onBranch).not.toHaveBeenCalled(); }
});

test('a consumed long press does not swallow the next pointer sequence or keyboard activation', () => {
  render(<FlowStream {...props} />);
  const word = screen.getByRole('button', { name: '知' });
  pointer(word, 'pointerdown'); act(() => jest.advanceTimersByTime(450)); pointer(word, 'pointerup');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(word); // Native keyboard/programmatic activation.
  expect(props.onBranch).toHaveBeenCalledTimes(1);
  pointer(word, 'pointerdown'); pointer(word, 'pointerup'); fireEvent.click(word, { detail: 1 });
  expect(props.onBranch).toHaveBeenCalledTimes(2);
});

test.each([false, true])('closing restores the prior paused=%s state', paused => {
  const view = render(<FlowStream {...props} paused={paused} reducedMotion={false} />);
  const word = screen.getByRole('button', { name: '知' });
  pointer(word, 'pointerdown');
  // The parent applies the pause while the same press is still held.
  view.rerender(<FlowStream {...props} paused reducedMotion={false} />);
  act(() => jest.advanceTimersByTime(450));
  fireEvent.pointerDown(view.container.querySelector('[data-flow-meaning-backdrop]')!);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(props.onResume).toHaveBeenCalledTimes(paused ? 0 : 1);
});

test('keyboard and action menu open the same explanation, trap focus, and allow a canonical branch', () => {
  render(<FlowStream {...props} />);
  const word = screen.getByRole('button', { name: '知' });
  act(() => word.focus());
  fireEvent.keyDown(word, { key: 'F10', shiftKey: true });
  const close = screen.getByRole('button', { name: '关闭释义' });
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: '方向' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(close).toHaveFocus();
  fireEvent.click(close);
  fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
  fireEvent.click(screen.getByRole('button', { name: '释义' }));
  fireEvent.click(screen.getByRole('button', { name: '方向' }));
  expect(props.onBranch).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'root', frameId: frame.id,
    selection: expect.objectContaining({ surface: 'meaning', surfaceText: '方向。' }) }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(props.onResume).not.toHaveBeenCalled();
});

test('streaming meaning retains its dialog and native word identity, and navigation closes it', () => {
  const view = render(<FlowStream {...props} />);
  fireEvent.keyDown(screen.getByRole('button', { name: '知' }), { key: 'ContextMenu' });
  const dialog = screen.getByRole('dialog'), word = screen.getByRole('button', { name: '方向' });
  act(() => word.focus());
  const next = { ...entry, frame: { ...frame, meaning: '方向。安定。', textBreaks: { meaning: [2, 3, 5, 6], reflection: [] } } };
  view.rerender(<FlowStream {...props} entries={[next]} />);
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(screen.getByRole('button', { name: '方向' })).toBe(word); expect(word).toHaveFocus();
  expect(screen.getByRole('button', { name: '安定' })).toBeEnabled();
  view.rerender(<FlowStream {...props} entries={[next]} restore={{ revision: 1, top: 0 }} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(props.onResume).not.toHaveBeenCalled();
});

test('unmount cancels a held press', () => {
  const view = render(<FlowStream {...props} />);
  pointer(screen.getByRole('button', { name: '知' }), 'pointerdown');
  view.unmount();
  const before = props.onRead.mock.calls.length;
  act(() => jest.advanceTimersByTime(1000));
  expect(props.onRead).toHaveBeenCalledTimes(before);
});

test.each([false, true])('meaning opened from a swipe restores the original paused=%s state', paused => {
  const view = render(<FlowStream {...props} paused={paused} reducedMotion={false} />);
  const word = screen.getByRole('button', { name: '知' });
  pointer(word, 'pointerdown', 300, 300);
  view.rerender(<FlowStream {...props} paused reducedMotion={false} />);
  pointer(word, 'pointermove', 220, 302); pointer(word, 'pointerup', 220, 302);
  expect(screen.getByRole('dialog', { name: '阅读选项' })).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(500));
  expect(screen.queryByRole('dialog', { name: /释义/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '释义' }));
  expect(screen.getByRole('dialog', { name: '大学 · 经一章 · 释义' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '关闭释义' }));
  expect(props.onResume).toHaveBeenCalledTimes(paused ? 0 : 1);
  expect(screen.getByRole('generic', { name: '经文阅读' })).not.toHaveAttribute('inert');
});
