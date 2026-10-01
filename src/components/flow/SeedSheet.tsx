'use client';

import { useEffect, useRef } from 'react';
import styles from './flow.module.css';
import { FlowWaiting } from './FlowWaiting';

type Props = { open: boolean; value: string; busy: boolean; waitingForHead?: boolean; error: string; onChange: (value: string) => void; onSubmit: () => void; onClose: () => void; onCancel: () => void };

export function SeedSheet({ open, value, busy, waitingForHead = busy, error, onChange, onSubmit, onClose, onCancel }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasBusyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (open && error) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, error]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const isolated: Array<{ element: HTMLElement; inert: boolean; hidden: string | null }> = [];
    let branch: HTMLElement | null = dialog?.parentElement || null;
    while (branch?.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
        isolated.push({ element: sibling, inert: sibling.hasAttribute('inert'), hidden: sibling.getAttribute('aria-hidden') });
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('textarea:not(:disabled), button:not(:disabled)') || []);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
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
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  useEffect(() => {
    if (open && busy) cancelRef.current?.focus();
    else if (open && wasBusyRef.current) dialogRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    wasBusyRef.current = open && busy;
  }, [open, busy]);
  if (!open) return null;
  return (
    <div className={styles.sheetBackdrop} role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className={styles.seedSheet} role="dialog" aria-modal="true" aria-labelledby="flow-seed-title">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <h2 id="flow-seed-title">带着一念进入经典</h2>
        <p className={styles.muted}>可以写，也可以留空，从精选经文开始。</p>
        <label className={styles.srOnly} htmlFor="flow-seed-input">此刻的一念</label>
        <textarea id="flow-seed-input" value={value} maxLength={120} disabled={busy} aria-describedby={error ? 'flow-seed-error' : undefined} onChange={event => onChange(event.target.value)} placeholder="此刻，你在想什么？" />
        {error && <p ref={errorRef} id="flow-seed-error" className={styles.seedError} role="alert">{error}</p>}
        {busy && <FlowWaiting busy={waitingForHead} onCancel={onCancel} cancelRef={cancelRef} />}
        <div className={styles.sheetActions}>
          <button className={styles.textButton} type="button" onClick={onClose}>返回经轮</button>
          <button className={styles.primaryButton} type="button" disabled={busy} onClick={onSubmit}>{busy ? '正在展开' : '开始阅读'}</button>
        </div>
      </section>
    </div>
  );
}
