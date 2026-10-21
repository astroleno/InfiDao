import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReadingLayer } from '@/components/flow/ReadingLayer';
import { FlowResume, FlowWaiting } from '@/components/flow/FlowWaiting';
import type { FlowFrame } from '@/lib/flow/contracts';

const first = { id: 'first', source: '大学', chapterLabel: '经一章', quote: '知止。', fullText: '知止。', quoteStart: 0, quoteEnd: 3,
  lexicalBreaks: [0, 1, 2, 3], corpusVersion: 'v1', textHash: 'first', anchors: [], ready: true } as unknown as FlowFrame;
const second = { ...first, id: 'second', quote: '本末。', fullText: '本末。', textHash: 'second' };
const props = { frame: first, frames: [first], chainKind: 'remote' as const, path: [], sourceOpen: false, sourceScrollTop: 0,
  readingScrollTop: 0, seed: '', notes: [], savingNote: false, onReturn: jest.fn(), onToggleSource: jest.fn(),
  onSourceScroll: jest.fn(), onReadingScroll: jest.fn(), onBranch: jest.fn(), onOpenSeed: jest.fn(),
  onSaveNote: async () => {}, onDeleteNote: async () => {}, onUndoNote: async () => {} };

test('initial restoration does not take focus; explicit entry focuses an actionable word', () => {
  const restored = render(<ReadingLayer {...props} />);
  expect(document.body).toHaveFocus();
  expect(restored.container.querySelector('[data-flow-heading]')).not.toHaveAttribute('tabindex');
  restored.unmount();
  render(<ReadingLayer {...props} focusOnEntry />);
  expect(screen.getByRole('button', { name: '知' })).toHaveFocus();
});

test('pending status and cancellation stay in the reader header rather than after a long explanation', () => {
  const cancel = jest.fn();
  const view = render(<ReadingLayer {...props} pending waiting={<FlowWaiting compact busy label="止" onCancel={cancel} />} />);
  expect(view.container.querySelector('header')).toContainElement(screen.getByRole('status'));
  expect(view.container.querySelector('[data-flow-frame]')).not.toContainElement(screen.getByRole('status'));
  fireEvent.click(screen.getByRole('button', { name: '停止展开' })); expect(cancel).toHaveBeenCalledTimes(1);
});

test('automatic append preserves focus and scroll; manual continuation focuses the new quotation', () => {
  const onContinue = jest.fn(), view = render(<ReadingLayer {...props} canContinue onContinue={onContinue} />);
  const panel = view.container.querySelector('[class*="readingScroll"]') as HTMLElement;
  panel.scrollTop = 117;
  act(() => screen.getByRole('button', { name: '止' }).focus());
  view.rerender(<ReadingLayer {...props} frames={[first, second]} canContinue onContinue={onContinue} />);
  expect(screen.getByRole('button', { name: '止' })).toHaveFocus(); expect(panel.scrollTop).toBe(117);
  fireEvent.click(screen.getByRole('button', { name: '沿此意继续' }));
  expect(onContinue).toHaveBeenCalledTimes(1);
  const third = { ...first, id: 'third', quote: '先后。', fullText: '先后。', textHash: 'third' };
  view.rerender(<ReadingLayer {...props} frames={[first, second, third]} canContinue onContinue={onContinue} />);
  expect(screen.getByRole('button', { name: '先' })).toHaveFocus();
});

test('pending generation leaves accepted paragraphs clickable and preserves focus as the next paragraph arrives', () => {
  const onBranch = jest.fn();
  const partial = { ...first, ready: false, meaning: '方向。', reflection: '',
    textBreaks: { meaning: [2, 3], reflection: [] }, settled: { meaning: true, reflection: false } };
  const view = render(<ReadingLayer {...props} frame={partial} frames={[partial]} pending onBranch={onBranch} />);
  const word = screen.getByRole('button', { name: '方向' });
  act(() => word.focus()); fireEvent.click(word);
  expect(onBranch).toHaveBeenCalledWith(expect.objectContaining({ selection: expect.objectContaining({ surface: 'meaning', surfaceText: '方向。' }) }));
  const updated = { ...partial, reflection: '安顿。', textBreaks: { meaning: [2, 3], reflection: [2, 3] }, settled: { meaning: true, reflection: true } };
  view.rerender(<ReadingLayer {...props} frame={updated} frames={[updated]} pending onBranch={onBranch} />);
  expect(word).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '安顿' }));
  expect(onBranch).toHaveBeenLastCalledWith(expect.objectContaining({ selection: expect.objectContaining({ surface: 'reflection', surfaceText: '安顿。' }) }));
});

test('returning to a deliberately interrupted paragraph offers a quiet resume action beside the readable text', () => {
  const resume = jest.fn(), onBranch = jest.fn();
  const partial = { ...first, ready: false };
  const view = render(<ReadingLayer {...props} frame={partial} frames={[partial]} onBranch={onBranch}
    waiting={<FlowResume onResume={resume} />} />);
  expect(view.container.querySelector('header')).toContainElement(screen.getByRole('button', { name: '继续补全' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument();
  expect(resume).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '知' }));
  expect(onBranch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '继续补全' }));
  expect(resume).toHaveBeenCalledTimes(1);
});
