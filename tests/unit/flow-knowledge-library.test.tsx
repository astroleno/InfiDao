import { fireEvent, render, screen } from '@testing-library/react';
import { KnowledgeLibrary } from '@/components/flow/KnowledgeLibrary';
import { readingGraph } from '@/lib/flow-browser/graph';
import type { KnowledgeLibrary as Data } from '@/lib/flow-browser/knowledge';

jest.mock('@/lib/flow-browser/graph', () => ({ readingGraph: { library: jest.fn(), status: () => ({ persisted: true }) } }));
const data: Data = { entries: [
  { node: { id: 'quote', kind: 'passage', quote: '学而时习之', sourceId: 'lunyu', corpusVersion: 'v1', textHash: 'h', quoteStart: 0, quoteEnd: 5, source: '论语', chapterLabel: '学而', createdAt: 1 },
    label: '学而时习之', detail: '', source: '论语 · 学而', original: { pathId: 'original', frameId: 'a', source: true } },
  { node: { id: 'sense', kind: 'sense', label: '习', definition: '温习所学', passageId: 'quote', surface: 'quote', excerpt: '学而时习之', createdAt: 1 },
    label: '习', detail: '温习所学', source: '论语 · 学而', original: { pathId: 'original', frameId: 'a', source: true } },
  { node: { id: 'topic', kind: 'topic', label: '学习', createdAt: 1 }, label: '学习', detail: '', source: '' },
], connections: [
  { id: 'a-sense', from: 'quote', to: 'sense', label: '此处义项', description: '温习所学' },
  { id: 'sense-topic', from: 'sense', to: 'topic', label: '涉及主题', description: '从主动温习理解学习。' },
] };
beforeEach(() => { jest.mocked(readingGraph.library).mockResolvedValue(data); });
afterEach(() => jest.restoreAllMocks());

test('a theme leads to its contextual sense and the correct saved original', async () => {
  const open = jest.fn(async () => {});
  render(<KnowledgeLibrary opening={false} onOpen={open} />);
  await screen.findByText('找到 3 项');
  fireEvent.change(screen.getByRole('searchbox', { name: '查找经句、义项或主题' }), { target: { value: '学习' } });
  fireEvent.click(screen.getByRole('button', { name: '主题 学习' }));
  expect(screen.getByRole('heading', { name: '学习' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '义项 习' }));
  expect(screen.getByRole('heading', { name: '习' })).toHaveFocus();
  expect(screen.getAllByText('温习所学').length).toBeGreaterThan(0);
  expect(screen.getByText('从主动温习理解学习。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '回到原文' }));
  expect(open).toHaveBeenCalledWith({ pathId: 'original', frameId: 'a', source: true });
  fireEvent.click(screen.getByRole('button', { name: '返回上一项' }));
  expect(screen.getByRole('heading', { name: '学习' })).toHaveFocus();
});

test('a missing original remains readable and exposes no broken navigation', async () => {
  const original = data.entries[0]!;
  const orphan = { ...original }; delete orphan.original;
  jest.mocked(readingGraph.library).mockResolvedValueOnce({ entries: [orphan], connections: [] });
  const open = jest.fn(async () => {});
  render(<KnowledgeLibrary opening={false} onOpen={open} />);
  fireEvent.click(await screen.findByRole('button', { name: /学而时习之/u }));
  expect(screen.getByText('原阅读记录不可用，已保存的关联仍可查看。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '回到原文' })).not.toBeInTheDocument(); expect(open).not.toHaveBeenCalled();
});

test('load failure can be retried without discarding the library', async () => {
  jest.mocked(readingGraph.library).mockRejectedValueOnce(new Error('unavailable'));
  render(<KnowledgeLibrary opening={false} onOpen={async () => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: '重试' }));
  await screen.findByText('找到 3 项');
});
