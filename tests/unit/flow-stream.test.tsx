import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { frameData, frameSteps } from 'framer-motion';
import { FlowStream } from '@/components/flow/FlowStream';
import { FlowWaiting } from '@/components/flow/FlowWaiting';
import type { FlowFrame } from '@/lib/flow/contracts';
import { entryKey, type StreamEntry } from '@/lib/flow-browser/continuity';
import { quoteKey } from '@/lib/flow-browser/library';
import { EntranceMotion } from '@/lib/flow-browser/entrance-motion';
import { ARRIVAL_RISE } from '@/lib/flow-browser/arrival-rise';
import { LENS } from '@/lib/flow-browser/lens-motion';
import { StreamGlass } from '@/lib/flow-browser/stream-glass';
import { bendDisplayPoint } from '@/lib/flow-browser/bend';

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

test('a menu gesture retains its pressed passage when the pointer crosses another passage', () => {
  const onRead = jest.fn();
  const view = render(<FlowStream {...props} entries={[entry, second]} activeKey={entryKey(second)} onRead={onRead} />);
  const start = view.container.querySelector('[data-flow-frame="first"]')!;
  const crossed = view.container.querySelector('[data-flow-frame="second"]')!;
  fireEvent(start, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 380, clientY: 200 }));
  fireEvent(crossed, new MouseEvent('pointermove', { bubbles: true, clientX: 180, clientY: 205 }));
  fireEvent(crossed, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 180, clientY: 205 }));
  expect(screen.getByRole('dialog', { name: '阅读选项' })).toBeInTheDocument();
  expect(onRead).toHaveBeenLastCalledWith(entry);
  expect(onRead).not.toHaveBeenCalledWith(second);
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
  for (const [type, x, y, timeStamp] of [['pointerdown', 300, 300, 0], ['pointermove', 220, 302, 16], ['pointerup', 220, 302, 20]] as const) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    fireEvent(word, event);
  }
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

test('opening notes hands focus to their visible heading rather than opening a keyboard', async () => {
  const onScroll = jest.fn(), view = render(<FlowStream {...props} onScroll={onScroll} />);
  const viewport = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(viewport, 'clientHeight', { value: 844 });
  Object.defineProperty(viewport, 'scrollHeight', { value: 3000 });
  fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
  fireEvent.click(screen.getByRole('button', { name: '注脚' }));
  const heading = screen.getByRole('heading', { name: '自己的注脚' });
  jest.spyOn(heading, 'getBoundingClientRect').mockReturnValue({ top: 1100 } as DOMRect);
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(heading).toHaveFocus();
  expect(screen.getByRole('textbox')).not.toHaveFocus();
  expect(viewport.scrollTop).toBe(889);
  expect(onScroll).toHaveBeenLastCalledWith(889);
});

test('offscreen branch arrival offers an explicit handoff without moving the old reading point', async () => {
  const onRead = jest.fn(), view = render(<FlowStream {...props} entries={[entry, second]} onRead={onRead} />);
  const viewport = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
  Object.defineProperty(viewport, 'clientHeight', { value: 844 });
  Object.defineProperty(viewport, 'scrollHeight', { value: 3000 });
  const target = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
  jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 1400, height: 100 } as DOMRect);
  viewport.scrollTop = 31;
  view.rerender(<FlowStream {...props} entries={[entry, second]} onRead={onRead}
    arrival={{ id: 'arrival-child', sourceKey: entryKey(entry), targetKey: entryKey(second), label: '沿「止」已接续' }} />);
  await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  expect(viewport.scrollTop).toBe(31);
  const go = screen.getByRole('button', { name: '去读' });
  expect(go.closest('[data-flow-stream]')).toHaveAttribute('data-arrival-docked');
  const scan = jest.spyOn(viewport, 'querySelectorAll');
  for (let offset = 32; offset < 72; offset++) {
    viewport.scrollTop = offset;
    fireEvent.scroll(viewport);
  }
  expect(scan).not.toHaveBeenCalled();
  viewport.scrollTop = 31;
  fireEvent.click(go);
  expect(scan).not.toHaveBeenCalled();
  scan.mockRestore();
  expect(onRead).toHaveBeenLastCalledWith(second);
  expect(target).toHaveFocus();
  expect(viewport.scrollTop).toBe(1220);
  expect(screen.queryByRole('button', { name: '去读' })).not.toBeInTheDocument();
  expect(view.container.querySelector('[data-flow-stream]')).not.toHaveAttribute('data-arrival-docked');
});

describe('branch arrival under reading overlays', () => {
  const arrival = { id: 'child', sourceKey: entryKey(entry), targetKey: entryKey(second), label: '沿「止」已接续' };
  const advance = () => act(() => { jest.advanceTimersByTime(32); });
  const go = () => screen.queryByRole('button', { name: '去读' });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });
  afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

  test.each([
    { dockedHeight: 780, initialTop: 145, afterDockTop: 145, readableTop: 160 },
    { dockedHeight: 440, initialTop: 700, afterDockTop: 360, readableTop: 320 },
  ])('the dock keeps the original reading band but rejects clipping at height $dockedHeight', ({ dockedHeight, initialTop, afterDockTop, readableTop }) => {
    const view = render(<FlowStream {...props} entries={[entry, second]} arrival={arrival} />);
    const viewport = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    const stream = viewport.parentElement!;
    Object.defineProperty(stream, 'clientHeight', { value: 844 });
    Object.defineProperty(viewport, 'clientHeight', { get: () => stream.hasAttribute('data-arrival-docked') ? dockedHeight : 844 });
    const target = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    const position = jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: initialTop, height: 100 } as DOMRect);
    advance();
    expect(go()).toBeInTheDocument();
    position.mockReturnValue({ top: afterDockTop, height: 100 } as DOMRect);
    advance();
    fireEvent.scroll(viewport);
    expect(go()).toBeInTheDocument();
    expect(viewport.scrollTop).toBe(0);
    expect(target).not.toHaveFocus();
    position.mockReturnValue({ top: readableTop, height: 100 } as DOMRect);
    fireEvent.scroll(viewport);
    expect(go()).not.toBeInTheDocument();
  });

  test.each([true, false])('rechecks the current reading zone when an overlay closes (in zone: %s)', inZone => {
    const options = { ...props, entries: [entry, second], arrival };
    const view = render(<FlowStream {...options} />);
    const viewport = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    const target = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    const bounds = jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 900, height: 100 } as DOMRect);
    advance();
    expect(go()).toBeInTheDocument();

    view.rerender(<FlowStream {...options} arrivalObscured />);
    expect(view.container.querySelector('[data-flow-arrival]')).toBeNull();
    bounds.mockReturnValue({ top: 200, height: 100 } as DOMRect);
    viewport.scrollTop = 700;
    fireEvent.scroll(viewport);
    advance();
    expect(go()).not.toBeInTheDocument();
    if (!inZone) {
      bounds.mockReturnValue({ top: 900, height: 100 } as DOMRect);
      viewport.scrollTop = 0;
      fireEvent.scroll(viewport);
    }

    view.rerender(<FlowStream {...options} />);
    expect(go()).not.toBeInTheDocument();
    advance();
    if (inZone) {
      bounds.mockReturnValue({ top: 900, height: 100 } as DOMRect);
      viewport.scrollTop = 0;
      fireEvent.scroll(viewport);
      expect(go()).not.toBeInTheDocument();
    } else {
      expect(go()).toBeInTheDocument();
    }
    expect(target).not.toHaveFocus();
  });

  test('a new arrival replaces the old notice and lands on its remeasured heading', () => {
    const onRead = jest.fn();
    const options = { ...props, entries: [entry, second], arrival, onRead };
    const view = render(<FlowStream {...options} />);
    const viewport = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    Object.defineProperty(viewport, 'scrollHeight', { value: 3000 });
    advance();
    expect(screen.getByText(arrival.label)).toBeInTheDocument();
    const oldHeading = view.container.querySelector('[data-flow-frame="second"] [data-flow-heading]');

    const replacement = { ...second, pathId: 'replaced-child' };
    const newArrival = { ...arrival, id: 'replacement', targetKey: entryKey(replacement), label: '沿「知」已接续' };
    const next = { ...options, entries: [entry, replacement], arrival: newArrival };
    view.rerender(<FlowStream {...next} arrivalObscured />);
    expect(go()).not.toBeInTheDocument();
    const heading = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    expect(heading).not.toBe(oldHeading);
    jest.spyOn(heading, 'getBoundingClientRect').mockReturnValue({ top: 950, height: 100 } as DOMRect);

    view.rerender(<FlowStream {...next} />);
    expect(go()).not.toBeInTheDocument();
    advance();
    expect(screen.queryByText(arrival.label)).not.toBeInTheDocument();
    expect(screen.getByText(newArrival.label)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '去读' }));
    expect(onRead).toHaveBeenLastCalledWith(replacement);
    expect(heading).toHaveFocus();
    expect(viewport.scrollTop).toBe(800);
  });

  test.each([true, false])('only a word arrival settles the in-zone quote early (word: %s)', word => {
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
    jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(180);
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => {
      canvas.dataset.optics = 'ready';
      return { draw: jest.fn(), destroy: jest.fn() } as unknown as StreamGlass;
    });
    const explained = { ...second, frame: { ...second.frame, reflection: '可以看清方向。' } };
    const options = { ...props, reducedMotion: false, entries: [entry, explained] };
    const view = render(<FlowStream {...options} />);
    const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    const source = view.container.querySelector('[data-flow-frame="first"] [data-flow-heading]')!;
    const target = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    const reflection = view.container.querySelector('[data-flow-frame="second"] [data-flow-entrance="reflection"]')!;
    jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 200, height: 100 } as DOMRect);
    advance();
    view.rerender(<FlowStream {...options} arrival={word ? { ...arrival, kind: 'word' } : arrival} />);
    advance(); advance();
    expect(target).toHaveAttribute('data-ink-phase', word ? 'settled' : 'entering');
    expect(target).toHaveAttribute('data-entry-phase', 'entering');
    expect(source).toHaveAttribute('data-ink-phase', 'entering');
    expect(reflection).toHaveAttribute('data-ink-phase', 'entering');
    expect(target).not.toHaveFocus();
    expect(panel.scrollTop).toBe(0);
    expect(go()).not.toBeInTheDocument();
  });

  test('an obscured or replaced word arrival does not settle a stale quote', () => {
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
    jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(180);
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => {
      canvas.dataset.optics = 'ready';
      return { draw: jest.fn(), destroy: jest.fn() } as unknown as StreamGlass;
    });
    const replacement = { ...second, pathId: 'replacement', frame: { ...second.frame, id: 'third' } };
    const options = { ...props, reducedMotion: false, entries: [entry, second, replacement] };
    const view = render(<FlowStream {...options} />);
    const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    const old = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    const latest = view.container.querySelector<HTMLElement>('[data-flow-frame="third"] [data-flow-heading]')!;
    jest.spyOn(old, 'getBoundingClientRect').mockReturnValue({ top: 200, height: 100 } as DOMRect);
    jest.spyOn(latest, 'getBoundingClientRect').mockReturnValue({ top: 200, height: 100 } as DOMRect);
    advance();
    view.rerender(<FlowStream {...options} arrival={{ ...arrival, kind: 'word' }} />);
    fireEvent.scroll(panel);
    const newer = { ...arrival, id: 'newer', kind: 'word' as const, targetKey: entryKey(replacement) };
    view.rerender(<FlowStream {...options} arrival={newer} arrivalObscured />);
    advance();
    expect(old).toHaveAttribute('data-ink-phase', 'entering');
    expect(latest).toHaveAttribute('data-ink-phase', 'entering');
    view.rerender(<FlowStream {...options} arrival={newer} />);
    advance(); advance();
    expect(latest).toHaveAttribute('data-ink-phase', 'settled');
    expect(old).toHaveAttribute('data-ink-phase', 'entering');
  });

  test('an offscreen word arrival keeps the reading point until the reader uses 去读', () => {
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
    jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
      return this.closest('[data-flow-frame="second"]') ? 900 : 180;
    });
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => {
      canvas.dataset.optics = 'ready';
      return { draw: jest.fn(), destroy: jest.fn() } as unknown as StreamGlass;
    });
    const onRead = jest.fn();
    const options = { ...props, reducedMotion: false, entries: [entry, second], onRead };
    const view = render(<FlowStream {...options} />);
    const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    const target = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    Object.defineProperty(panel, 'scrollHeight', { value: 2200 });
    jest.spyOn(target, 'getBoundingClientRect').mockImplementation(() => ({ top: 900 - panel.scrollTop, height: 100 } as DOMRect));
    advance();
    view.rerender(<FlowStream {...options} arrival={{ ...arrival, kind: 'word' }} />);
    advance();
    expect(panel.scrollTop).toBe(0);
    expect(target).toHaveAttribute('data-ink-phase', 'waiting');
    fireEvent.click(screen.getByRole('button', { name: '去读' }));
    advance(); advance();
    expect(panel.scrollTop).toBe(750);
    expect(onRead).toHaveBeenLastCalledWith(second);
    expect(target).toHaveFocus();
    expect(target).toHaveAttribute('data-ink-phase', 'settled');
  });

  test('remeasurement rechecks a pending heading without a scroll event', () => {
    const options = { ...props, arrival };
    const view = render(<FlowStream {...options} entries={[entry, second]} />);
    const heading = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    const bounds = jest.spyOn(heading, 'getBoundingClientRect').mockReturnValue({ top: 900, height: 100 } as DOMRect);
    advance();
    expect(go()).toBeInTheDocument();

    bounds.mockReturnValue({ top: 200, height: 100 } as DOMRect);
    const updated = { ...second, frame: { ...second.frame, chapterLabel: '经二章' } };
    view.rerender(<FlowStream {...options} entries={[entry, updated]} />);
    advance();
    expect(go()).not.toBeInTheDocument();
  });

  test('the menu and meaning keep the notice hidden until the last layer closes', () => {
    const explained = { ...entry, frame: { ...first, meaning: '方向。', textBreaks: { meaning: [2, 3], reflection: [] } } };
    const options = { ...props, arrival };
    const view = render(<FlowStream {...options} entries={[explained, second]} />);
    const viewport = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    const target = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    const bounds = jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 900, height: 100 } as DOMRect);
    advance();
    expect(go()).toBeInTheDocument();

    bounds.mockReturnValue({ top: 200, height: 100 } as DOMRect);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
      view.rerender(<FlowStream {...options} entries={[explained, { ...second }]} />);
    });
    advance();
    expect(go()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '释义' }));
    expect(screen.getByRole('dialog', { name: /释义/ })).toBeInTheDocument();
    fireEvent.scroll(viewport);
    bounds.mockReturnValue({ top: 900, height: 100 } as DOMRect);
    fireEvent.scroll(viewport);
    advance();
    expect(go()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭释义' }));
    advance();
    expect(go()).toBeInTheDocument();
  });
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

describe('the loading light hands off to real lettering', () => {
  const sized = (name: 'clientHeight' | 'clientWidth', value: number) =>
    jest.spyOn(HTMLElement.prototype, name, 'get').mockReturnValue(value);
  beforeEach(() => { jest.useFakeTimers(); sized('clientHeight', 600); sized('clientWidth', 390); });
  // Unmount while the fake animation frame API still exists.
  afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); window.history.replaceState(null, '', '/'); });

  test('reduced motion is ready as soon as passages exist', () => {
    const onVisualReady = jest.fn();
    render(<FlowStream {...props} onVisualReady={onVisualReady} />);
    expect(onVisualReady.mock.calls).toEqual([['native']]);
  });

  test('the glass announces its first drawn passage, once', () => {
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => ({
      draw: jest.fn(() => { canvas.dataset.optics = 'ready'; }), destroy: jest.fn(),
    }) as unknown as StreamGlass);
    const onVisualReady = jest.fn();
    render(<FlowStream {...props} reducedMotion={false} paused={false} onVisualReady={onVisualReady} />);
    act(() => { jest.advanceTimersByTime(100); });
    expect(onVisualReady.mock.calls).toEqual([['canvas']]);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(onVisualReady).toHaveBeenCalledTimes(1);
  });

  test('a stalled glass never holds the reader behind the light', () => {
    const onVisualReady = jest.fn();
    render(<FlowStream {...props} reducedMotion={false} onVisualReady={onVisualReady} />);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onVisualReady).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(400); });
    expect(onVisualReady.mock.calls).toEqual([['native']]);
  });

  test('the static quality tier hands off as native without waiting for the fallback timeout', () => {
    window.history.replaceState(null, '', '?quality=4');
    const onVisualReady = jest.fn();
    const view = render(<FlowStream {...props} reducedMotion={false} onVisualReady={onVisualReady} riseOnReveal />);
    act(() => { jest.advanceTimersByTime(32); });
    expect(onVisualReady.mock.calls).toEqual([['native']]);
    expect(view.container.querySelector('[data-flow-rising]')).toBeNull();
  });

  test.each([true, false])('context failure settles the opening before its first rise frame (hold %s)', holdEntrance => {
    let loseContext!: () => void;
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement, invalidate: () => void) => {
      loseContext = () => { canvas.dataset.optics = 'lost'; invalidate(); };
      return { draw: jest.fn(() => { if (!canvas.dataset.optics) canvas.dataset.optics = 'ready'; }), destroy: jest.fn() } as unknown as StreamGlass;
    });
    const onVisualReady = jest.fn();
    const options = { ...props, reducedMotion: false, onVisualReady, riseOnReveal: true, firstHint: <span>点词接续。</span> };
    const view = render(<FlowStream {...options} holdEntrance />);
    act(() => { jest.advanceTimersByTime(100); });
    expect(onVisualReady.mock.calls).toEqual([['canvas']]);
    expect(screen.queryByText('点词接续。')).not.toBeInTheDocument();
    if (!holdEntrance) view.rerender(<FlowStream {...options} holdEntrance={false} />);
    act(() => loseContext());
    expect(onVisualReady.mock.calls).toEqual(holdEntrance ? [['canvas'], ['native']] : [['canvas']]);
    expect(screen.getByText('点词接续。')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(32); });
    expect(view.container.querySelector('[data-flow-rising]')).toBeNull();
  });

  test('the first hint waits for the real optical rise and yields to the reading menu', () => {
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => ({
      draw: jest.fn(() => { canvas.dataset.optics = 'ready'; }), destroy: jest.fn(),
    }) as unknown as StreamGlass);
    const options = { ...props, reducedMotion: false, riseOnReveal: true, firstHint: <span>点词接续。</span> };
    const view = render(<FlowStream {...options} holdEntrance />);
    act(() => { jest.advanceTimersByTime(100); });
    expect(screen.queryByText('点词接续。')).not.toBeInTheDocument();
    view.rerender(<FlowStream {...options} />);
    act(() => { jest.advanceTimersByTime(32); });
    expect(view.container.querySelector('[data-flow-rising]')).toBeInTheDocument();
    expect(screen.queryByText('点词接续。')).not.toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(ARRIVAL_RISE.durationMs + 32); });
    expect(view.container.querySelector('[data-flow-rising]')).toBeNull();
    expect(screen.getByText('点词接续。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更多阅读选项' }));
    expect(screen.getByRole('dialog', { name: '阅读选项' })).toBeInTheDocument();
    expect(screen.queryByText('点词接续。')).not.toBeInTheDocument();
  });

  test('an in-zone word result waits for the opening rise without accelerating the opening quote', () => {
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
    jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(180);
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => ({
      draw: jest.fn(() => { canvas.dataset.optics = 'ready'; }), destroy: jest.fn(),
    }) as unknown as StreamGlass);
    const options = { ...props, entries: [entry, second], reducedMotion: false, riseOnReveal: true,
      arrival: { id: 'early-word', sourceKey: entryKey(entry), targetKey: entryKey(second), label: '已接续', kind: 'word' as const } };
    const view = render(<FlowStream {...options} holdEntrance />);
    const source = view.container.querySelector('[data-flow-frame="first"] [data-flow-heading]')!;
    const target = view.container.querySelector<HTMLElement>('[data-flow-frame="second"] [data-flow-heading]')!;
    jest.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 200, height: 100 } as DOMRect);
    act(() => { jest.advanceTimersByTime(100); });
    expect(target).toHaveAttribute('data-ink-phase', 'waiting');
    view.rerender(<FlowStream {...options} />);
    act(() => { jest.advanceTimersByTime(32); });
    expect(view.container.querySelector('[data-flow-rising]')).toBeInTheDocument();
    expect(source).not.toHaveAttribute('data-ink-phase', 'settled');
    expect(target).not.toHaveAttribute('data-ink-phase', 'settled');
    act(() => { jest.advanceTimersByTime(ARRIVAL_RISE.durationMs + 32); });
    expect(view.container.querySelector('[data-flow-rising]')).toBeNull();
    expect(target).toHaveAttribute('data-ink-phase', 'settled');
  });

  test('the hint yields from the start of a menu drag through the end of its closing spring', () => {
    const view = render(<FlowStream {...props} reducedMotion={false} firstHint={<button type="button">知道了</button>} />);
    const viewport = screen.getByRole('generic', { name: '经文阅读' });
    const menu = view.container.querySelector('[data-flow-menu]');
    const hint = () => screen.queryByRole('button', { name: '知道了' });
    expect(hint()).toBeInTheDocument();
    fireEvent(viewport, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 350, clientY: 300 }));
    fireEvent(viewport, new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 130, clientY: 300 }));
    expect(menu).not.toHaveAttribute('hidden');
    expect(menu).toHaveAttribute('aria-hidden', 'true');
    expect(hint()).not.toBeInTheDocument();
    fireEvent(viewport, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 130, clientY: 300 }));
    fireEvent.click(view.container.querySelector('[data-flow-menu-backdrop]')!);
    expect(menu).not.toHaveAttribute('hidden');
    expect(menu).toHaveAttribute('aria-hidden', 'true');
    expect(hint()).not.toBeInTheDocument();
    // Framer Motion captures the browser frame scheduler before Jest installs its clock.
    // Process the animation frames with the same clock used by the reader.
    const previousFrame = { ...frameData };
    try {
      for (let frame = 0; frame < 100 && !menu?.hasAttribute('hidden'); frame++) {
        act(() => {
          jest.advanceTimersByTime(16);
          Object.assign(frameData, { delta: 16, timestamp: performance.now(), isProcessing: true });
          for (const step of Object.values(frameSteps)) step.process(frameData);
        });
      }
    } finally {
      Object.assign(frameData, previousFrame);
    }
    expect(menu).toHaveAttribute('hidden');
    expect(hint()).toBeInTheDocument();
  });
});

describe('quality tiers reach the glass', () => {
  const sized = (name: 'clientHeight' | 'clientWidth', value: number) =>
    jest.spyOn(HTMLElement.prototype, name, 'get').mockReturnValue(value);
  beforeEach(() => { jest.useFakeTimers(); sized('clientHeight', 600); sized('clientWidth', 390); });
  afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); window.history.replaceState(null, '', '/'); });

  const drawsAt = (search: string) => {
    window.history.replaceState(null, '', `/InfiDao${search}`);
    const draw = jest.fn();
    jest.mocked(StreamGlass).mockImplementationOnce(() => ({ draw, destroy: jest.fn() }) as unknown as StreamGlass);
    render(<FlowStream {...props} reducedMotion={false} paused={false} />);
    act(() => { jest.advanceTimersByTime(100); });
    return draw.mock.calls.at(-1)!;
  };

  test('full quality keeps the water and the reader resolution', () => {
    const [, , , staticGlass, shape] = drawsAt('');
    expect(staticGlass).toBe(false);
    expect(shape.ripple).toBe(1);
    expect(shape.maxDpr).toBeUndefined();
  });

  test.each([[320, 740], [390, 844]])('a still %i × %i glass keeps the prose within frame and resolves the displayed word', (width, height) => {
    sized('clientWidth', width);
    sized('clientHeight', height);
    jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(26);
    jest.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
      return this.textContent?.startsWith('止') ? 126 : 90;
    });
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(38);
    jest.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(22);
    const draw = jest.fn<void, Parameters<StreamGlass['draw']>>();
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => {
      canvas.dataset.optics = 'ready';
      return { draw, destroy: jest.fn() } as unknown as StreamGlass;
    });
    const onBranch = jest.fn(), options = { ...props, reducedMotion: false, settleEntrance: true, onBranch };
    const view = render(<FlowStream {...options} pending />);
    const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    jest.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 16, top: 12, width, height } as DOMRect);
    Object.defineProperty(panel, 'scrollHeight', { value: 1200 });
    act(() => { jest.advanceTimersByTime(64); });
    const [runs, , , , calm] = draw.mock.calls.at(-1)!;
    expect(calm?.ripple).toBe(.25);
    expect(calm?.adhesion).toBeCloseTo(.18);
    expect(calm?.dispersion).toBeCloseTo(.18);
    expect(calm?.zone).toBeCloseTo(Math.min(.12, 82 / height));
    expect(calm?.flare).toBeCloseTo(.02);
    const leftProse = bendDisplayPoint(20, 18, calm!);
    const rightProse = bendDisplayPoint(width - 20, height - 18, calm!);
    expect(leftProse.x).toBeGreaterThan(8);
    expect(rightProse.x).toBeLessThan(width - 8);
    const word = runs.find(item => item.text.startsWith('止'))!;
    const displayed = bendDisplayPoint(word.x, word.y, calm!);
    fireEvent.click(panel, { detail: 1, clientX: displayed.x + 16, clientY: displayed.y + 12 });
    expect(onBranch).toHaveBeenCalledWith(expect.objectContaining({
      frameId: 'first', label: '止', selection: expect.objectContaining({ start: 1, end: 2 }),
    }));

    panel.scrollTop = 20;
    fireEvent.scroll(panel);
    act(() => { jest.advanceTimersByTime(16); });
    expect(draw.mock.calls.at(-1)?.[4]).toMatchObject({ ripple: 1, adhesion: .4, zone: .46, flare: .5 });
    act(() => { jest.advanceTimersByTime(64); });
    expect(draw.mock.calls.at(-1)?.[4]?.ripple).toBe(.25);
    view.rerender(<FlowStream {...options} paused={false} />);
    act(() => { jest.advanceTimersByTime(64); });
    expect(panel.scrollTop).toBeGreaterThan(20);
    expect(draw.mock.calls.at(-1)?.[4]).toMatchObject({ ripple: 1, adhesion: .4, zone: .46, flare: .5 });
  });

  test('a settled paused glass without ambient water stops requesting frames', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => {
      canvas.dataset.optics = 'ready';
      return { draw: jest.fn(), destroy: jest.fn() } as unknown as StreamGlass;
    });
    render(<FlowStream {...props} reducedMotion={false} settleEntrance motionVariant="current" />);
    act(() => { jest.advanceTimersByTime(128); });
    raf.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf).not.toHaveBeenCalled();
  });

  test.each([['?quality=1', 1], ['?quality=2', .8], ['?quality=3', .67]])(
    'lower tier %s lowers only the resolution; the water and its fire stay', (search, maxDpr) => {
      const [, , , staticGlass, shape] = drawsAt(search);
      expect(staticGlass).toBe(false);
      expect(shape.maxDpr).toBe(maxDpr);
      expect(shape.ripple).toBe(1);
    });

  test('the last tier keeps the glass still', () => {
    const [, , , staticGlass] = drawsAt('?quality=4');
    expect(staticGlass).toBe(true);
  });

  test('paused, settled static glass stops requesting frames and redraws on scroll', () => {
    window.history.replaceState(null, '', '/InfiDao?quality=4');
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    render(<FlowStream {...props} reducedMotion={false} settleEntrance motionSeed={12} />);
    const panel = screen.getByRole('generic', { name: '经文阅读' });
    const draw = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
    act(() => { jest.advanceTimersByTime(2500); });
    expect(draw).toHaveBeenCalled();
    raf.mockClear(); draw.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();

    panel.scrollTop = 120;
    fireEvent.scroll(panel);
    act(() => { jest.advanceTimersByTime(100); });
    expect(raf).toHaveBeenCalled();
    expect(draw.mock.calls.at(-1)?.[3]).toBe(true);
    expect(panel.scrollTop).toBe(120);

    act(() => { jest.advanceTimersByTime(2500); });
    raf.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf).not.toHaveBeenCalled();
  });

  test('unavailable glass lets settled native reading sleep and redraw on scroll', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    const draw = jest.fn<void, Parameters<StreamGlass['draw']>>();
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement, invalidate: () => void) => ({
      draw: (...args: Parameters<StreamGlass['draw']>) => {
        draw(...args);
        if (!canvas.dataset.optics) { canvas.dataset.optics = 'unavailable'; invalidate(); }
      }, destroy: jest.fn(),
    }) as unknown as StreamGlass);
    render(<FlowStream {...props} reducedMotion={false} settleEntrance motionSeed={12} />);
    const panel = screen.getByRole('generic', { name: '经文阅读' });
    act(() => { jest.advanceTimersByTime(2500); });
    expect(draw).toHaveBeenCalled();
    raf.mockClear(); draw.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();

    panel.scrollTop = 120;
    fireEvent.scroll(panel);
    act(() => { jest.advanceTimersByTime(100); });
    expect(raf).toHaveBeenCalled();
    expect(draw.mock.calls.at(-1)?.[3]).toBe(false);
    expect(panel.scrollTop).toBe(120);

    act(() => { jest.advanceTimersByTime(2500); });
    raf.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf).not.toHaveBeenCalled();
  });

  test('losing settled live glass stops its frames and restoring it resumes water without input', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    let loseContext!: () => void, restoreContext!: () => void;
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement, invalidate: () => void) => {
      let lost = false;
      loseContext = () => { lost = true; canvas.dataset.optics = 'lost'; invalidate(); };
      restoreContext = () => { lost = false; invalidate(); };
      return { draw: jest.fn(() => { if (!lost) canvas.dataset.optics = 'ready'; }), destroy: jest.fn() } as unknown as StreamGlass;
    });
    const view = render(<FlowStream {...props} reducedMotion={false} settleEntrance motionSeed={12} />);
    const canvas = view.container.querySelector('canvas');
    const draw = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
    act(() => { jest.advanceTimersByTime(2500); });
    expect(canvas).toHaveAttribute('data-optics', 'ready');
    expect(draw.mock.calls.length).toBeGreaterThan(1);

    act(() => { loseContext(); jest.advanceTimersByTime(100); });
    expect(canvas).toHaveAttribute('data-optics', 'lost');
    raf.mockClear(); draw.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();

    act(() => restoreContext());
    expect(canvas).toHaveAttribute('data-optics', 'lost');
    act(() => { jest.advanceTimersByTime(1000); });
    expect(canvas).toHaveAttribute('data-optics', 'ready');
    expect(draw.mock.calls.length).toBeGreaterThan(2);
    expect(draw.mock.calls.at(-1)?.[4].noisePhase).not.toBe(draw.mock.calls[1]?.[4].noisePhase);
  });

  test.each([0, 3])('paused, settled live tier %d still redraws the ambient water', tier => {
    window.history.replaceState(null, '', `/InfiDao?quality=${tier}`);
    render(<FlowStream {...props} reducedMotion={false} settleEntrance motionSeed={12} />);
    const draw = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
    act(() => { jest.advanceTimersByTime(2500); });
    const phase = draw.mock.calls.at(-1)?.[4].noisePhase;
    draw.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(draw.mock.calls.length).toBeGreaterThan(1);
    expect(draw.mock.calls.at(-1)?.[3]).toBe(false);
    expect(draw.mock.calls.at(-1)?.[4].noisePhase).not.toBe(phase);
  });

  test('a frozen entrance keeps its lettering steady at the idle water cadence until resumed', () => {
    window.history.replaceState(null, '', '/InfiDao?quality=0');
    jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
    jest.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(200);
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    const draws: Array<{ x: number; ink: number[]; water: number | undefined; lens: number }> = [];
    jest.mocked(StreamGlass).mockImplementationOnce((canvas: HTMLCanvasElement) => ({
      draw: (...[runs, , , , shape]: Parameters<StreamGlass['draw']>) => {
        canvas.dataset.optics = 'ready';
        const word = runs.find(run => run.text === '知');
        if (word) draws.push({ x: word.x, ink: [...(word.ink ?? [])], water: shape?.noisePhase, lens: shape?.lens?.[3] ?? 0 });
      }, destroy: jest.fn(),
    }) as unknown as StreamGlass);
    const options = { ...props, autoScroll: false, reducedMotion: false, motionSeed: 12 };
    const view = render(<FlowStream {...options} paused={false} />);
    const part = view.container.querySelector('[data-flow-entrance]');
    act(() => { jest.advanceTimersByTime(160); });
    expect(part).toHaveAttribute('data-entry-phase', 'entering');
    const entering = draws.at(-1)!;
    expect(entering.ink[0]).toBeGreaterThan(0);
    expect(entering.ink[0]).toBeLessThan(1);

    view.rerender(<FlowStream {...options} />);
    act(() => { jest.advanceTimersByTime(2500); });
    expect(part).toHaveAttribute('data-entry-phase', 'paused');
    expect(part).toHaveAttribute('data-ink-phase', 'paused');
    raf.mockClear(); draws.length = 0;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf.mock.calls.length).toBeLessThan(25);
    expect(draws.length).toBeGreaterThan(1);
    expect(draws.at(-1)?.water).not.toBe(draws[0]?.water);
    expect(draws.every(draw => draw.x === entering.x)).toBe(true);
    expect(draws.map(draw => draw.ink)).toEqual(draws.map(() => entering.ink));

    const word = screen.getByRole('button', { name: '知' });
    raf.mockClear(); draws.length = 0;
    fireEvent(word, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    act(() => { jest.advanceTimersByTime(200); });
    expect(raf.mock.calls.length).toBeGreaterThan(8);
    expect(draws[0]?.lens).toBeGreaterThan(0);
    expect(draws.at(-1)?.lens).toBeGreaterThan(draws[0]!.lens);

    act(() => { jest.advanceTimersByTime(2500); });
    raf.mockClear(); draws.length = 0;
    act(() => { jest.advanceTimersByTime(1000); });
    expect(raf.mock.calls.length).toBeLessThan(25);
    expect(draws.length).toBeGreaterThan(1);
    expect(draws.at(-1)?.lens).toBe(1);

    raf.mockClear(); draws.length = 0;
    fireEvent(word, new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    act(() => { jest.advanceTimersByTime(200); });
    expect(raf.mock.calls.length).toBeGreaterThan(8);
    expect(draws.at(-1)?.lens).toBeLessThan(draws[0]!.lens);

    act(() => { jest.advanceTimersByTime(2500); });
    raf.mockClear();
    view.rerender(<FlowStream {...options} paused={false} />);
    act(() => { jest.advanceTimersByTime(240); });
    expect(raf.mock.calls.length).toBeGreaterThan(10);
    expect(draws.at(-1)?.x).not.toBe(entering.x);
    expect(draws.at(-1)?.ink[0]).toBeGreaterThan(entering.ink[0]!);
  });

  const driveFrames = () => {
    let time = 0, nextFrame: FrameRequestCallback | undefined;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return 1; });
    const view = render(<FlowStream {...props} paused={false} reducedMotion={false} settleEntrance />);
    const panel = view.container.querySelector<HTMLElement>('[data-flow-viewport]')!;
    Object.defineProperty(panel, 'scrollHeight', { value: 3000 });
    const draw = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
    return { draw, step(gap: number) {
      time += gap;
      const callback = nextFrame;
      nextFrame = undefined;
      act(() => callback!(time));
    } };
  };

  test('a sustained foreground stall lowers the actual glass resolution', () => {
    const { draw, step } = driveFrames();
    for (let i = 0; i < 150; i++) step(280);
    const [, , , staticGlass, shape] = draw.mock.calls.at(-1)!;
    // A severe stall steps two tiers per window; the fire is still there.
    expect(staticGlass).toBe(false);
    expect(shape.maxDpr).toBe(.8);
    expect(shape.ripple).toBe(1);
  });

  test('going to the background with no intervening frame does not count as stutter', () => {
    let hidden = false;
    jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { draw, step } = driveFrames();
    step(0);
    for (let i = 0; i < 150; i++) {
      step(17); step(17);
      hidden = true; fireEvent(document, new Event('visibilitychange'));
      hidden = false; fireEvent(document, new Event('visibilitychange'));
      step(900);
    }
    expect(draw.mock.calls.at(-1)![4].maxDpr).toBeUndefined();
  });
});

describe('the long-press lens follows the meaning dialog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
  });
  afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

  test.each(['branch', 'restore', 'meaning removed', 'close'] as const)('the lens recedes after %s', action => {
    const frame = { ...first, meaning: '方向。', textBreaks: { meaning: [2, 3], reflection: [] } };
    const explained = { ...entry, frame };
    const onBranch = jest.fn(), onResume = jest.fn();
    const options = { ...props, entries: [explained], paused: false, autoScroll: false, reducedMotion: false,
      settleEntrance: true, onBranch, onResume };
    const view = render(<FlowStream {...options} />);
    const draw = jest.mocked(StreamGlass).mock.results.at(-1)!.value.draw as jest.Mock;
    const lens = () => draw.mock.calls.at(-1)?.[4].lens?.[3] ?? 0;
    const word = screen.getByRole('button', { name: '知' });
    fireEvent(word, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    act(() => { jest.advanceTimersByTime(LENS.growMs + 100); });
    fireEvent(word, new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    expect(screen.getByRole('dialog', { name: /释义/ })).toBeInTheDocument();
    expect(lens()).toBe(1);

    if (action === 'branch') {
      fireEvent.click(screen.getByRole('button', { name: '方向' }));
      expect(onBranch).toHaveBeenCalledWith(expect.objectContaining({ pathId: entry.pathId, frameId: first.id,
        selection: expect.objectContaining({ surface: 'meaning' }) }));
    } else if (action === 'restore') {
      view.rerender(<FlowStream {...options} restore={{ revision: 1, top: 0 }} />);
    } else if (action === 'meaning removed') {
      view.rerender(<FlowStream {...options} entries={[entry]} />);
    } else {
      fireEvent.click(screen.getByRole('button', { name: '关闭释义' }));
    }
    expect(screen.queryByRole('dialog', { name: /释义/ })).not.toBeInTheDocument();
    expect(onResume).toHaveBeenCalledTimes(action === 'close' ? 1 : 0);
    act(() => { jest.advanceTimersByTime(LENS.releaseMs + 100); });
    expect(lens()).toBe(0);
  });
});
