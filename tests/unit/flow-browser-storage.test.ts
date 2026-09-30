/** @jest-environment node */
import { createReadingStorage, type FlowPathRecord, type PersonalNote, type ReadingPersistence } from '@/lib/flow-browser/storage';
const record = (id: string, position = 1): FlowPathRecord => ({ pathId: id, chain: { frames: [{ ready: true }] },
  snapshot: { position, rowOffset: 0, ambientPhase: 0, paused: true, sourceOpen: false, readingPositions: {}, ribbon: null, version: 1 },
  parentPathId: null, sourceLabel: '最初的经文', createdAt: 1, updatedAt: 1 });
const note: PersonalNote = { id: 'n', chainId: 'c', frameId: 'f', text: '我的注脚', createdAt: 1, updatedAt: 1 };
function fixture() {
  const disk = { paths: new Map<string, any>(), notes: new Map<string, any>(), meta: new Map<string, any>() };
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
