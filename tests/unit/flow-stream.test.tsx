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
  expect(view.container.querySelectorAll('svg')).toHaveLength(0);
  expect(view.container.querySelector('[data-flow-tools]')).toBeNull();
  expect(screen.getAllByRole('button', { name: '更多阅读选项' })).toHaveLength(1);
});

test('active-passage and pause changes retain parsed native words and use the latest selection handlers', () => {
  const breaks = jest.fn(() => first.lexicalBreaks!);
  const retained = { ...entry, frame: { ...first, get lexicalBreaks() { return breaks(); } } };
  const entries = [retained, second], originalBranch = jest.fn(), latestBranch = jest.fn();
  const view = render(<FlowStream {...props} entries={entries} onBranch={originalBranch} />);
  const word = screen.getByRole('button', { name: '止' });
  expect(breaks).toHaveBeenCalled(); breaks.mockClear();
  view.rerender(<FlowStream {...props} entries={entries} activeKey={entryKey(second)} paused={false} onBranch={latestBranch} />);
  expect(breaks).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '止' })).toBe(word);
  fireEvent.click(word);
  expect(originalBranch).not.toHaveBeenCalled();
  expect(latestBranch).toHaveBeenCalledWith(expect.objectContaining({ pathId: entry.pathId, frameId: first.id }));
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

test('a legacy nonzero reader offset restores its saved passage within the connected stream', () => {
  const view = render(<FlowStream {...props} entries={[entry, second]} activeKey={entryKey(second)} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const content = panel.firstElementChild as HTMLElement;
  const article = view.container.querySelector<HTMLElement>('[data-flow-frame="second"]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 900 });
  Object.defineProperty(content, 'offsetTop', { value: 100 });
  Object.defineProperty(content, 'offsetParent', { value: panel });
  Object.defineProperty(article, 'offsetTop', { value: 4000 });
  Object.defineProperty(article, 'offsetParent', { value: content });
  Object.defineProperty(article, 'offsetHeight', { value: 1000 });
  view.rerender(<FlowStream {...props} entries={[entry, second]} activeKey={entryKey(second)}
    restore={{ revision: 1, top: 570.5, frameId: 'second', entryKey: entryKey(second) }} />);
  expect(panel.scrollTop).toBe(3875);
});

test('a unified stream offset that still addresses the saved passage is retained exactly', () => {
  const view = render(<FlowStream {...props} entries={[entry, second]} activeKey={entryKey(second)} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const content = panel.firstElementChild as HTMLElement;
  const article = view.container.querySelector<HTMLElement>('[data-flow-frame="second"]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 900 });
  Object.defineProperty(content, 'offsetTop', { value: 100 });
  Object.defineProperty(content, 'offsetParent', { value: panel });
  Object.defineProperty(article, 'offsetTop', { value: 4000 });
  Object.defineProperty(article, 'offsetParent', { value: content });
  Object.defineProperty(article, 'offsetHeight', { value: 1000 });
  view.rerender(<FlowStream {...props} entries={[entry, second]} activeKey={entryKey(second)}
    restore={{ revision: 1, top: 4000, frameId: 'second', entryKey: entryKey(second) }} />);
  expect(panel.scrollTop).toBe(4000);
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

test('settled reflections remain clickable during generation and later progress does not replace them', () => {
  const partial: StreamEntry = { ...entry, frame: { ...first, ready: false, meaning: '方向。', reflection: '',
    textBreaks: { meaning: [2, 3], reflection: [] }, settled: { meaning: true, reflection: false } } };
  const onBranch = jest.fn(), view = render(<FlowStream {...props} entries={[partial]} pending onBranch={onBranch} />);
  const word = screen.getByRole('button', { name: '知' });
  act(() => word.focus()); fireEvent.click(word);
  expect(onBranch).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'root-path',
    frameId: first.id }));
  expect(screen.queryByRole('button', { name: '方向' })).not.toBeInTheDocument();
  const full = { ...partial, frame: { ...partial.frame, reflection: '安顿。', textBreaks: { meaning: [2, 3], reflection: [2, 3] },
    settled: { meaning: true, reflection: true } } };
  view.rerender(<FlowStream {...props} entries={[full, second]} pending onBranch={onBranch} />);
  expect(screen.getByRole('button', { name: '知' })).toBe(word); expect(word).toHaveFocus();
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
  expect(view.container.querySelector('[data-flow-tools]')).toBeNull();
  expect(screen.getByRole('button', { name: '更多阅读选项' })).toHaveAttribute('title', '阅读选项 · 向左拖动或点击');
  expect(screen.queryByRole('button', { name: '原文' })).not.toBeInTheDocument();
  expect(screen.queryByText(/此刻的联系/)).not.toBeInTheDocument();
  expect(screen.queryByText(/原文来自六经资料库/)).not.toBeInTheDocument();
  const word = screen.getByRole('button', { name: '安顿' });
  view.rerender(<FlowStream {...props} entries={[reflected]} sourceOpen />);
  expect(screen.getByText(/原文来自六经资料库；释义与回响由 AI 生成/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '安顿' })).toBe(word);
});

test('entry order stays stable when a hidden meaning and visible reflection arrive', () => {
  const view = render(<FlowStream {...props} entries={[entry, second]} />);
  const quote = view.container.querySelector('[data-flow-frame="first"] [data-flow-entrance="quote"]')!;
  expect(quote).toHaveAttribute('data-entry-order', '0');
  expect(view.container.querySelector('[data-flow-frame="second"] [data-flow-entrance]')).toHaveAttribute('data-entry-order', '3');
  const full = { ...entry, frame: { ...first, meaning: '方向。', reflection: '安顿。',
    textBreaks: { meaning: [2, 3], reflection: [2, 3] } } };
  view.rerender(<FlowStream {...props} entries={[full, second]} />);
  expect(view.container.querySelector('[data-flow-frame="first"] [data-flow-entrance="quote"]')).toBe(quote);
  expect(view.container.querySelector('[data-flow-surface="meaning"]')).toBeNull();
  expect(view.container.querySelector('[data-flow-surface="reflection"]')).toHaveAttribute('data-entry-order', '2');
  expect(screen.queryByRole('button', { name: '方向' })).not.toBeInTheDocument();
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
  fireEvent(root, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 300 }));
  fireEvent(root, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 220, clientY: 305 }));
  expect(screen.getByRole('button', { name: '已收藏' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
  expect(screen.getByRole('button', { name: '收藏' })).toHaveAttribute('aria-pressed', 'false');
});

test('a reading swipe opens the same menu, preserves native words, and suppresses the release click', () => {
  const onBranch = jest.fn(), onRead = jest.fn(), onThought = jest.fn(), onLibrary = jest.fn();
  const view = render(<FlowStream {...props} onBranch={onBranch} onRead={onRead}
    navigation={{ onThought, onLibrary, libraryDisabled: false }} />);
  const word = screen.getByRole('button', { name: '知' });
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  panel.scrollTop = 51;
  fireEvent(word, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 300 }));
  fireEvent(word, new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 220, clientY: 302 }));
  fireEvent(word, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 220, clientY: 302 }));
  fireEvent.click(word, { detail: 1 });
  expect(onBranch).not.toHaveBeenCalled(); expect(onRead).toHaveBeenLastCalledWith(entry);
  expect(screen.getByRole('dialog', { name: '阅读选项' })).toHaveAttribute('aria-modal', 'true');
  expect(panel).toHaveAttribute('inert'); expect(panel.scrollTop).toBe(51);
  fireEvent.click(screen.getByRole('button', { name: '添一念' }));
  expect(onThought).toHaveBeenCalledTimes(1); expect(panel).not.toHaveAttribute('inert');
  expect(screen.getByRole('button', { name: '知' })).toBe(word);
  fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
  fireEvent.click(screen.getByRole('button', { name: '温故' }));
  expect(onLibrary).toHaveBeenCalledTimes(1);
  expect(view.container.querySelectorAll('[data-flow-menu-root]')).toHaveLength(1);
});

test.each([[0, 90], [-30, 0], [-90, 80], [80, 0]])('movement %s,%s leaves the drawer closed', (dx, dy) => {
  render(<FlowStream {...props} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  fireEvent(panel, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 300 }));
  fireEvent(panel, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 300 + dx, clientY: 300 + dy }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each([['原文', 'onToggleSource'], ['收藏', 'onBookmark'], ['注脚', 'onRead']] as const)('the drawer preserves the %s action', (label, callback) => {
  jest.clearAllMocks();
  const view = render(<FlowStream {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(props[callback]).toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  if (label === '注脚') expect(view.container.querySelector('textarea')).toBeInTheDocument();
});

test('editing a note keeps horizontal text selection outside the menu gesture', () => {
  render(<FlowStream {...props} notesFrameId={first.id} />);
  const editor = screen.getByRole('textbox');
  fireEvent(editor, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 300 }));
  fireEvent(editor, new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 220, clientY: 302 }));
  fireEvent(editor, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 220, clientY: 302 }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(editor).toBeEnabled();
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
  fireEvent.wheel(panel, { deltaY: 40 }); fireEvent.scroll(panel);
  expect(onContinue).toHaveBeenCalledTimes(1); expect(onPrepareNext).toHaveBeenCalledTimes(1);
  view.rerender(<FlowStream {...props} entries={[entry, second]} onContinue={onContinue} onPrepareNext={onPrepareNext} />);
  fireEvent.scroll(panel);
  expect(onContinue).toHaveBeenCalledTimes(1); expect(onPrepareNext).toHaveBeenCalledTimes(1);
});

test('click pauses while intentional wheel, touch and page navigation resume playback', () => {
  const onPause = jest.fn(), onResume = jest.fn();
  render(<FlowStream {...props} reducedMotion={false} onPause={onPause} onResume={onResume} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  fireEvent.click(panel);
  expect(onPause).toHaveBeenCalledTimes(1);
  fireEvent.scroll(panel);
  expect(onResume).not.toHaveBeenCalled();
  fireEvent.wheel(panel, { deltaY: 80 });
  fireEvent.touchMove(panel, { touches: [{ clientX: 40, clientY: 60 }] });
  fireEvent.keyDown(panel, { key: 'PageDown' });
  expect(onResume).toHaveBeenCalledTimes(3);
  fireEvent.wheel(panel, { deltaX: 60 });
  fireEvent.wheel(panel, { deltaY: 80, ctrlKey: true });
  fireEvent.touchMove(panel, { touches: [{ clientX: 40, clientY: 60 }, { clientX: 50, clientY: 80 }] });
  expect(onResume).toHaveBeenCalledTimes(3);
});

test('selection, editing and reduced motion stay paused while scrolling', () => {
  const onResume = jest.fn();
  const view = render(<FlowStream {...props} reducedMotion={false} onResume={onResume} />);
  const panel = screen.getByRole('generic', { name: '经文阅读' });
  const range = document.createRange();
  range.selectNodeContents(screen.getByRole('button', { name: '知' }));
  window.getSelection()!.addRange(range);
  try {
    fireEvent.wheel(panel, { deltaY: 40 });
    expect(onResume).not.toHaveBeenCalled();
  } finally { window.getSelection()!.removeAllRanges(); }
  const textarea = document.createElement('textarea');
  panel.append(textarea);
  fireEvent.wheel(textarea, { deltaY: 40 });
  fireEvent.keyDown(textarea, { key: 'ArrowDown' });
  expect(onResume).not.toHaveBeenCalled();
  textarea.remove();
  view.rerender(<FlowStream {...props} onResume={onResume} />);
  fireEvent.wheel(panel, { deltaY: 40 });
  expect(onResume).not.toHaveBeenCalled();
});

test('word navigation and activation keep their behavior without resuming playback', () => {
  const onResume = jest.fn(), onBranch = jest.fn();
  render(<FlowStream {...props} reducedMotion={false} onResume={onResume} onBranch={onBranch} />);
  const word = screen.getByRole('button', { name: '止' });
  fireEvent.keyDown(word, { key: 'Home' });
  expect(screen.getByRole('button', { name: '知' })).toHaveFocus();
  fireEvent.keyDown(word, { key: ' ' });
  fireEvent.click(word);
  expect(onBranch).toHaveBeenCalledTimes(1);
  expect(onResume).not.toHaveBeenCalled();
  fireEvent.keyDown(word, { key: 'PageDown' });
  expect(onResume).toHaveBeenCalledTimes(1);
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
  expect(mock.draw).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ font: 'normal 400 30px Kangxi' })]),
    390, 900, true, expect.objectContaining({ width: 390, height: 900 }), expect.any(Number), expect.objectContaining({ fontRevision: expect.any(Number) }));
  expect(view.container.querySelector('[data-flow-entrance]')).toHaveAttribute('data-ink-phase', 'settled');
  view.unmount(); style.mockRestore();
  document.documentElement.style.removeProperty('--flow-classic-family');
});

test('an explicitly enabled probe reports layout and draw work without remeasuring pure scroll', () => {
  const host = window as Window & { __INFIDAO_FLOW_RENDER_PROBE__?: (frame: Record<string, unknown>) => void };
  const frames: Record<string, any>[] = [];
  host.__INFIDAO_FLOW_RENDER_PROBE__ = frame => frames.push(frame);
  const callbacks = new Map<number, FrameRequestCallback>(); let serial = 0;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++serial, callback); return serial; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const view = render(<FlowStream {...props} />);
  const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 844 });
  Object.defineProperty(panel, 'clientWidth', { value: 390 });
  const step = (time: number) => act(() => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); });
  try {
    step(10);
    const count = frames.at(-1)!.layout.count;
    panel.scrollTop = 40; fireEvent.scroll(panel); step(30);
    expect(frames.at(-1)).toMatchObject({ drawMs: expect.any(Number), sceneMs: expect.any(Number), layout: { count, reason: 'mount' } });
    expect(jest.mocked(StreamGlass).mock.calls.at(-1)![2]).toBe(true);
  } finally {
    view.unmount(); raf.mockRestore(); cancel.mockRestore(); delete host.__INFIDAO_FLOW_RENDER_PROBE__;
  }
});

test('multiple font notifications in a frame share one layout refresh', async () => {
  const host = window as Window & { __INFIDAO_FLOW_RENDER_PROBE__?: (frame: Record<string, unknown>) => void };
  const frames: Record<string, any>[] = [];
  host.__INFIDAO_FLOW_RENDER_PROBE__ = frame => frames.push(frame);
  const callbacks = new Map<number, FrameRequestCallback>(); let serial = 0;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++serial, callback); return serial; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const view = render(<FlowStream {...props} />);
  const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 844 });
  Object.defineProperty(panel, 'clientWidth', { value: 390 });
  const step = (time: number) => act(() => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); });
  try {
    step(10); const count = frames.at(-1)!.layout.count;
    await act(async () => { document.documentElement.style.setProperty('--flow-classic-family', 'First'); });
    await act(async () => { document.documentElement.style.setProperty('--flow-classic-family', 'Final'); });
    step(30);
    expect(frames.at(-1)!.layout).toMatchObject({ count: count + 1, reason: 'font' });
  } finally {
    view.unmount(); raf.mockRestore(); cancel.mockRestore(); delete host.__INFIDAO_FLOW_RENDER_PROBE__;
    document.documentElement.style.removeProperty('--flow-classic-family');
  }
});

test('automatic reading uses one continuous position for native text, optics and saved scroll', () => {
  const host = window as Window & { __INFIDAO_FLOW_RENDER_PROBE__?: (frame: Record<string, unknown>) => void };
  const frames: Record<string, any>[] = [];
  host.__INFIDAO_FLOW_RENDER_PROBE__ = frame => frames.push(frame);
  const callbacks = new Map<number, FrameRequestCallback>(); let serial = 0, actual = 0;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++serial, callback); return serial; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const onScroll = jest.fn();
  const view = render(<FlowStream {...props} paused={false} reducedMotion={false} onScroll={onScroll} />);
  const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  const content = panel.firstElementChild as HTMLElement;
  Object.defineProperty(panel, 'clientHeight', { value: 844 });
  Object.defineProperty(panel, 'clientWidth', { value: 390 });
  Object.defineProperty(panel, 'scrollHeight', { value: 3000 });
  Object.defineProperty(panel, 'scrollTop', { configurable: true, get: () => actual,
    set: (top: number) => { actual = Math.round(top * 2) / 2; } });
  const step = (time: number) => act(() => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); });
  try {
    for (let frame = 0; frame <= 60; frame++) {
      step(frame * 1000 / 60);
      const last = frames.at(-1)!;
      expect(last.scrollTop).toBeCloseTo(frame * .2, 9);
      expect(last.nativeScrollTop + last.scrollRemainder).toBeCloseTo(last.scrollTop, 9);
      const translate = content.style.translate ? Number(content.style.translate.split(' ')[1]!.replace('px', '')) : 0;
      expect(actual - translate).toBeCloseTo(last.scrollTop, 9);
      const draw = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
      expect(draw.mock.calls.at(-1)![4].adhesionScroll).toBeCloseTo(last.scrollTop, 9);
    }
    step(1020);
    fireEvent.click(panel);
    expect(onScroll).toHaveBeenLastCalledWith(expect.closeTo(12.24, 9));
    const stoppedAt = frames.at(-1)!.scrollTop;
    view.rerender(<FlowStream {...props} reducedMotion={false} onScroll={onScroll} />);
    step(10000);
    expect(frames.at(-1)!.scrollTop).toBeCloseTo(stoppedAt, 9);
    actual += 50; fireEvent.scroll(panel); step(10020);
    expect(frames.at(-1)!.scrollTop).toBeCloseTo(stoppedAt + 50, 9);
  } finally {
    view.unmount();
    expect(content.style.translate).toBe('');
    raf.mockRestore(); cancel.mockRestore(); delete host.__INFIDAO_FLOW_RENDER_PROBE__;
  }
});

test.each(['current', 'liquid-live'] as const)('streamed suffixes keep glyph progress after remeasurement in %s', async motionVariant => {
  let clock = 0, serial = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++serial, callback); return serial; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const view = render(<FlowStream {...props} reducedMotion={false} motionVariant={motionVariant} />);
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
    const withReflection = { ...entry, frame: { ...first, reflection: '方向', textBreaks: { meaning: [], reflection: [2] } } };
    view.rerender(<FlowStream {...props} entries={[withReflection]} reducedMotion={false} motionVariant={motionVariant} />);
    await measureWords(); step(1000);
    expect(progress().map(glyph => glyph.progress)).toEqual([1, 1, 1, 0, 0]);
    step(1900);
    const suffix = { ...withReflection, frame: { ...withReflection.frame, reflection: '方向而后', textBreaks: { meaning: [], reflection: [2, 4] } } };
    view.rerender(<FlowStream {...props} entries={[suffix]} reducedMotion={false} motionVariant={motionVariant} />);
    await measureWords(); step(2000);
    expect(progress().map(glyph => glyph.char).join('')).toBe('知止。方向而后');
    expect(progress().map(glyph => glyph.progress)).toEqual([1, 1, 1, 1, 1, 0, 0]);
  } finally {
    view.unmount(); raf.mockRestore(); cancel.mockRestore(); now.mockRestore();
    document.documentElement.style.removeProperty('--flow-classic-family');
  }
});

test.each([false, true])('manual fast=%s completes visible ink while slow input retains the reveal and water profile', async fast => {
  let clock = 0, serial = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++serial, callback); return serial; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const view = render(<FlowStream {...props} reducedMotion={false} onResume={jest.fn()} />);
  const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 844 });
  Object.defineProperty(panel, 'clientWidth', { value: 390 });
  const step = (time: number) => act(() => {
    clock = time;
    const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time));
  });
  try {
    view.container.querySelectorAll<HTMLElement>('[data-flow-entrance], [data-flow-optic]').forEach(element => {
      Object.defineProperty(element, 'offsetTop', { configurable: true, value: 200 });
      Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 50 });
    });
    await act(async () => { document.documentElement.style.setProperty('--flow-classic-family', String(++serial)); });
    step(0); step(100);
    const part = view.container.querySelector('[data-flow-entrance]')!;
    expect(part).toHaveAttribute('data-ink-phase', 'entering');
    const word = screen.getByRole('button', { name: '止' });
    fireEvent.wheel(panel, { deltaY: fast ? 100 : 2 });
    panel.scrollTop = fast ? 40 : 2; fireEvent.scroll(panel); step(116);
    expect(part).toHaveAttribute('data-ink-phase', fast ? 'settled' : 'entering');
    expect(part).toHaveAttribute('data-entry-phase', 'entering');
    expect(screen.getByRole('button', { name: '止' })).toBe(word);
    const drawn = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
    const call = drawn.mock.calls.at(-1)!;
    expect(call[4]).toMatchObject({ liquid: true, contacts: true, perlin: true });
    const progress = (call[0] as Array<{ ink?: number[] }>).flatMap(run => run.ink || [1]);
    if (fast) expect(progress.every(value => value === 1)).toBe(true);
    else expect(progress.some(value => value > 0 && value < 1)).toBe(true);
  } finally {
    view.unmount(); raf.mockRestore(); cancel.mockRestore(); now.mockRestore();
    document.documentElement.style.removeProperty('--flow-classic-family');
  }
});

test('switching the liquid candidate preserves entrance, ink progress, pause and the mounted reader', async () => {
  let clock = 0, serial = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++serial, callback); return serial; });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id); });
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const view = render(<FlowStream {...props} paused={false} autoScroll={false} reducedMotion={false} motionVariant="liquid-live" />);
  const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(panel, 'clientHeight', { value: 844 });
  Object.defineProperty(panel, 'clientWidth', { value: 390 });
  panel.scrollTop = 37;
  const part = view.container.querySelector<HTMLElement>('[data-flow-entrance]')!;
  const step = (time: number) => act(() => {
    clock = time;
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(callback => callback(time));
  });
  const drawn = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
  const ink = () => (drawn.mock.calls.at(-1)![0] as Array<{ ink?: number[] }>).flatMap(run => run.ink || [1]);
  try {
    view.container.querySelectorAll<HTMLElement>('[data-flow-entrance], [data-flow-optic]').forEach(element => {
      Object.defineProperty(element, 'offsetTop', { configurable: true, value: 200 });
      Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 50 });
    });
    await act(async () => { document.documentElement.style.setProperty('--flow-classic-family', 'candidate-entry-test'); });
    step(0); step(120);
    expect(part).toHaveAttribute('data-entry-phase', 'entering');
    expect(part).toHaveAttribute('data-ink-phase', 'entering');
    expect(ink()[0]).toBeGreaterThan(0); expect(ink()[0]).toBeLessThan(1);
    const progress = ink()[0]!;
    view.rerender(<FlowStream {...props} paused={false} autoScroll={false} reducedMotion={false} motionVariant="current" />);
    step(140);
    expect(ink()[0]).toBeGreaterThan(progress); expect(ink()[0]).toBeLessThan(1);
    expect(part).toHaveAttribute('data-entry-phase', 'entering');
    view.rerender(<FlowStream {...props} autoScroll={false} reducedMotion={false} motionVariant="liquid-live" />);
    step(1000); const frozen = ink(); step(2000);
    expect(ink()).toEqual(frozen);
    expect(part).toHaveAttribute('data-entry-phase', 'paused');
    expect(part).toHaveAttribute('data-ink-phase', 'paused');
    expect(view.container.querySelector('[data-flow-viewport]')).toBe(panel);
    expect(panel.scrollTop).toBe(37);
    view.rerender(<FlowStream {...props} paused={false} autoScroll={false} reducedMotion={false} motionVariant="liquid-live" />);
    step(3000);
    expect(part).toHaveAttribute('data-entry-phase', 'settled');
    expect(part).toHaveAttribute('data-ink-phase', 'settled');
  } finally {
    view.unmount(); raf.mockRestore(); cancel.mockRestore(); now.mockRestore();
    document.documentElement.style.removeProperty('--flow-classic-family');
  }
});
