import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotesPanel } from '@/components/flow/NotesPanel';
import { EditableNote } from '@/components/flow/EditableNote';
import { readingStorage, type PersonalNote } from '@/lib/flow-browser/storage';

const drafts = new Map<string, string>();
const props = { notes: [], saving: false, onSave: jest.fn(), onDelete: jest.fn(), onUndo: jest.fn(), draftKey: 'quote-a' };
beforeEach(() => {
  drafts.clear();
  jest.spyOn(readingStorage, 'loadNoteDraft').mockImplementation(async key => drafts.get(key) ?? null);
  jest.spyOn(readingStorage, 'saveNoteDraft').mockImplementation(async (key, value) => { drafts.set(key, value); return { persisted: true }; });
  jest.spyOn(readingStorage, 'clearNoteDraft').mockImplementation(async (key, expected) => { if (drafts.get(key) === expected) drafts.delete(key); return { persisted: true }; });
});
afterEach(() => jest.restoreAllMocks());

test('draft survives closing reading and stays separate from another quotation', async () => {
  let view = render(<NotesPanel {...props} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '尚未保存的理解' } });
  expect(drafts.get('quote-a')).toBe('尚未保存的理解');
  view.unmount();
  view = render(<NotesPanel {...props} draftKey="quote-b" />);
  expect(screen.getByRole('textbox')).toHaveValue(''); view.unmount();
  await act(async () => { render(<NotesPanel {...props} />); });
  expect(screen.getByRole('textbox')).toHaveValue('尚未保存的理解');
});

test('a slow restore cannot replace text already being typed', async () => {
  let resolve!: (value: string) => void;
  jest.mocked(readingStorage.loadNoteDraft).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<NotesPanel {...props} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '刚刚输入' } });
  await act(async () => resolve('过时的草稿'));
  expect(screen.getByRole('textbox')).toHaveValue('刚刚输入');
});

test('text added while saving remains both in the editor and in its draft', async () => {
  let finish!: () => void;
  const save = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<NotesPanel {...props} onSave={save} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '先保存这一句' } });
  fireEvent.click(screen.getByRole('button', { name: '保存注脚' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '又有了新的理解' } });
  await act(async () => finish());
  expect(screen.getByRole('textbox')).toHaveValue('又有了新的理解');
  expect(drafts.get('quote-a')).toBe('又有了新的理解');
  expect(save).toHaveBeenCalledWith('先保存这一句');
});

test('success clears the saved draft and failed autosave is reported honestly', async () => {
  jest.mocked(readingStorage.saveNoteDraft).mockResolvedValueOnce({ persisted: false, error: new Error('quota') });
  render(<NotesPanel {...props} onSave={async () => {}} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '不能丢的文字' } });
  await screen.findByText('草稿暂未存到本机，请勿关闭页面。');
  expect(screen.getByRole('textbox')).toHaveValue('不能丢的文字');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '现在可以保存' } });
  fireEvent.click(screen.getByRole('button', { name: '保存注脚' }));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  expect(drafts.has('quote-a')).toBe(false);
});

test('editing survives a tab switch while explicit cancel discards the edit draft', async () => {
  const note = { id: 'n', text: '已保存的注脚' } as PersonalNote;
  let view = render(<EditableNote note={note} onUpdate={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '编辑到一半' } });
  view.unmount(); view = render(<EditableNote note={note} onUpdate={jest.fn()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑' })); });
  expect(screen.getByRole('textbox')).toHaveValue('编辑到一半');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '取消' })); });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '编辑' })); });
  expect(screen.getByRole('textbox')).toHaveValue('已保存的注脚');
  expect(drafts.has('edit:n')).toBe(false);
});
