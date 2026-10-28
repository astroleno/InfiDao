import { preserveMotionCandidate } from './motion-candidate';
import { PUBLIC_READER_PATH } from './public-route';
import { enableFlowOverlayHistory, navigateFromFlowOverlay, withoutFlowOverlay } from './overlay-history';

const STATE_KEY = 'flowPathId';

function readerUrl(pathId?: string) {
  const url = new URL(window.location.href);
  url.pathname = PUBLIC_READER_PATH;
  url.searchParams.delete('reading');
  if (pathId) url.searchParams.set('reading', pathId);
  preserveMotionCandidate(url, window.location.search);
  return url.pathname + url.search + url.hash;
}

function currentPathId() {
  const state = history.state as Record<string, unknown> | null;
  if (typeof state?.[STATE_KEY] === 'string') return state[STATE_KEY] as string;
  return new URL(window.location.href).searchParams.get('reading');
}

export function createFlowHistory(onNavigate: (pathId: string | null) => void) {
  const initialPath = currentPathId();
  if (initialPath && typeof history.state?.[STATE_KEY] !== 'string') {
    history.replaceState({ ...(history.state || {}), [STATE_KEY]: initialPath, flowTrail: [initialPath] }, '', window.location.href);
  }
  const stopOverlays = enableFlowOverlayHistory();
  const onPopState = (event: PopStateEvent) => {
    const state = event.state as Record<string, unknown> | null;
    const id = typeof state?.[STATE_KEY] === 'string' ? state[STATE_KEY] as string : currentPathId();
    // Reading entries stay within this mounted route. Letting Next restore its
    // older router tree as well can overwrite the path/trail after our restore.
    if (typeof state?.[STATE_KEY] === 'string' && /^\/(?:InfiDao|infidao)\/?$/.test(window.location.pathname)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
    onNavigate(id);
  };
  window.addEventListener('popstate', onPopState, true);

  return {
    current: currentPathId,
    initialize(pathId: string) {
      navigateFromFlowOverlay(overlay => history.replaceState({ ...(overlay ? history.state : withoutFlowOverlay(history.state || {})), [STATE_KEY]: pathId, flowTrail: [pathId] }, '', readerUrl()));
    },
    push(pathId: string) {
      navigateFromFlowOverlay(replace => {
        const trail = Array.isArray(history.state?.flowTrail) ? history.state.flowTrail : [currentPathId()].filter(Boolean);
        const next = { ...withoutFlowOverlay(history.state || {}), [STATE_KEY]: pathId, flowTrail: [...trail, pathId] };
        if (replace) history.replaceState(next, '', readerUrl(pathId));
        else history.pushState(next, '', readerUrl(pathId));
      });
    },
    returnTo(pathId: string) {
      navigateFromFlowOverlay(overlay => {
        const trail: string[] = Array.isArray(history.state?.flowTrail) ? history.state.flowTrail : [];
        const index = trail.slice(0, -1).lastIndexOf(pathId);
        if (index >= 0) {
          history.go(index - (trail.length - 1) - (overlay ? 1 : 0));
          return true;
        }
        else {
          history.replaceState({ ...withoutFlowOverlay(history.state || {}), [STATE_KEY]: pathId, flowTrail: [pathId] }, '', readerUrl(pathId));
          onNavigate(pathId);
        }
        return false;
      });
    },
    dispose() { window.removeEventListener('popstate', onPopState, true); stopOverlays(); },
  };
}
