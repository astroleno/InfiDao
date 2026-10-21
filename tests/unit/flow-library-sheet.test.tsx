import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LibrarySheet } from '@/components/flow/LibrarySheet';
import { loadLibrary } from '@/lib/flow-browser/library';
import { readingStorage } from '@/lib/flow-browser/storage';
import { NotesPanel } from '@/components/flow/NotesPanel';
import { readingGraph } from '@/lib/flow-browser/graph';
import type { PersonalNote } from '@/lib/flow-browser/storage';
jest.mock('@/lib/flow-browser/library', () => ({ loadLibrary: jest.fn(), downloadNotes: jest.fn() }));
jest.mock('@/lib/flow-browser/graph', () => ({ readingGraph: { library: jest.fn(async () => ({ entries: [], connections: [] })), status: () => ({ persisted: true }) } }));
const note: PersonalNote = { id: 'n', chainId: 'c', frameId: 'f', text: '原来的理解', createdAt: 1, updatedAt: 1 };

afterEach(() => jest.restoreAllMocks());
test('empty library has one compact dialog and restores trigger focus and background state', async () => {
  jest.mocked(loadLibrary).mockResolvedValue({ paths: [], bookmarks: [], notes: [] });
  const trigger = document.createElement('button'); trigger.textContent = '温故'; document.body.append(trigger); trigger.focus();
  const close = jest.fn();
  const view = render(<LibrarySheet onClose={close} onOpen={async () => true} onChanged={jest.fn()} />);
  await screen.findByText('读过的经文会留在这里。');
  expect(screen.getByRole('dialog', { name: '温故' })).toBeInTheDocument();
  expect(trigger).toHaveAttribute('inert');
  fireEvent.click(screen.getByRole('tab', { name: '收藏' }));
  expect(screen.getByText('停驻阅读时，可以收藏经句。')).toBeInTheDocument();
  const last = screen.getByRole('tabpanel'); act(() => last.focus());
  fireEvent.keyDown(document, { key: 'Tab' }); expect(screen.getByRole('button', { name: '返回阅读' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(close).toHaveBeenCalledTimes(1);
  view.unmount(); expect(trigger).toHaveFocus(); expect(trigger).not.toHaveAttribute('inert'); trigger.remove();
});

test('orphan notes remain editable and preserve draft on failed persistence', async () => {
  jest.mocked(loadLibrary).mockResolvedValue({ paths: [], bookmarks: [], notes: [note] });
  const save = jest.spyOn(readingStorage, 'updateNote').mockResolvedValue({ persisted: false, error: new Error('quota') });
  render(<LibrarySheet onClose={jest.fn()} onOpen={async () => true} onChanged={jest.fn()} />);
  await screen.findByText('读过的经文会留在这里。');
  fireEvent.click(screen.getByRole('tab', { name: '注脚' }));
  expect(screen.queryByRole('button', { name: '回到经句' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  fireEvent.change(screen.getByRole('textbox', { name: '编辑注脚' }), { target: { value: '新的理解' } });
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await screen.findByText('修改仅本次可用，请重试保存或导出。');
  expect(screen.getByRole('textbox', { name: '编辑注脚' })).toHaveValue('新的理解');
  expect(save).toHaveBeenCalledWith('n', '新的理解');
});

test('library tabs use arrow keys and keep a single tab stop while resetting the list position', async () => {
  jest.mocked(loadLibrary).mockResolvedValue({ paths: [], bookmarks: [], notes: [] });
  render(<LibrarySheet onClose={jest.fn()} onOpen={async () => true} onChanged={jest.fn()} />);
  await screen.findByText('读过的经文会留在这里。');
  const panel = screen.getByRole('tabpanel'); panel.scrollTop = 500;
  const first = screen.getByRole('tab', { name: '最近阅读' }); act(() => first.focus());
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: '关联', selected: true })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: '收藏', selected: true })).toHaveFocus();
  expect(panel.scrollTop).toBe(0);
  expect(screen.getAllByRole('tab').filter(tab => tab.tabIndex === 0)).toHaveLength(1);
  expect(panel).toHaveAccessibleName('收藏');
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(screen.getByRole('tab', { name: '注脚', selected: true })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(first).toHaveFocus();
});

test('failed new-note save leaves the typed text available for retry', async () => {
  const save = jest.fn().mockRejectedValue(new Error('注脚仅本次可用，请重试保存或导出。'));
  render(<NotesPanel notes={[]} saving={false} onSave={save} onDelete={jest.fn()} onUndo={jest.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '留下的文字' } });
  fireEvent.click(screen.getByRole('button', { name: '保存注脚' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('仅本次可用'));
  expect(screen.getByRole('textbox')).toHaveValue('留下的文字');
});

test('background reading changes preserve the association being browsed in an open library', async () => {
  jest.mocked(loadLibrary).mockResolvedValue({ paths: [], bookmarks: [], notes: [] });
  jest.spyOn(readingStorage, 'loadPath').mockResolvedValue(null);
  const graph = jest.mocked(readingGraph.library);
  graph.mockClear();
  graph.mockResolvedValue({
    entries: [{ node: { id: 'topic', kind: 'topic', label: '明德慎罚', createdAt: 1 },
      label: '明德慎罚', detail: '', source: '' }],
    connections: [],
  });
  const callbacks = { onClose: jest.fn(), onOpen: async () => true, onChanged: jest.fn() };
  const view = render(<LibrarySheet {...callbacks} context={{ pathId: 'original', frameId: 'first' }} />);
  await screen.findByText('读过的经文会留在这里。');
  fireEvent.click(screen.getByRole('tab', { name: '关联' }));
  fireEvent.click(await screen.findByRole('button', { name: '主题 明德慎罚' }));
  expect(screen.getByRole('heading', { name: '明德慎罚' })).toBeInTheDocument();
  view.rerender(<LibrarySheet {...callbacks} context={{ pathId: 'other', frameId: 'second' }} />);
  await act(async () => {});
  expect(screen.getByRole('heading', { name: '明德慎罚' })).toBeInTheDocument();
  expect(graph).toHaveBeenCalledTimes(1);
});
