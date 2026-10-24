import { useEffect, useRef } from 'react';

export function useFlowDialog(onClose: () => void, open = true, initialFocus?: string, returnFocus?: HTMLElement | null) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const previous = returnFocus ?? document.activeElement as HTMLElement | null;
    const isolated: Array<{ element: HTMLElement; inert: boolean; hidden: string | null }> = [];
    let branch = dialog?.parentElement;
    while (branch?.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
        isolated.push({ element: sibling, inert: sibling.hasAttribute('inert'), hidden: sibling.getAttribute('aria-hidden') });
        sibling.setAttribute('inert', ''); sibling.setAttribute('aria-hidden', 'true');
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]') || []).filter(element => element.tabIndex >= 0);
    const first = (initialFocus ? dialog?.querySelector<HTMLElement>(initialFocus) : null) || focusable()[0];
    first?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const focus = (event: FocusEvent) => { if (!dialog?.contains(event.target as Node)) focusable()[0]?.focus(); };
    document.addEventListener('keydown', keydown); document.addEventListener('focusin', focus);
    return () => {
      document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', focus);
      for (const { element, inert, hidden } of isolated) {
        if (!inert) element.removeAttribute('inert');
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      }
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, initialFocus, returnFocus]);
  return ref;
}
