'use client';

import { useId, type ReactNode } from 'react';
import { useFlowDialog } from './useFlowDialog';
import styles from './flow.module.css';

/** A requested explanation lives outside the scrolling/optical text source. */
export function MeaningPopover({ source, children, onClose, returnFocus }: {
  source: string; children: ReactNode; onClose: () => void; returnFocus?: HTMLElement | null;
}) {
  const dialogRef = useFlowDialog(onClose, true, undefined, returnFocus);
  const title = useId();
  return <div className={styles.meaningBackdrop} data-flow-meaning-backdrop role="presentation"
    onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={styles.meaningPopover} role="dialog" aria-modal="true" aria-labelledby={title}>
      <header className={styles.meaningHeader}>
        <div><p className={styles.sectionLabel}>释义</p><h2 id={title}>{source} · 释义</h2></div>
        <button className={styles.meaningClose} type="button" aria-label="关闭释义" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <div className={styles.meaningBody} data-flow-meaning-content tabIndex={0}><p>{children}</p></div>
    </section>
  </div>;
}
