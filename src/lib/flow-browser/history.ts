import { preserveMotionCandidate } from './motion-candidate';
import { PUBLIC_READER_PATH } from './public-route';

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
  const onPopState = (event: PopStateEvent) => {
    const state = event.state as Record<string, unknown> | null;
    const id = typeof state?.[STATE_KEY] === 'string' ? state[STATE_KEY] as string : currentPathId();
    onNavigate(id);
  };
  window.addEventListener('popstate', onPopState);

  return {
    current: currentPathId,
    initialize(pathId: string) {
      history.replaceState({ ...(history.state || {}), [STATE_KEY]: pathId, flowTrail: [pathId] }, '', readerUrl());
    },
    push(pathId: string) {
      const trail = Array.isArray(history.state?.flowTrail) ? history.state.flowTrail : [currentPathId()].filter(Boolean);
      history.pushState({ ...(history.state || {}), [STATE_KEY]: pathId, flowTrail: [...trail, pathId] }, '', readerUrl(pathId));
    },
    returnTo(pathId: string) {
      const trail: string[] = Array.isArray(history.state?.flowTrail) ? history.state.flowTrail : [];
      const index = trail.slice(0, -1).lastIndexOf(pathId);
      if (index >= 0) history.go(index - (trail.length - 1));
      else {
        history.replaceState({ ...(history.state || {}), [STATE_KEY]: pathId, flowTrail: [pathId] }, '', readerUrl(pathId));
        onNavigate(pathId);
      }
    },
    dispose() { window.removeEventListener('popstate', onPopState); },
  };
}
