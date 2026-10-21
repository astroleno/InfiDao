import { createCuratedFlowProvider, createRemoteFlowProvider, type BrowserFlowBatch } from './provider';
import { createFlowHistory } from './history';
import { prepareFlowFonts, type FontProgress } from './fonts';
import { createPathId, readingStorage, type FlowPathRecord, type ReadingSnapshot } from './storage';
import { savedSnapshot, type SavedTarget } from './library';
import type { FlowSelection as TextSelection } from '../flow/contracts';
import { withPreparedContinuation } from './prepared-provider';
import { readingGraph } from './graph';

export type FlowSelection = { pathId?: string; frameId: string; anchorId?: string; selection?: TextSelection; label?: string };
export type ControllerState = { record: FlowPathRecord | null; busy: boolean; pending: boolean; error: { code: string; message: string } | null; storageWarning: boolean; version: number };
export type FlowController = {
  getState: () => ControllerState;
  start: (pathId?: string | null) => Promise<unknown>;
  open: (seed: string) => Promise<unknown>;
  think: (seed: string, selection?: FlowSelection) => Promise<unknown>;
  branch: (selection: FlowSelection) => Promise<unknown>;
  next: () => Promise<unknown>;
  prepareNext: () => void;
  cancelPreparation: () => void;
  retry: () => Promise<unknown>;
  restart: (selection?: FlowSelection) => Promise<unknown>;
  restore: (pathId: string, options?: { navigation?: string; record?: FlowPathRecord; resumeIncomplete?: boolean }) => Promise<unknown>;
  openSaved: (target: SavedTarget) => Promise<boolean>;
  returnToParent: () => void;
  curated: (seed?: string) => Promise<unknown>;
  checkpoint: () => Promise<void>;
  cancel: (manual?: boolean) => void;
  dismissError: () => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};
type Host = {
  capture: () => ReadingSnapshot;
  initialSnapshot: (chain: BrowserFlowBatch, context: { parentSnapshot?: ReadingSnapshot }) => ReadingSnapshot;
  present: (record: FlowPathRecord, context: { current: () => boolean; navigation: string }) => void | Promise<void>;
  update: (record: FlowPathRecord) => void;
  background?: (record: FlowPathRecord) => void;
  state: (state: ControllerState) => void;
  preparingFonts?: (preparing: boolean) => void;
  preparation?: (quote: string, progress: FontProgress) => void;
};
const { createFlowController } = require('../../../shared/flow/controller') as { createFlowController: (host: any) => FlowController };

export function createBrowserController(host: Host) {
  const curated = createCuratedFlowProvider();
  const remote = withPreparedContinuation(createRemoteFlowProvider());
  let opening = 0;
  let preparations = 0;
  const history = createFlowHistory(id => { opening++; if (id) void controller.restore(id, { resumeIncomplete: false }); });
  const controller = createFlowController({
    ...host, defaultProvider: remote, fallbackProvider: curated,
    branchDelayMs: 120,
    backgroundLimit: 1,
    providerFor: (chain: BrowserFlowBatch) => chain?.kind === 'curated' ? curated : remote,
    createId: createPathId,
    storage: readingGraph,
    prepare(chain: BrowserFlowBatch) {
      preparations++; host.preparingFonts?.(true);
      const version = controller.getState().version;
      // Verified text is immediately readable with the fallback serif. The
      // same semantic stream picks up the cached optical face when it arrives.
      void prepareFlowFonts(chain.frames.map(frame => ({ quote: frame.quote })), undefined, progress => {
        if (controller.getState().version === version) host.preparation?.(chain.frames[0]?.quote || '', progress);
      }).catch(() => { /* WheelCanvas reports asset failures without hiding text. */ })
        .finally(() => { preparations--; host.preparingFonts?.(preparations > 0); });
      return chain;
    },
    history(id: string, navigation: string) {
      if (navigation === 'push' || navigation === 'saved' || navigation === 'source') history.push(id);
      else if (navigation === 'replace') history.initialize(id);
    },
  });
  const dispose = controller.dispose;
  return { ...controller, async start() {
      const version = controller.getState().version;
      await readingGraph.initialize();
      if (!readingGraph.status().persisted) host.state({ ...controller.getState(), storageWarning: true });
      if (controller.getState().version === version) return controller.start(history.current());
      return undefined;
    },
    cancel(manual?: boolean) { opening++; controller.cancel(manual); },
    async openSaved(target: SavedTarget) {
      const token = ++opening;
      controller.cancel();
      await controller.checkpoint();
      const record = await readingStorage.loadPath(target.pathId);
      if (token !== opening) return false;
      if (!record || (target.frameId && !record.chain.frames.some((frame: { id: string }) => frame.id === target.frameId))) throw new Error('原阅读记录已不可用，当前经文仍在。');
      const version = controller.getState().version;
      await controller.restore(record.pathId, { record: { ...record, snapshot: savedSnapshot(record, target) }, navigation: target.source ? 'source' : 'saved', resumeIncomplete: false });
      return token === opening && controller.getState().record?.pathId === record.pathId && controller.getState().version === version + 1;
    },
    returnToParent() { const id = controller.getState().record?.parentPathId; if (id) history.returnTo(id); },
    dispose() { opening++; history.dispose(); dispose(); } };
}
