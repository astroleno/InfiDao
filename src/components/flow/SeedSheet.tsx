'use client';

import { useEffect, useRef } from 'react';
import styles from './flow.module.css';
import { FlowWaiting } from './FlowWaiting';
import { useFlowDialog } from './useFlowDialog';

type Props = { open: boolean; value: string; busy: boolean; continuing?: boolean; waitingForHead?: boolean; error: string; onChange: (value: string) => void; onSubmit: () => void; onClose: () => void; onCancel: () => void };

export function SeedSheet({ open, value, busy, continuing = false, waitingForHead = busy, error, onChange, onSubmit, onClose, onCancel }: Props) {
  const dialogRef = useFlowDialog(onClose, open, 'textarea');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasBusyRef = useRef(false);
  useEffect(() => {
    if (open && error) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, error]);
  useEffect(() => {
    if (open && busy) cancelRef.current?.focus();
    else if (open && wasBusyRef.current) dialogRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    wasBusyRef.current = open && busy;
  }, [open, busy, dialogRef]);
  if (!open) return null;
  return (
    <div className={styles.sheetBackdrop} role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className={styles.seedSheet} role="dialog" aria-modal="true" aria-labelledby="flow-seed-title">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <h2 id="flow-seed-title">{continuing ? '添一念' : '带着一念进入经典'}</h2>
        <p className={styles.muted}>{continuing ? '与眼前的经文相连，也可以带来新的方向。' : '可以写，也可以留空，从精选经文开始。'}</p>
        <label className={styles.srOnly} htmlFor="flow-seed-input">此刻的一念</label>
        <textarea id="flow-seed-input" value={value} maxLength={120} disabled={busy} aria-describedby={error ? 'flow-seed-error' : undefined} onChange={event => onChange(event.target.value)} placeholder="此刻，你在想什么？" />
        {error && <p ref={errorRef} id="flow-seed-error" className={styles.seedError} role="alert">{error}</p>}
        {busy && <FlowWaiting busy={waitingForHead} onCancel={onCancel} cancelRef={cancelRef} />}
        <div className={styles.sheetActions}>
          <button className={styles.textButton} type="button" onClick={onClose}>返回阅读</button>
          <button className={styles.primaryButton} type="button" disabled={busy || (continuing && !value.trim())} onClick={onSubmit}>{busy ? '正在展开' : continuing ? '沿此念继续' : '开始阅读'}</button>
        </div>
      </section>
    </div>
  );
}
