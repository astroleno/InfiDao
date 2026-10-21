/** @jest-environment node */
import { createReadingStorage, type FlowPathRecord, type PersonalNote, type ReadingPersistence, type Bookmark } from '@/lib/flow-browser/storage';
const record = (id: string, position = 1): FlowPathRecord => ({ pathId: id, chain: { frames: [{ ready: true }] },
  snapshot: { position, rowOffset: 0, ambientPhase: 0, paused: true, sourceOpen: false, readingPositions: {}, ribbon: null, version: 1 },
  parentPathId: null, sourceLabel: '最初的经文', createdAt: 1, updatedAt: 1 });
const note: PersonalNote = { id: 'n', chainId: 'c', frameId: 'f', text: '我的注脚', createdAt: 1, updatedAt: 1 };
function fixture() {
  const disk = { paths: new Map<string, any>(), notes: new Map<string, any>(), meta: new Map<string, any>(),
    graphNodes: new Map<string, any>(), graphEdges: new Map<string, any>(), graphVisits: new Map<string, any>() };
  const backend: ReadingPersistence = {
    read: jest.fn(async (store, key) => structuredClone(disk[store].get(key))),
    list: jest.fn(async store => structuredClone([...disk[store].values()])),
    write: jest.fn(async mutations => { for (const item of mutations) {
      if (item.remove) disk[item.store].delete(item.key); else disk[item.store].set(item.key, structuredClone(item.value));
    } }),
  };
  return { disk, backend, storage: createReadingStorage(backend) };
}
test('quota failure keeps old disk parent and the newer in-memory parent and child', async () => {
  const f = fixture(); await f.storage.savePath(record('parent'));
  (f.backend.write as jest.Mock).mockRejectedValueOnce(new Error('QuotaExceededError'));
  const result = await f.storage.commitBranch(record('parent', 99), { ...record('child'), parentPathId: 'parent' });
  expect(result.persisted).toBe(false);
  expect(f.disk.paths.get('parent').snapshot.position).toBe(1);
  expect(f.disk.paths.has('child')).toBe(false);
  expect((await f.storage.loadPath('parent'))?.snapshot.position).toBe(99);
  expect((await f.storage.loadPath('child'))?.parentPathId).toBe('parent');
  expect((f.backend.write as jest.Mock).mock.calls[1][0]).toHaveLength(2);
});
test('a late disk read cannot overwrite a new session save', async () => {
  const f = fixture(); let release!: (value: any) => void;
  (f.backend.read as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const loading = f.storage.loadPath('a'); await f.storage.savePath(record('a', 42)); release(record('a', 1));
  expect((await loading)?.snapshot.position).toBe(42);
});
test('failed note deletion stays deleted in memory and supports undo without stale disk resurrection', async () => {
  const f = fixture(); await f.storage.saveNote(note);
  (f.backend.write as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
  const deleted = await f.storage.deleteNote(note.id);
  expect(deleted).toMatchObject({ persisted: false, deleted: true, previous: note });
  expect(await f.storage.listNotes('c', 'f')).toEqual([]);
  expect(f.disk.notes.has(note.id)).toBe(true);
  await f.storage.restoreNote(deleted.previous!);
  expect(await f.storage.listNotes('c', 'f')).toEqual([note]);
});
test('a failed note update is not replaced by the older disk version', async () => {
  const f = fixture(); await f.storage.saveNote(note);
  (f.backend.write as jest.Mock).mockRejectedValueOnce(new Error('unavailable'));
  await f.storage.saveNote({ ...note, text: '新注脚' });
  expect((await f.storage.listNotes('c', 'f'))[0]?.text).toBe('新注脚');
});
test('latest path and thought draft survive recreation; paths expose exact completed branch identities', async () => {
  const f = fixture(), child = { ...record('b'), parentPathId: 'a', chain: { entry: { fromFrameId: 'f', anchorId: 'w' }, frames: [{ ready: true }] } };
  await f.storage.savePath(child); await f.storage.activate('b'); await f.storage.saveDraft('尚未提交的一念');
  const refreshed = createReadingStorage(f.backend);
  expect(await refreshed.latest()).toBe('b'); expect(await refreshed.loadDraft()).toBe('尚未提交的一念');
  expect((await refreshed.child('a', 'f', 'w'))?.pathId).toBe('b');
  expect(await refreshed.child('a', 'another', 'w')).toBeNull();
});
test('failed writes do not poison later persistence', async () => {
  const f = fixture(); (f.backend.write as jest.Mock).mockRejectedValueOnce(new Error('temporary'));
  expect((await f.storage.saveDraft('first')).persisted).toBe(false);
  expect((await f.storage.saveDraft('second')).persisted).toBe(true);
  expect(f.disk.meta.get('thought-draft')).toBe('second');
});

test('independently reopened server chains replay their exact local entry after a reload', async () => {
  const f = fixture();
  const saved = { ...record('reopened'), parentPathId: 'parent', parentEntry: { fromFrameId: 'frame', anchorId: 'text:1:2', label: '止' },
    chain: { chainId: 'independent', parentChainId: null, entry: null, frames: [{ ready: true }] } };
  await f.storage.savePath(saved);
  const fresh = createReadingStorage(f.backend);
  expect((await fresh.child('parent', 'frame', 'text:1:2'))?.pathId).toBe('reopened');
  expect(await fresh.child('parent', 'frame', 'text:7:8')).toBeNull();
  expect(await fresh.child('other', 'frame', 'text:1:2')).toBeNull();
  expect((await fresh.loadPath('reopened'))?.chain.entry).toBeNull();
});

test('bookmarks share the v2 meta store without leaking other metadata or resurrecting failed deletes', async () => {
  const f = fixture();
  const bookmark: Bookmark = { kind: 'bookmark', key: 'library:bookmark:test', pathId: 'a', chainId: 'c', frameId: 'f', quote: '知止', source: '大学', chapterLabel: '第一章', snapshot: record('a').snapshot, createdAt: 1, updatedAt: 1 };
  await f.storage.saveDraft('一念'); await f.storage.activate('a'); await f.storage.dismissHint();
  await f.storage.saveBookmark(bookmark); await f.storage.saveBookmark(bookmark);
  const fresh = createReadingStorage(f.backend);
  expect(await fresh.listBookmarks()).toEqual([bookmark]);
  expect(await fresh.hintSeen()).toBe(true);
  (f.backend.write as jest.Mock).mockRejectedValueOnce(new Error('quota'));
  expect((await fresh.deleteBookmark(bookmark.key)).persisted).toBe(false);
  expect(await fresh.listBookmarks()).toEqual([]);
  expect(await fresh.getBookmark(bookmark.key)).toBeNull();
  await fresh.saveBookmark(bookmark);
  expect(await fresh.listBookmarks()).toEqual([bookmark]);
});

test('legacy notes remain editable with stable identity and failed updates stay in the session', async () => {
  const f = fixture(); await f.storage.saveNote(note);
  const result = await f.storage.updateNote('n', '  新的理解  ');
  expect(result.persisted).toBe(true);
  expect((await createReadingStorage(f.backend).listAllNotes())[0]).toMatchObject({ id: 'n', chainId: 'c', frameId: 'f', text: '新的理解', createdAt: 1 });
  await expect(f.storage.updateNote('absent', '无法保存')).rejects.toThrow();
  await expect(f.storage.updateNote('n', '  ')).rejects.toThrow();
  (f.backend.write as jest.Mock).mockRejectedValueOnce(new Error('quota'));
  expect((await f.storage.updateNote('n', '本次理解')).persisted).toBe(false);
  expect((await f.storage.listAllNotes())[0]?.text).toBe('本次理解');
});

test('recent paths include all persistent paths even beyond the memory cache', async () => {
  const f = fixture();
  for (let i = 0; i < 25; i++) await f.storage.savePath({ ...record('p' + i), updatedAt: i });
  const paths = await createReadingStorage(f.backend).listPaths();
  expect(paths).toHaveLength(25); expect(paths[0]?.pathId).toBe('p24');
});

test('fresh listings observe note deletion in another tab', async () => {
  const f = fixture(); await f.storage.saveNote(note);
  expect(await f.storage.listAllNotes()).toHaveLength(1);
  await createReadingStorage(f.backend).deleteNote(note.id);
  expect(await f.storage.listAllNotes()).toEqual([]);
});

test('note drafts restore independently and never appear as saved bookmarks or notes', async () => {
  const f = fixture();
  await f.storage.saveNoteDraft('["chain-a","frame"]', '第一条草稿');
  await f.storage.saveNoteDraft('["chain-b","frame"]', '第二条草稿');
  await f.storage.saveNoteDraft('edit:n', '编辑中的草稿');
  const fresh = createReadingStorage(f.backend);
  expect(await fresh.loadNoteDraft('["chain-a","frame"]')).toBe('第一条草稿');
  expect(await fresh.loadNoteDraft('["chain-b","frame"]')).toBe('第二条草稿');
  expect(await fresh.loadNoteDraft('edit:n')).toBe('编辑中的草稿');
  expect(await fresh.listBookmarks()).toEqual([]);
  expect(await fresh.listAllNotes()).toEqual([]);
});

test('finishing an older save only clears its own draft', async () => {
  const f = fixture(); await f.storage.saveNoteDraft('draft', '保存中的文字');
  await f.storage.saveNoteDraft('draft', '后来输入的文字');
  await f.storage.clearNoteDraft('draft', '保存中的文字');
  expect(await f.storage.loadNoteDraft('draft')).toBe('后来输入的文字');
  await f.storage.clearNoteDraft('draft', '后来输入的文字');
  expect(await createReadingStorage(f.backend).loadNoteDraft('draft')).toBeNull();
});

test('failed draft persistence keeps the session copy and reports the failure', async () => {
  const f = fixture(); (f.backend.write as jest.Mock).mockRejectedValueOnce(new Error('quota'));
  expect((await f.storage.saveNoteDraft('draft', '仍在输入')).persisted).toBe(false);
  expect(await f.storage.loadNoteDraft('draft')).toBe('仍在输入');
});

test('a draft changed during a clearing read is kept', async () => {
  const f = fixture(); await f.storage.saveNoteDraft('draft', '保存中的文字');
  let finish!: (value: string) => void;
  (f.backend.read as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const clearing = f.storage.clearNoteDraft('draft', '保存中的文字');
  await f.storage.saveNoteDraft('draft', '后来输入的文字');
  finish('保存中的文字'); await clearing;
  expect(await createReadingStorage(f.backend).loadNoteDraft('draft')).toBe('后来输入的文字');
});
