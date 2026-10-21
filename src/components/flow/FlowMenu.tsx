'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './flow.module.css';

export function FlowMenu({ onThought, onLibrary, libraryDisabled }: {
  onThought: () => void; onLibrary: () => void; libraryDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[data-flow-menu] button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function act(action: () => void) { close(); action(); }

  return <div ref={root} className={styles.readingMenu}
    onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const items = [...root.current!.querySelectorAll<HTMLButtonElement>('[data-flow-menu] button:not(:disabled)')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
          (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
    <button ref={trigger} className={`${styles.topButton} ${styles.readingMenuTrigger}`} type="button"
      aria-label="更多阅读选项" title="更多阅读选项" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
      </svg>
    </button>
    <div id={id} className={styles.readingMenuPanel} role="group" aria-label="阅读选项" data-flow-menu hidden={!open}>
      <button className={styles.textButton} type="button" onClick={() => act(onThought)}>添一念</button>
      <button className={styles.textButton} type="button" disabled={libraryDisabled} onClick={() => act(onLibrary)}>温故</button>
    </div>
  </div>;
}
