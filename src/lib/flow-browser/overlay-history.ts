/** Transient tools share one history entry, independently of the reading trail. */
const OVERLAY = 'flowOverlay';
type State = Record<string, unknown>;
type Layer = { close: () => void };
type Navigation = (replaceOverlay: boolean) => boolean | void;

let users = 0;
let layers: Layer[] = [];
let serial = 0;
let revision = 0;
let observed: State = {};
let returningFrom: State | null = null;
let traversing = false;
let removeListener: (() => void) | undefined;
const deferred: Navigation[] = [];

const state = (): State => window.history.state || {};
const marker = (value: State) => typeof value[OVERLAY] === 'string' ? value[OVERLAY] as string : null;
const sameReading = (a: State, b: State) => a.flowPathId === b.flowPathId;

export function withoutFlowOverlay(value: State): State {
  const next = { ...value };
  delete next[OVERLAY];
  return next;
}

function ensureEntry() {
  if (!layers.length || returningFrom || traversing) return;
  if (!marker(state())) {
    const id = `tool-${Date.now()}-${++serial}`;
    window.history.pushState({ ...state(), [OVERLAY]: id }, '', window.location.href);
  }
  observed = state();
}

function closeLayers() {
  const closing = layers;
  layers = [];
  revision++;
  // A newly mounted destination may register before the old layer cleans up.
  for (const layer of closing.slice().reverse()) layer.close();
}

function consume(event: PopStateEvent) {
  event.stopImmediatePropagation();
  event.preventDefault();
}

/** Enabled for the lifetime of the browser controller, never across routes. */
export function enableFlowOverlayHistory() {
  users++;
  if (users === 1) {
    observed = state();
    const pop = (event: PopStateEvent) => {
      traversing = false;
      const next: State = event.state || {};
      const previous = observed;
      const leavingTool = marker(previous);
      const nextTool = marker(next);
      // A reader can finish its first load while an early tool is open. Its
      // base entry predates the path ID; attach that ID when dismissing it.
      if (leavingTool && !next.flowPathId && previous.flowPathId && Array.isArray(previous.flowTrail) && previous.flowTrail.length === 1 &&
        /^\/(?:InfiDao|infidao)\/?$/.test(window.location.pathname)) {
        next.flowPathId = previous.flowPathId;
        next.flowTrail = previous.flowTrail;
        window.history.replaceState(next, '', window.location.href);
      }
      observed = next;

      if (returningFrom) {
        const from = returningFrom;
        returningFrom = null;
        // Only the same-reader pop belongs to an explicit tool dismissal.
        if (sameReading(from, next)) {
          consume(event);
          const work = deferred.splice(0);
          for (const navigate of work) runNavigation(navigate, false);
          ensureEntry();
          return;
        }
        deferred.length = 0;
      }

      if (layers.length && leavingTool && sameReading(previous, next) && !nextTool) {
        consume(event);
        closeLayers();
        return;
      }

      // Forward must not resurrect a dismissed task. Its retired entry is
      // still owned by us; immediately return to its same-reader base entry.
      if (!layers.length && nextTool) {
        consume(event);
        returningFrom = previous;
        window.history.back();
        return;
      }

      if (!sameReading(previous, next)) {
        closeLayers();
      }
    };
    window.addEventListener('popstate', pop, true);
    removeListener = () => window.removeEventListener('popstate', pop, true);
    if (marker(observed)) {
      // Refresh restores the reading, never an unmounted transient task.
      returningFrom = observed;
      window.history.back();
    }
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (--users > 0) return;
    users = 0;
    revision++;
    layers = [];
    deferred.length = 0;
    returningFrom = null;
    traversing = false;
    removeListener?.();
    removeListener = undefined;
    // An unmount cannot safely move the browser's location. Remove only our
    // metadata; never overwrite Next's state or navigate during teardown.
    if (marker(state())) window.history.replaceState(withoutFlowOverlay(state()), '', window.location.href);
  };
}

export function registerFlowOverlay(close: () => void) {
  if (!users) return () => {};
  const layer: Layer = { close };
  layers.push(layer);
  revision++;
  ensureEntry();
  return () => {
    layers = layers.filter(item => item !== layer);
    const token = ++revision;
    // Menu → task replaces the same transient entry within one React commit.
    queueMicrotask(() => {
      if (!users || token !== revision || layers.length || returningFrom || traversing) return;
      const id = marker(state());
      if (!id) return;
      observed = state();
      returningFrom = observed;
      window.history.back();
    });
  };
}

/** Real reading navigation consumes the tool entry, so no empty Back remains. */
export function navigateFromFlowOverlay(navigate: Navigation) {
  if (users && returningFrom) { deferred.push(navigate); return; }
  const id = marker(state());
  runNavigation(navigate, !!id);
}

function runNavigation(navigate: Navigation, overlay: boolean) {
  // A real history traversal already includes the transient entry. Its
  // asynchronous pop must finish before layer cleanup can dismiss anything.
  traversing = navigate(overlay) === true;
  observed = state();
}
