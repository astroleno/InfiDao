import { createBrowserController } from '@/lib/flow-browser/controller-host';
import { readingStorage, type FlowPathRecord, type ReadingSnapshot } from '@/lib/flow-browser/storage';
import { prepareFlowFonts, type FontProgress } from '@/lib/flow-browser/fonts';
jest.mock('@/lib/flow-browser/fonts', () => ({ prepareFlowFonts: jest.fn(async () => ({})) }));
jest.mock('@/lib/flow-browser/provider', () => ({ createCuratedFlowProvider: () => ({ restore: jest.fn() }), createRemoteFlowProvider: () => ({ restore: jest.fn() }) }));

const snapshot: ReadingSnapshot = { version: 1, position: 235.52, rowOffset: 0, ambientPhase: 0, paused: true, sourceOpen: false, readingPositions: {}, ribbon: null, activeFrameId: 'frame' };
const record = (pathId: string): FlowPathRecord => ({ pathId, chain: { kind: 'curated', frames: [{ id: 'frame', ready: true }] }, snapshot, createdAt: 1, updatedAt: 1, parentPathId: null, sourceLabel: '初读' });
function fixture() {
  const host = { capture: () => snapshot, initialSnapshot: () => snapshot, present: jest.fn(), update: jest.fn(), state: jest.fn(), preparation: jest.fn() };
  jest.spyOn(readingStorage, 'activate').mockResolvedValue({ persisted: true });
  jest.spyOn(readingStorage, 'savePath').mockResolvedValue({ persisted: true });
  return { host, controller: createBrowserController(host) };
}
afterEach(() => jest.restoreAllMocks());

test('opening a saved path preserves its snapshot and pushes browser navigation', async () => {
  jest.spyOn(readingStorage, 'loadPath').mockResolvedValue(record('saved'));
  const f = fixture();
  expect(await f.controller.openSaved({ pathId: 'saved', frameId: 'frame' })).toBe(true);
  expect(f.host.present).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'saved', snapshot }), expect.anything());
  expect(location.search).toBe('?reading=saved');
  expect(prepareFlowFonts).toHaveBeenCalled(); f.controller.dispose();
});

test('closing the library invalidates an outstanding disk read', async () => {
  let finish!: (value: FlowPathRecord) => void;
  jest.spyOn(readingStorage, 'loadPath').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const f = fixture(), opening = f.controller.openSaved({ pathId: 'late' });
  await Promise.resolve(); await Promise.resolve();
  f.controller.cancel(); finish(record('late'));
  expect(await opening).toBe(false); expect(f.host.present).not.toHaveBeenCalled(); f.controller.dispose();
});

test('missing targets retain current content and never fall back to an unrelated quote', async () => {
  jest.spyOn(readingStorage, 'loadPath').mockResolvedValue(record('saved'));
  const f = fixture();
  await expect(f.controller.openSaved({ pathId: 'saved', frameId: 'missing-frame' })).rejects.toThrow('原阅读记录已不可用');
  expect(f.host.present).not.toHaveBeenCalled(); f.controller.dispose();
});

test('an abandoned font preparation cannot update the current loading scene', async () => {
  jest.spyOn(readingStorage, 'loadPath').mockResolvedValue(record('saved'));
  let progress!: (value: FontProgress) => void;
  let ready!: (value: Awaited<ReturnType<typeof prepareFlowFonts>>) => void;
  let started!: () => void;
  const preparing = new Promise<void>(resolve => { started = resolve; });
  jest.mocked(prepareFlowFonts).mockImplementationOnce((_, __, observer) => {
    progress = observer!; started();
    return new Promise(resolve => { ready = resolve; });
  });
  const f = fixture(), opening = f.controller.openSaved({ pathId: 'saved' });
  await preparing;
  progress({ phase: 'fonts', loaded: 0, total: 2 });
  expect(f.host.preparation).toHaveBeenCalledTimes(1);
  f.controller.cancel();
  progress({ phase: 'ready', loaded: 2, total: 2 });
  ready({ version: 'v1', family: 'test', families: [], characters: '' });
  expect(await opening).toBe(false);
  expect(f.host.preparation).toHaveBeenCalledTimes(1); f.controller.dispose();
});

test('saved text becomes readable before delayed fonts and late progress cannot overwrite another operation', async () => {
  jest.spyOn(readingStorage, 'loadPath').mockResolvedValue(record('saved'));
  let progress!: (value: FontProgress) => void;
  let ready!: (value: Awaited<ReturnType<typeof prepareFlowFonts>>) => void;
  jest.mocked(prepareFlowFonts).mockImplementationOnce((_, __, observer) => {
    progress = observer!;
    return new Promise(resolve => { ready = resolve; });
  });
  const f = fixture();
  expect(await f.controller.openSaved({ pathId: 'saved' })).toBe(true);
  expect(f.host.present).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'saved' }), expect.anything());
  f.controller.cancel();
  progress({ phase: 'ready', loaded: 1, total: 1 });
  ready({ version: 'v1', family: 'test', families: [], characters: '' });
  expect(f.host.preparation).not.toHaveBeenCalled();
  f.controller.dispose();
});
