import { act, fireEvent, render, screen } from '@testing-library/react';
import { FlowStream } from '@/components/flow/FlowStream';
import { FlowWaiting } from '@/components/flow/FlowWaiting';
import type { FlowFrame } from '@/lib/flow/contracts';
import { entryKey, type StreamEntry } from '@/lib/flow-browser/continuity';
import { quoteKey } from '@/lib/flow-browser/library';
import { EntranceMotion } from '@/lib/flow-browser/entrance-motion';
import { StreamGlass } from '@/lib/flow-browser/stream-glass';

jest.mock('@/lib/flow-browser/stream-glass', () => ({
  StreamGlass: jest.fn().mockImplementation(() => ({ draw: jest.fn(), destroy: jest.fn() })),
}));

const first = { id: 'first', source: '大学', chapterLabel: '经一章', quote: '知止。', fullText: '知止。', quoteStart: 0, quoteEnd: 3,
  lexicalBreaks: [0, 1, 2, 3], corpusVersion: 'v1', textHash: 'first', anchors: [], ready: true } as unknown as FlowFrame;
const entry: StreamEntry = { pathId: 'root-path', chainId: 'root', kind: 'remote', frame: first };
const second: StreamEntry = { ...entry, pathId: 'child-path', chainId: 'child',
  frame: { ...first, id: 'second', quote: '本末。', fullText: '本末。', textHash: 'second' } };
const props = { entries: [entry], activeKey: entryKey(entry), paused: true, reducedMotion: true, pending: false,
  connecting: null, restore: { revision: 0, top: 0 }, canContinue: true, onContinue: jest.fn(), onPrepareNext: jest.fn(),
  onPause: jest.fn(), onRead: jest.fn(), onScroll: jest.fn(), onVisualReady: jest.fn(), onBranch: jest.fn(),
  sourceOpen: false, onToggleSource: jest.fn(), bookmarkKeys: new Set<string>(), onBookmark: jest.fn(), notesFrameId: null, notes: [],
  savingNote: false, onSaveNote: async () => {}, onDeleteNote: async () => {}, onUndoNote: async () => {}, onUpdateNote: async () => {} };

test('flow and pause retain the same readable words, scroll container and focus', () => {
  const view = render(<FlowStream {...props} paused={false} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const word = screen.getByRole('button', { name: '止' });
  panel.scrollTop = 117;
  act(() => word.focus());
  view.rerender(<FlowStream {...props} />);
  expect(screen.getByRole('button', { name: '止' })).toBe(word);
  expect(screen.getByRole('generic', { name: '经文阅读' })).toBe(panel);
  expect(word).toHaveFocus();
  expect(panel.scrollTop).toBe(117);
  expect(view.container.querySelectorAll('[data-flow-stream]')).toHaveLength(1);
  expect(view.container.querySelectorAll('canvas')).toHaveLength(1);
  expect(view.container.querySelector('canvas')).toHaveAttribute('data-flow-glass');
  expect(view.container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  expect(view.container.querySelectorAll('svg')).toHaveLength(1);
  expect(view.container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

test('returning from an association lands on the quoted occurrence inside the full source', () => {
  const original: StreamEntry = { ...entry, frame: { ...first, fullText: '篇首。知止。篇末。', quoteStart: 3, quoteEnd: 6 } };
  const view = render(<FlowStream {...props} entries={[original]} sourceOpen />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const source = view.container.querySelector<HTMLElement>('[data-flow-source]')!;
  const quoted = source.querySelector<HTMLElement>('[data-source-quote]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 900 });
  Object.defineProperty(source, 'offsetTop', { value: 800 }); Object.defineProperty(source, 'offsetParent', { value: panel });
  Object.defineProperty(quoted, 'offsetTop', { value: 200 }); Object.defineProperty(quoted, 'offsetParent', { value: source });
  view.rerender(<FlowStream {...props} entries={[original]} sourceOpen restore={{ revision: 1, top: 987, frameId: first.id, entryKey: entryKey(entry), source: true }} />);
  expect(panel.scrollTop).toBe(622);
  expect(quoted).toHaveAttribute('data-source-quote');
});

test('branching keeps the prefix mounted; old words send their actual owner', () => {
  const onBranch = jest.fn(), view = render(<FlowStream {...props} onBranch={onBranch} />);
  const word = screen.getByRole('button', { name: '知' });
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  panel.scrollTop = 81;
  act(() => word.focus());
  view.rerender(<FlowStream {...props} entries={[entry, second]} onBranch={onBranch} pending />);
  expect(word).toBe(screen.getByRole('button', { name: '知' }));
  expect(word).toHaveFocus(); expect(panel.scrollTop).toBe(81);
  fireEvent.click(word);
  expect(onBranch).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'root-path', frameId: 'first' }));
});

test('settled paragraphs remain clickable during generation and later progress does not replace them', () => {
  const partial: StreamEntry = { ...entry, frame: { ...first, ready: false, meaning: '方向。', reflection: '',
    textBreaks: { meaning: [2, 3], reflection: [] }, settled: { meaning: true, reflection: false } } };
  const onBranch = jest.fn(), view = render(<FlowStream {...props} entries={[partial]} pending onBranch={onBranch} />);
  const word = screen.getByRole('button', { name: '方向' });
  act(() => word.focus()); fireEvent.click(word);
  expect(onBranch).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'root-path',
    selection: expect.objectContaining({ surface: 'meaning', surfaceText: '方向。' }) }));
  const full = { ...partial, frame: { ...partial.frame, reflection: '安顿。', textBreaks: { meaning: [2, 3], reflection: [2, 3] },
    settled: { meaning: true, reflection: true } } };
  view.rerender(<FlowStream {...props} entries={[full, second]} pending onBranch={onBranch} />);
  expect(screen.getByRole('button', { name: '方向' })).toBe(word); expect(word).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '安顿' }));
  expect(onBranch).toHaveBeenLastCalledWith(expect.objectContaining({ selection: expect.objectContaining({ surface: 'reflection' }) }));
});

test('a settled empty gloss leaves no blank section and the connection enters opposite the quote', () => {
  const partial: StreamEntry = { ...entry, frame: { ...first, ready: false, meaning: '', reflection: '安顿。',
    textBreaks: { meaning: [], reflection: [2, 3] }, settled: { meaning: true, reflection: true } } };
  const view = render(<FlowStream {...props} entries={[partial]} pending />);
  expect(view.container.querySelector('[data-flow-surface="meaning"]')).toBeNull();
  expect(view.container.querySelector('[data-flow-entrance="quote"]')).toHaveAttribute('data-entry-side', 'left');
  expect(view.container.querySelector('[data-flow-entrance="reflection"]')).toHaveAttribute('data-entry-side', 'right');
  expect(screen.getByRole('button', { name: '安顿' })).toBeEnabled();
});

test('waiting is placed at the selected paragraph, without masking or disabling the stream', () => {
  const cancel = jest.fn(), view = render(<FlowStream {...props} entries={[entry, second]} pending
    connecting={{ pathId: entry.pathId, frameId: first.id }} waiting={<FlowWaiting compact busy label="止" onCancel={cancel} />} />);
  const waiting = screen.getByText('沿「止」接续中…');
  expect(waiting).toHaveAttribute('role', 'status');
  expect(view.container.querySelector('[data-flow-frame="first"]')).toContainElement(waiting);
  expect(view.container.querySelector('[data-flow-frame="second"]')).not.toContainElement(waiting);
  expect(screen.getByRole('button', { name: '本' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '停止展开' }));
  expect(cancel).toHaveBeenCalledTimes(1);
});

test('manual continuation appends without scrolling or stealing keyboard focus', () => {
  const onContinue = jest.fn(), view = render(<FlowStream {...props} onContinue={onContinue} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const word = screen.getByRole('button', { name: '止' });
  panel.scrollTop = 119;
  act(() => word.focus());
  fireEvent.click(screen.getByRole('button', { name: '沿此意继续' }));
  view.rerender(<FlowStream {...props} entries={[entry, second]} onContinue={onContinue} />);
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(word).toHaveFocus(); expect(panel.scrollTop).toBe(119);
});

test('offscreen optical words remain focusable and rendering effects are cleaned up', async () => {
  const view = render(<FlowStream {...props} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const word = screen.getByRole('button', { name: '知' });
  const optical = word.parentElement!;
  Object.defineProperty(panel, 'clientHeight', { value: 900 });
  panel.scrollTop = 2000;
  fireEvent.scroll(panel);
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(optical.style.visibility).not.toBe('hidden');
  act(() => word.focus()); expect(word).toHaveFocus();
  view.unmount();
  expect(optical.style.filter).toBe('');
  expect(optical.style.transform).toBe('');
  expect(optical.style.transformOrigin).toBe('');
});

test('paragraphs have no visual subtitles and provenance remains in the source disclosure', () => {
  const reflected = { ...entry, frame: { ...first, reflection: '安顿。', textBreaks: { meaning: [], reflection: [2, 3] } } };
  const view = render(<FlowStream {...props} entries={[reflected]} />);
  expect(screen.queryByText('此刻回响')).not.toBeInTheDocument();
  expect(screen.queryByText('释义')).not.toBeInTheDocument();
  expect(view.container.querySelector('[data-flow-surface="reflection"]')).toHaveAttribute('aria-label', '此刻回响');
  expect(screen.getByRole('button', { name: '大学 · 经一章：原文、收藏、注脚' })).toHaveAttribute('title', '原文、收藏、注脚');
  expect(screen.queryByRole('button', { name: '原文' })).not.toBeInTheDocument();
  expect(screen.queryByText(/此刻的联系/)).not.toBeInTheDocument();
  expect(screen.queryByText(/原文来自六经资料库/)).not.toBeInTheDocument();
  const word = screen.getByRole('button', { name: '安顿' });
  view.rerender(<FlowStream {...props} entries={[reflected]} sourceOpen />);
  expect(screen.getByText(/原文来自六经资料库；释义与回响由 AI 生成/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '安顿' })).toBe(word);
});

test('entry order stays stable while meaning and reflection arrive in the same flow', () => {
  const view = render(<FlowStream {...props} entries={[entry, second]} />);
  const quote = view.container.querySelector('[data-flow-frame="first"] [data-flow-entrance="quote"]')!;
  expect(quote).toHaveAttribute('data-entry-order', '0');
  expect(view.container.querySelector('[data-flow-frame="second"] [data-flow-entrance]')).toHaveAttribute('data-entry-order', '3');
  const full = { ...entry, frame: { ...first, meaning: '方向。', reflection: '安顿。',
    textBreaks: { meaning: [2, 3], reflection: [2, 3] } } };
  view.rerender(<FlowStream {...props} entries={[full, second]} />);
  expect(view.container.querySelector('[data-flow-frame="first"] [data-flow-entrance="quote"]')).toBe(quote);
  expect(view.container.querySelector('[data-flow-surface="meaning"]')).toHaveAttribute('data-entry-order', '1');
  expect(view.container.querySelector('[data-flow-surface="reflection"]')).toHaveAttribute('data-entry-order', '2');
  expect(screen.getByRole('button', { name: '方向' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '安顿' })).toBeEnabled();
});

test('restoring a paused snapshot allows entry, while an explicit pause freezes it', () => {
  const pause = jest.spyOn(EntranceMotion.prototype, 'pause');
  const view = render(<FlowStream {...props} paused={false} />);
  const restore = { revision: 1, top: 100 };
  view.rerender(<FlowStream {...props} restore={restore} />);
  expect(pause).not.toHaveBeenCalled();
  view.rerender(<FlowStream {...props} paused={false} restore={restore} />);
  view.rerender(<FlowStream {...props} restore={restore} />);
  expect(pause).toHaveBeenCalled();
  pause.mockRestore();
});

test('a saved ancestor keeps its collection state when reading a later paragraph', () => {
  const view = render(<FlowStream {...props} entries={[entry, second]} activeKey={entryKey(second)}
    bookmarkKeys={new Set([quoteKey(entry.frame)])} />);
  const root = view.container.querySelector('[data-flow-frame="first"]')!;
  expect(root.querySelector('[aria-pressed="true"]')).toHaveTextContent('已收藏');
  expect(view.container.querySelector('[data-flow-frame="second"] [aria-pressed="false"]')).toHaveTextContent('收藏');
});

test('tab focus and programmatic layout changes do not spend a continuation; reading consumes only one', () => {
  const onContinue = jest.fn(), onPrepareNext = jest.fn();
  const view = render(<FlowStream {...props} onContinue={onContinue} onPrepareNext={onPrepareNext} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const article = view.container.querySelector('[data-flow-frame]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 900 });
  Object.defineProperty(article, 'offsetTop', { value: 234 });
  Object.defineProperty(article, 'offsetHeight', { value: 500 });
  fireEvent.keyDown(panel, { key: 'Tab' }); fireEvent.scroll(panel);
  expect(onContinue).not.toHaveBeenCalled(); expect(onPrepareNext).not.toHaveBeenCalled();
  fireEvent.wheel(panel); fireEvent.scroll(panel);
  expect(onContinue).toHaveBeenCalledTimes(1); expect(onPrepareNext).toHaveBeenCalledTimes(1);
  view.rerender(<FlowStream {...props} entries={[entry, second]} onContinue={onContinue} onPrepareNext={onPrepareNext} />);
  fireEvent.scroll(panel);
  expect(onContinue).toHaveBeenCalledTimes(1); expect(onPrepareNext).toHaveBeenCalledTimes(1);
});

test('a verified late font family refreshes the canvas without replaying revealed glyphs', async () => {
  const style = jest.spyOn(window, 'getComputedStyle');
  let family = 'Fallback';
  style.mockImplementation(() => ({ fontFamily: family, fontStyle: 'normal', fontWeight: '400', fontSize: '30px',
    letterSpacing: '0px', color: '#fff' } as CSSStyleDeclaration));
  const view = render(<FlowStream {...props} />);
  const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 900 });
  Object.defineProperty(panel, 'clientWidth', { value: 390 });
  const frames = () => act(async () => { await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))); });
  family = 'Kangxi';
  act(() => document.documentElement.style.setProperty('--flow-classic-family', 'Kangxi'));
  await frames();
  const mock = jest.mocked(StreamGlass).mock.results.at(-1)!.value;
  expect(mock.draw).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ font: 'normal 400 30px Kangxi' })]), 390, 900, true);
  expect(view.container.querySelector('[data-flow-entrance]')).toHaveAttribute('data-ink-phase', 'settled');
  view.unmount(); style.mockRestore();
  document.documentElement.style.removeProperty('--flow-classic-family');
});

test('streamed suffixes inherit paragraph glyph progress after token wrappers are remeasured', async () => {
  let clock = 0, serial = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++serial, callback); return serial; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const view = render(<FlowStream {...props} reducedMotion={false} />);
  const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 844 });
  Object.defineProperty(panel, 'clientWidth', { value: 390 });
  const measureWords = async () => {
    view.container.querySelectorAll<HTMLElement>('[data-flow-entrance], [data-flow-optic]').forEach(element => {
      Object.defineProperty(element, 'offsetTop', { configurable: true, value: 200 });
      Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 50 });
    });
    await act(async () => { document.documentElement.style.setProperty('--flow-classic-family', String(++serial)); });
  };
  const step = (time: number) => act(() => {
    clock = time;
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(callback => callback(time));
  });
  const drawn = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
  const progress = () => (drawn.mock.calls.at(-1)![0] as Array<{ text: string; ink?: number[] }>).flatMap(run =>
    Array.from(run.text).map((char, index) => ({ char, progress: run.ink?.[index] ?? 1 })));
  try {
    await measureWords(); step(0); step(900);
    expect(progress().map(glyph => glyph.progress)).toEqual([1, 1, 1]);
    const withMeaning = { ...entry, frame: { ...first, meaning: '方向', textBreaks: { meaning: [2], reflection: [] } } };
    view.rerender(<FlowStream {...props} entries={[withMeaning]} reducedMotion={false} />);
    await measureWords(); step(1000);
    expect(progress().map(glyph => glyph.progress)).toEqual([1, 1, 1, 0, 0]);
    step(1900);
    const suffix = { ...withMeaning, frame: { ...withMeaning.frame, meaning: '方向而后', textBreaks: { meaning: [2, 4], reflection: [] } } };
    view.rerender(<FlowStream {...props} entries={[suffix]} reducedMotion={false} />);
    await measureWords(); step(2000);
    expect(progress().map(glyph => glyph.char).join('')).toBe('知止。方向而后');
    expect(progress().map(glyph => glyph.progress)).toEqual([1, 1, 1, 1, 1, 0, 0]);
  } finally {
    view.unmount(); raf.mockRestore(); cancel.mockRestore(); now.mockRestore();
    document.documentElement.style.removeProperty('--flow-classic-family');
  }
});
