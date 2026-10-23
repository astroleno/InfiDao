'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './flow.module.css';

export function FlowMenu({ onThought, onLibrary, libraryDisabled, motionCandidate, onOpen }: {
  onThought: () => void; onLibrary: () => void; libraryDisabled: boolean;
  motionCandidate?: { enabled: boolean; onToggle: () => void } | undefined;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; open: boolean } | null>(null);
  const suppressClick = useRef(false);
  const returnFocus = useRef(false);
  const opened = useRef(onOpen);
  opened.current = onOpen;
  const id = useId();

  useEffect(() => {
    if (!open) {
      if (returnFocus.current) { returnFocus.current = false; trigger.current?.focus({ preventScroll: true }); }
      return;
    }
    opened.current?.();
    const siblings = Array.from(root.current?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root.current)
      .map(element => ({ element, inert: element.inert }));
    siblings.forEach(({ element }) => { element.inert = true; });
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    return () => { siblings.forEach(({ element, inert }) => { element.inert = inert; }); };
  }, [open]);

  function close() {
    returnFocus.current = true;
    setOpen(false);
  }
  function act(action: () => void) { close(); action(); }

  return <div ref={root} className={styles.readingMenu} data-open={open}
    onClickCapture={event => {
      if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      suppressClick.current = false;
      gesture.current = { x: event.clientX, y: event.clientY, open };
      (event.target as Element).setPointerCapture?.(event.pointerId);
    }}
    onPointerCancel={() => { gesture.current = null; }}
    onPointerUp={event => {
      const start = gesture.current;
      gesture.current = null;
      if (!start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      suppressClick.current = true;
      if (start.open && dx > 0) close();
      else if (!start.open && dx < 0) setOpen(true);
    }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab' && open) {
        const items = [...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if ((event.shiftKey && current <= 0) || (!event.shiftKey && current === items.length - 1)) {
          event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]?.focus();
        }
      }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const items = [...root.current!.querySelectorAll<HTMLButtonElement>('[data-flow-menu] button:not(:disabled)')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
          (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
    <button ref={trigger} className={styles.readingMenuTrigger} type="button"
      aria-label="更多阅读选项" title="阅读选项 · 向左拖动或点击" aria-expanded={open} aria-controls={id} aria-haspopup="dialog"
      tabIndex={open ? -1 : 0}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
      <span aria-hidden="true" />
    </button>
    {open && <div className={styles.readingMenuScrim} aria-hidden="true" onClick={close} />}
    <div ref={panel} id={id} className={styles.readingMenuPanel} role="dialog" aria-modal={open ? true : undefined} aria-label="阅读选项" data-flow-menu hidden={!open}>
      <div className={styles.readingMenuHeading}><h2>阅读选项</h2><button type="button" className={styles.readingMenuClose} aria-label="关闭阅读选项" onClick={close}>×</button></div>
      <button className={styles.textButton} type="button" onClick={() => act(onThought)}>添一念</button>
      <button className={styles.textButton} type="button" disabled={libraryDisabled} onClick={() => act(onLibrary)}>温故</button>
      {motionCandidate && <button className={styles.textButton} type="button" aria-pressed={motionCandidate.enabled}
        onClick={() => act(motionCandidate.onToggle)}>水膜动效{motionCandidate.enabled ? ' · 已开启' : ' · 已关闭'}</button>}
    </div>
  </div>;
}
