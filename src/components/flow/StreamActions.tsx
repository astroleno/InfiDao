'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import styles from './flow.module.css';

type Props = {
  source: string;
  sourceOpen: boolean;
  bookmarked: boolean;
  notesOpen: boolean;
  noteCount: number;
  onOpen: () => void;
  onSource: () => void;
  onBookmark: () => void;
  onNotes: () => void;
};

/** Secondary reading actions share one native, keyboard-accessible disclosure. */
export function StreamActions(props: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'above' | 'below'>('above');
  const [status, setStatus] = useState('');
  const wasBookmarked = useRef(props.bookmarked);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const bar = root.current?.closest(`.${styles.experience}`)?.querySelector(`.${styles.topBar}`);
    const safeTop = (bar?.getBoundingClientRect().bottom ?? 0) + 12;
    setPlacement(trigger.current.getBoundingClientRect().top - (menu.current?.offsetHeight || 52) < safeTop ? 'below' : 'above');
  }, [open]);

  useEffect(() => {
    if (wasBookmarked.current === props.bookmarked) return;
    wasBookmarked.current = props.bookmarked;
    setStatus(props.bookmarked ? '已收藏' : '已取消收藏');
    const timer = window.setTimeout(() => setStatus(''), 2400);
    return () => window.clearTimeout(timer);
  }, [props.bookmarked]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      if (menu.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      setOpen(false);
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) dismiss();
    };
    const viewport = root.current?.closest('[data-flow-viewport]');
    document.addEventListener('pointerdown', outside);
    viewport?.addEventListener('scroll', dismiss, { passive: true });
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      viewport?.removeEventListener('scroll', dismiss);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function act(action: () => void) {
    close();
    action();
  }

  return <div ref={root} className={styles.streamTools} data-flow-tools data-open={open}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
    <button ref={trigger} type="button" className={styles.streamToolsTrigger}
      aria-label={`${props.source}：原文、收藏、注脚`} title="原文、收藏、注脚"
      aria-expanded={open} aria-controls={id}
      onClick={() => { if (!open) props.onOpen(); setOpen(!open); }}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
      </svg>
    </button>
    <span className={styles.streamActionStatus} role="status" aria-label="收藏状态">{status}</span>
    <div ref={menu} id={id} className={styles.streamActionMenu} role="group" aria-label="经文操作" data-placement={placement} hidden={!open}>
      <button className={styles.textButton} type="button" aria-expanded={props.sourceOpen}
        onClick={() => act(props.onSource)}>{props.sourceOpen ? '收起原文' : '原文'}</button>
      <button className={styles.textButton} type="button" aria-pressed={props.bookmarked}
        onClick={() => act(props.onBookmark)}>{props.bookmarked ? '已收藏' : '收藏'}</button>
      <button className={styles.textButton} type="button" aria-expanded={props.notesOpen}
        onClick={() => act(props.onNotes)}>{props.notesOpen ? '收起注脚' : '注脚'}{props.noteCount ? ` · ${props.noteCount}` : ''}</button>
    </div>
  </div>;
}
