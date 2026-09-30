// Keep DOM controls inside the visible viewport when a mobile keyboard opens.
// The canvas keeps its layout size, so opening a text field does not reset it.
export function observeFlowViewport(root: HTMLElement, host: Window = window) {
  const viewport = host.visualViewport;
  const sync = () => {
    // Preserve browser pinch zoom and panning instead of chasing the zoomed area.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const rect = root.getBoundingClientRect();
    const top = Math.max(rect.top, viewport?.offsetTop || 0);
    const bottom = Math.min(rect.bottom, (viewport?.offsetTop || 0) + (viewport?.height || host.innerHeight));
    root.style.setProperty('--flow-visible-top', `${Math.max(0, top - rect.top)}px`);
    root.style.setProperty('--flow-visible-height', `${Math.max(0, bottom - top)}px`);
    root.style.setProperty('--flow-visible-bottom', `${Math.max(0, rect.bottom - bottom)}px`);
  };
  sync();
  host.addEventListener('resize', sync);
  viewport?.addEventListener('resize', sync);
  viewport?.addEventListener('scroll', sync);
  return () => {
    host.removeEventListener('resize', sync);
    viewport?.removeEventListener('resize', sync);
    viewport?.removeEventListener('scroll', sync);
  };
}
