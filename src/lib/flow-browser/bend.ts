export type BendSettings = {
  // rounding is the smooth entry length; the remaining edge keeps curving.
  width: number; height: number; zone: number; rounding: number; angle: number; perspective: number;
  // Mobile lateral expansion shares the same surface depth and inverse map.
  flare?: number;
  // Local capillary deformation, shared by the optical pass and its inverse.
  adhesion?: number;
  // Material coordinates make the irregular tension stable during scrubbing.
  adhesionScroll?: number;
  // A shared height field supplies local refraction, reflection and caustics.
  liquid?: boolean;
  caustics?: number;
  // Sparse content-stable contacts across the whole upper/lower fold.
  contacts?: boolean;
  // A third noise dimension advances while scrolling, including in reverse.
  perlin?: boolean;
  noisePhase?: number;
};

export const { bendSettings, bendSourcePoint, bendDisplayPoint } = require('../../../miniprogram/flow/stream-bend') as {
  bendSettings: (width: number, height: number) => BendSettings;
  bendSourcePoint: (x: number, y: number, settings: BendSettings) => { x: number; y: number; alpha: number };
  bendDisplayPoint: (x: number, y: number, settings: BendSettings) => { x: number; y: number };
};

/** Keep native keyboard/controls; reproject only pointer activation of the text. */
export function bindBendInteraction(panel: HTMLElement,
  resolve: (x: number, y: number) => HTMLElement | null | undefined, invalidate: () => void) {
  let forwarding = false, hover: HTMLElement | null = null;
  const nativeControl = (target: EventTarget | null) => target instanceof Element &&
    target.closest('button, input, textarea, select, a, [contenteditable]') &&
    !target.closest('[data-flow-optic]:not([data-flow-optic="quiet"])');
  const setHover = (target: HTMLElement | null | undefined) => {
    if (hover !== (target || null)) {
      hover?.removeAttribute('data-bend-hover');
      hover = target || null;
      hover?.setAttribute('data-bend-hover', 'true');
      invalidate();
    }
    panel.style.cursor = target === undefined ? '' : target ? 'pointer' : 'default';
  };
  const move = (event: PointerEvent) => {
    setHover(event.pointerType === 'touch' || nativeControl(event.target) ? undefined : resolve(event.clientX, event.clientY));
  };
  const leave = () => setHover(undefined);
  const down = (event: MouseEvent) => {
    if (event.button || nativeControl(event.target)) return;
    // Avoid focusing the invisible, unprojected button under the pointer.
    if (resolve(event.clientX, event.clientY) !== undefined) event.preventDefault();
  };
  const click = (event: MouseEvent) => {
    if (forwarding || event.button || event.detail === 0 || nativeControl(event.target)) return;
    const target = resolve(event.clientX, event.clientY);
    if (target === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (!target?.isConnected) return;
    forwarding = true;
    try {
      target.focus({ preventScroll: true });
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window,
        detail: event.detail, clientX: event.clientX, clientY: event.clientY,
        ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey }));
    } finally { forwarding = false; }
  };
  panel.addEventListener('pointermove', move, { passive: true });
  panel.addEventListener('pointerleave', leave);
  panel.addEventListener('mousedown', down, true);
  panel.addEventListener('click', click, true);
  return () => {
    panel.removeEventListener('pointermove', move);
    panel.removeEventListener('pointerleave', leave);
    panel.removeEventListener('mousedown', down, true);
    panel.removeEventListener('click', click, true);
    leave();
  };
}
