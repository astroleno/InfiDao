import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { ReadingKeepsakeSheet } from '@/components/flow/ReadingKeepsakeSheet';
import { handwritingCapabilities, submitKeepsake } from '@/lib/handwriting/client';
import { readKeepsakeCache, saveKeepsakeCache, clearKeepsakeCache, listKeepsakeCache, flushInvalidatedKeepsakes } from '@/lib/handwriting/cache';

jest.mock('@/lib/handwriting/client', () => ({ handwritingCapabilities: jest.fn(), submitKeepsake: jest.fn(), cancelKeepsake: jest.fn(), getKeepsake: jest.fn() }));
jest.mock('@/lib/handwriting/cache', () => ({ cacheKey: (_scope: string, draft: { draftId: string }) => draft.draftId,
  readKeepsakeCache: jest.fn(async () => null), saveKeepsakeCache: jest.fn(async () => {}), clearKeepsakeCache: jest.fn(async () => {}),
  listKeepsakeCache: jest.fn(async () => []), flushInvalidatedKeepsakes: jest.fn(async () => {}) }));
const source = { sourceRef: { pathId: 'local-path', frameId: 'frame-a', noteId: 'note-a', noteRevision: 'revision-a' },
  quote: '知止而后有定，定而后能静', sourceLabel: '大学', chapterLabel: '经一章', noteText: '只选择这一条注脚。' };

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
  jest.mocked(handwritingCapabilities).mockResolvedValue({ ownerScope: 'owner-a', configured: true,
    styles: [{ id: '12', label: 'No.012', favorite: false, default: false }] });
  jest.mocked(readKeepsakeCache).mockResolvedValue(null);
  jest.mocked(listKeepsakeCache).mockResolvedValue([]);
  jest.mocked(flushInvalidatedKeepsakes).mockResolvedValue(undefined);
  jest.mocked(saveKeepsakeCache).mockResolvedValue(undefined);
  jest.mocked(clearKeepsakeCache).mockResolvedValue(undefined);
});
test('exact preview stays local until the user confirms and starts', async () => {
  render(<ReadingKeepsakeSheet source={source} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: '手写字迹' })).toHaveValue('12'));
  expect(submitKeepsake).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '开始制作' })).toBeDisabled();
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox', { name: '所选注脚' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '日期' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '来源与章节' }));
  });
  const preview = screen.getByRole('heading', { name: '本次发送的准确文字' }).parentElement!.querySelector('pre');
  expect(preview?.textContent).toBe(source.quote);
  expect(submitKeepsake).not.toHaveBeenCalled();
});
test('selected edited note is sent exactly, with no source IDs or other notes', async () => {
  jest.mocked(submitKeepsake).mockImplementation(async input => ({ id: 'job-a', requestId: input.requestId, contentDigest: input.contentDigest,
    status: 'queued', createdAt: Date.now(), expiresAt: Date.now() + 86400000, pages: [], pagesDone: 0 }));
  render(<ReadingKeepsakeSheet source={source} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: '手写字迹' })).toHaveValue('12'));
  await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: '所选注脚' }), { target: { value: '仅修改导出草稿。\n第二行。' } }); });
  await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: '我确认将上方所选文字发送给 Inko 制作手写纪念卡。' })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '开始制作' })); });
  await waitFor(() => expect(submitKeepsake).toHaveBeenCalledTimes(1));
  const input = jest.mocked(submitKeepsake).mock.calls[0]![0];
  expect(input.content.text).toContain('仅修改导出草稿。\n第二行。');
  expect(JSON.stringify(input)).not.toMatch(/local-path|note-a|revision-a/);
  expect(source.noteText).toBe('只选择这一条注脚。');
  expect(saveKeepsakeCache).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ requestId: input.requestId }) }));
});
test('unconfigured service keeps the local draft and does not allow generation', async () => {
  jest.mocked(handwritingCapabilities).mockResolvedValue({ ownerScope: 'owner-a', configured: false, reason: '手写制作尚未配置。', styles: [] });
  render(<ReadingKeepsakeSheet source={source} onClose={jest.fn()} />);
  await screen.findByText('手写制作尚未配置。');
  expect(screen.getByRole('textbox', { name: '所选注脚' })).toHaveValue(source.noteText);
  expect(screen.getByRole('button', { name: '开始制作' })).toBeDisabled();
  expect(submitKeepsake).not.toHaveBeenCalled();
});
test('clear removes local export records and exposes the download ownership boundary', async () => {
  render(<ReadingKeepsakeSheet source={source} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: '手写字迹' })).toHaveValue('12'));
  fireEvent.click(screen.getByRole('button', { name: '清理手写草稿与导出记录' }));
  await waitFor(() => expect(clearKeepsakeCache).toHaveBeenCalledWith('owner-a'));
  await screen.findByText('导出记录已清理；已下载的文件请自行保管。');
});
