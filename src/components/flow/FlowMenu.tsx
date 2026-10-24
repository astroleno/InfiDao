'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useFlowDialog } from './useFlowDialog';
import styles from './flow.module.css';

export function FlowMenu({ onThought, onLibrary, libraryDisabled, motionCandidate, onOpen, reading, open: controlledOpen, onOpenChange }: {
  onThought?: () => void; onLibrary?: () => void; libraryDisabled?: boolean;
  motionCandidate?: { enabled: boolean; onToggle: () => void } | undefined;
  onOpen?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  reading?: {
    key: string; source: string; sourceOpen: boolean; bookmarked: boolean; notesOpen: boolean; noteCount: number;
    onMeaning?: (() => void) | undefined;
    onSource: () => void; onBookmark: () => void; onNotes: () => void;
  } | undefined;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ x: number; y: number; open: boolean } | null>(null);
  const suppressClick = useRef(false);
  const opened = useRef(onOpen);
  opened.current = onOpen;
  const [status, setStatus] = useState('');
  const readingKey = reading?.key, readingBookmarked = reading?.bookmarked;
  const previousReading = useRef({ key: readingKey, bookmarked: readingBookmarked });
  const id = useId();
  const panel = useFlowDialog(close, open, undefined, trigger.current);

  useEffect(() => {
    if (open) opened.current?.();
  }, [open]);

  useEffect(() => {
    const previous = previousReading.current;
    previousReading.current = { key: readingKey, bookmarked: readingBookmarked };
    if (!readingKey || previous.key !== readingKey || previous.bookmarked === readingBookmarked) return;
    setStatus(readingBookmarked ? '已收藏' : '已取消收藏');
    const timer = window.setTimeout(() => setStatus(''), 2400);
    return () => window.clearTimeout(timer);
  }, [readingKey, readingBookmarked]);

  function changeOpen(next: boolean) {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }
  function close() { changeOpen(false); }
  function act(action: () => void) { close(); action(); }

  return <div ref={root} className={styles.readingMenu} data-flow-menu-root data-open={open}
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
      else if (!start.open && dx < 0) changeOpen(true);
    }}
    onKeyDown={event => {
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
      onClick={() => changeOpen(!open)}
      onKeyDown={event => { if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); changeOpen(true); } }}>
      <span aria-hidden="true" />
    </button>
    <span className={styles.srOnly} role="status" aria-label="收藏状态">{status}</span>
    {open && <div className={styles.readingMenuScrim} data-flow-menu-backdrop aria-hidden="true" onClick={close} />}
    <section ref={panel} id={id} className={styles.readingMenuPanel} role="dialog" aria-modal={open ? true : undefined} aria-label="阅读选项" data-flow-menu hidden={!open}>
      <div className={styles.readingMenuHeading}><h2>阅读选项</h2><button type="button" className={styles.readingMenuClose} aria-label="关闭阅读选项" onClick={close}>×</button></div>
      {reading && <>
        <p className={styles.readingMenuSource}>{reading.source}</p>
        {reading.onMeaning && <button className={styles.textButton} type="button" aria-haspopup="dialog" onClick={() => act(reading.onMeaning!)}>释义</button>}
        <button className={styles.textButton} type="button" aria-expanded={reading.sourceOpen} onClick={() => act(reading.onSource)}>{reading.sourceOpen ? '收起原文' : '原文'}</button>
        <button className={styles.textButton} type="button" aria-pressed={reading.bookmarked} onClick={() => act(reading.onBookmark)}>{reading.bookmarked ? '已收藏' : '收藏'}</button>
        <button className={styles.textButton} type="button" aria-expanded={reading.notesOpen} onClick={() => act(reading.onNotes)}>{reading.notesOpen ? '收起注脚' : '注脚'}{reading.noteCount ? ` · ${reading.noteCount}` : ''}</button>
      </>}
      {onThought && <button className={styles.textButton} type="button" onClick={() => act(onThought)}>添一念</button>}
      {onLibrary && <button className={styles.textButton} type="button" disabled={libraryDisabled} onClick={() => act(onLibrary)}>温故</button>}
      {motionCandidate && <button className={styles.textButton} type="button" aria-pressed={motionCandidate.enabled}
        onClick={() => act(motionCandidate.onToggle)}>水膜动效{motionCandidate.enabled ? ' · 已开启' : ' · 已关闭'}</button>}
    </section>
  </div>;
}
