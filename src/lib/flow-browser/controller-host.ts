import { createCuratedFlowProvider, createRemoteFlowProvider, type BrowserFlowBatch } from './provider';
import { createFlowHistory } from './history';
import { prepareFlowFonts } from './fonts';
import { createPathId, readingStorage, type FlowPathRecord, type ReadingSnapshot } from './storage';

export type FlowSelection = { frameId: string; anchorId?: string; selection?: { start: number; end: number; textHash: string; corpusVersion: string }; label?: string };
export type ControllerState = { record: FlowPathRecord | null; busy: boolean; pending: boolean; error: { code: string; message: string } | null; storageWarning: boolean; version: number };
export type FlowController = {
  getState: () => ControllerState;
  start: (pathId?: string | null) => Promise<unknown>;
  open: (seed: string) => Promise<unknown>;
  branch: (selection: FlowSelection) => Promise<unknown>;
  next: () => Promise<unknown>;
  retry: () => Promise<unknown>;
  restart: (selection?: FlowSelection) => Promise<unknown>;
  restore: (pathId: string, options?: { navigation: string }) => Promise<unknown>;
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
  initialSnapshot: () => ReadingSnapshot;
  present: (record: FlowPathRecord) => void;
  update: (record: FlowPathRecord) => void;
  state: (state: ControllerState) => void;
};
const { createFlowController } = require('../../../shared/flow/controller') as { createFlowController: (host: any) => FlowController };

export function createBrowserController(host: Host) {
  const curated = createCuratedFlowProvider();
  const remote = createRemoteFlowProvider();
  const history = createFlowHistory(id => { if (id) void controller.restore(id); });
  const controller = createFlowController({
    ...host, defaultProvider: remote, fallbackProvider: curated,
    providerFor: (chain: BrowserFlowBatch) => chain?.kind === 'curated' ? curated : remote,
    createId: createPathId,
    storage: { put: readingStorage.savePath, get: readingStorage.loadPath, commitBranch: readingStorage.commitBranch,
      child: readingStorage.child, latest: readingStorage.latest, activate: readingStorage.activate },
    async prepare(chain: BrowserFlowBatch) {
      try { await prepareFlowFonts(chain.frames); } catch { /* WheelCanvas opens the full static reader and reports the font failure. */ }
      return chain;
    },
    history(id: string, navigation: string) {
      if (navigation === 'push') history.push(id);
      else if (navigation === 'replace') history.initialize(id);
    },
  });
  const dispose = controller.dispose;
  return { ...controller, start: () => controller.start(history.current()),
    returnToParent() { const id = controller.getState().record?.parentPathId; if (id) history.returnTo(id); },
    dispose() { history.dispose(); dispose(); } };
}
