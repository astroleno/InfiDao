'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useFlowDialog } from './useFlowDialog';
import styles from './flow.module.css';

type Origin = { pathId: string; label: string; onReturn: () => void };
type Props = {
  onThought?: () => void; onLibrary?: () => void; libraryDisabled?: boolean;
  motionCandidate?: { enabled: boolean; onToggle: () => void } | undefined;
  origins?: Origin[] | undefined;
  onOpen?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  poetry?: { enabled: boolean; available: boolean; onToggle: () => void; message?: string };
  gestureSurface?: RefObject<HTMLElement>;
  onGestureStart?: (target: Element | null) => void;
  reading?: {
    key: string; pathId?: string; source: string; sourceOpen: boolean; bookmarked: boolean; notesOpen: boolean; noteCount: number;
    onMeaning?: (() => void) | undefined;
    onSource: () => void; onBookmark: () => void; onNotes: () => void; onKeepsake?: (() => void) | undefined;
  } | undefined;
};
type Drag = { id: number; x: number; y: number; progress: number; lastX: number; at: number; velocity: number; dragging: boolean; frozen: boolean };
const RELEASE_VELOCITY_WINDOW_MS = 80;

export function FlowMenu(props: Props) {
  const { onThought, onLibrary, libraryDisabled, motionCandidate, origins, reading } = props;
  const origin = origins?.find(item => item.pathId === reading?.pathId);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const [present, setPresent] = useState(open);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const gesture = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const instant = useRef(false);
  const releaseVelocity = useRef<number | undefined>(undefined);
  const reduced = useReducedMotion();
  const live = useRef(props);
  live.current = props;
  const openRef = useRef(open);
  openRef.current = open;
  const progress = useMotionValue(open ? 1 : 0);
  const x = useTransform(progress, value => ((1 - value) * 100) + '%');
  const animation = useRef<{ stop: () => void } | null>(null);
  const id = useId();
  const panel = useFlowDialog(() => close(instant.current), open, undefined, trigger.current);

  function changeOpen(next: boolean) {
    if (live.current.open === undefined) setInternalOpen(next);
    live.current.onOpenChange?.(next);
  }
  function moveTo(next: boolean, velocity?: number, immediately = false) {
    animation.current?.stop();
    animation.current = null;
    if (next) setPresent(true);
    if (immediately || reduced) {
      progress.set(next ? 1 : 0);
      if (!next) setPresent(false);
      return;
    }
    animation.current = animate(progress, next ? 1 : 0, {
      type: 'spring', stiffness: 520, damping: 46, mass: 1, velocity: velocity ?? progress.getVelocity(),
      onComplete: () => { animation.current = null; if (!next && !openRef.current && !gesture.current?.dragging) setPresent(false); },
    });
  }
  const move = useRef(moveTo);
  move.current = moveTo;
  function close(immediately = false) { instant.current = immediately; changeOpen(false); }
  function act(action: () => void) {
    // The next destination owns focus and presentation immediately.
    close(true);
    action();
  }

  useEffect(() => {
    move.current(open, releaseVelocity.current, instant.current);
    releaseVelocity.current = undefined;
    instant.current = false;
    if (open) live.current.onOpen?.();
  }, [open]);
  useEffect(() => () => animation.current?.stop(), []);
  useLayoutEffect(() => { panel.current?.toggleAttribute('inert', !open); }, [open, panel]);

  useEffect(() => {
    const surfaces = [root.current, props.gestureSurface?.current].filter((node): node is HTMLElement => !!node);
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      suppressClick.current = false;
      instant.current = false;
      const frozen = !!animation.current;
      animation.current?.stop();
      animation.current = null;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, progress: progress.get(), lastX: event.clientX, at: event.timeStamp, velocity: 0, dragging: false, frozen };
    };
    const drag = (event: PointerEvent) => {
      const start = gesture.current;
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!start.dragging) {
        if (Math.hypot(dx, dy) < 8) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.4 || (!openRef.current && start.progress === 0 && dx >= 0)) {
          gesture.current = null;
          if (start.frozen) move.current(openRef.current);
          return;
        }
        start.dragging = true;
        animation.current?.stop();
        setPresent(true);
        suppressClick.current = true;
        live.current.onGestureStart?.(event.target instanceof Element ? event.target : null);
        if (event.target instanceof Element) event.target.setPointerCapture?.(event.pointerId);
      }
      if (event.cancelable) event.preventDefault();
      const width = panel.current?.getBoundingClientRect().width || Math.min(300, Math.max(44, (root.current?.clientWidth || 348) - 48));
      start.velocity = -(event.clientX - start.lastX) / Math.max(1, event.timeStamp - start.at) * 1000 / width;
      start.lastX = event.clientX;
      start.at = event.timeStamp;
      progress.set(Math.max(0, Math.min(1, start.progress - dx / width)));
    };
    const up = (event: PointerEvent) => {
      let start = gesture.current;
      if (!start || event.pointerId !== start.id) return;
      // Some pointer sources coalesce an entire short swipe into its release.
      if (!start.dragging || event.clientX !== start.lastX) drag(event);
      start = gesture.current;
      gesture.current = null;
      if (!start?.dragging) { if (start?.frozen) move.current(openRef.current); return; }
      // A held position has no remaining momentum, even without another move.
      const velocity = event.timeStamp - start.at <= RELEASE_VELOCITY_WINDOW_MS ? start.velocity : 0;
      const projected = progress.get() + Math.max(-3, Math.min(3, velocity)) * .18;
      const next = Math.abs(event.clientX - start.x) < 36 ? openRef.current : projected >= .5;
      const changed = next !== openRef.current;
      releaseVelocity.current = changed ? velocity : undefined;
      if (live.current.open === undefined) setInternalOpen(next);
      live.current.onOpenChange?.(next);
      // Changed state starts its spring in the effect; avoid competing starts.
      if (!changed) move.current(next, velocity);
    };
    const cancel = () => {
      if (gesture.current?.dragging || gesture.current?.frozen) { move.current(openRef.current); live.current.onOpenChange?.(openRef.current); }
      gesture.current = null;
    };
    const click = (event: MouseEvent) => {
      if (suppressClick.current && event.detail !== 0) {
        suppressClick.current = false;
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    for (const surface of surfaces) {
      surface.addEventListener('pointerdown', down);
      surface.addEventListener('click', click, true);
    }
    document.addEventListener('pointermove', drag, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      for (const surface of surfaces) { surface.removeEventListener('pointerdown', down); surface.removeEventListener('click', click, true); }
      document.removeEventListener('pointermove', drag); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, [props.gestureSurface, panel, progress]);

  return <div ref={root} className={styles.readingMenu} data-flow-menu-root data-open={open}
    onKeyDownCapture={() => { instant.current = true; }}
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
      onClick={event => { instant.current = event.detail === 0; changeOpen(!open); }}
      onKeyDown={event => { if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); instant.current = true; changeOpen(true); } }}>
      <span aria-hidden="true" />
    </button>
    <motion.div hidden={!present && !open} className={styles.readingMenuScrim} style={{ opacity: progress, pointerEvents: present || open ? 'auto' : 'none' }} data-flow-menu-backdrop aria-hidden="true" onClick={() => close()} />
    <motion.section ref={panel} id={id} className={styles.readingMenuPanel} role="dialog" aria-modal={open ? true : undefined} aria-hidden={!open || undefined}
      aria-label="阅读选项" data-flow-menu hidden={!present && !open} style={{ x, pointerEvents: open ? 'auto' : 'none' }}>
      <div className={styles.readingMenuHeading}><h2>阅读选项</h2><button type="button" className={styles.readingMenuClose} aria-label="关闭阅读选项" onClick={event => close(event.detail === 0)}>×</button></div>
      {origin && <div className={styles.readingMenuOrigin}>
        <p className={styles.muted}>{origin.label}</p>
        <button className={styles.textButton} type="button" onClick={() => act(origin.onReturn)}>回到来处</button>
      </div>}
      {reading && <div className={styles.readingMenuGroup} role="group" aria-label="眼前经句">
        <p className={styles.readingMenuSource}>{reading.source}</p>
        {reading.onMeaning && <button className={styles.textButton} type="button" aria-haspopup="dialog" onClick={() => act(reading.onMeaning!)}>释义</button>}
        <button className={styles.textButton} type="button" aria-expanded={reading.sourceOpen} onClick={() => act(reading.onSource)}>{reading.sourceOpen ? '收起原文' : '原文'}</button>
        <button className={styles.textButton} type="button" aria-pressed={reading.bookmarked} onClick={() => act(reading.onBookmark)}>{reading.bookmarked ? '已收藏' : '收藏'}</button>
        <button className={styles.textButton} type="button" aria-expanded={reading.notesOpen} onClick={() => act(reading.onNotes)}>{reading.notesOpen ? '收起注脚' : '注脚'}{reading.noteCount ? ' · ' + reading.noteCount : ''}</button>
        {reading.onKeepsake && <button className={styles.textButton} type="button" aria-haspopup="dialog" onClick={() => act(reading.onKeepsake!)}>留成手写纪念卡</button>}
      </div>}
      {(onThought || onLibrary) && <div className={styles.readingMenuGroup} role="group" aria-label="自己的阅读">
        <p className={styles.readingMenuGroupLabel}>自己的阅读</p>
        {onThought && <button className={styles.textButton} type="button" onClick={() => act(onThought)}>添一念</button>}
        {onLibrary && <button className={styles.textButton} type="button" disabled={libraryDisabled} onClick={() => act(onLibrary)}>温故</button>}
      </div>}
      {props.poetry && <div className={styles.readingMenuGroup} role="group" aria-label="阅读来源">
        <p className={styles.readingMenuGroupLabel}>阅读来源</p>
        <p className={styles.muted}>核心典籍 · 始终选用</p>
        <button type="button" className={styles.textButton} aria-pressed={props.poetry.enabled} disabled={!props.poetry.available && !props.poetry.enabled} onClick={() => props.poetry?.onToggle()}>诗词篇 · {props.poetry.enabled ? '已开启' : '未开启'}</button>
        {props.poetry.message && <p className={styles.muted} role="status">{props.poetry.message}</p>}
      </div>}
      {motionCandidate && <button className={styles.textButton} type="button" aria-pressed={motionCandidate.enabled}
        onClick={() => act(motionCandidate.onToggle)}>水膜动效{motionCandidate.enabled ? ' · 已开启' : ' · 已关闭'}</button>}
    </motion.section>
  </div>;
}
