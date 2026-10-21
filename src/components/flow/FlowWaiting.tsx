'use client';

import { useEffect, useState, type RefObject } from 'react';
import styles from './flow.module.css';

export function FlowResume({ onResume, floating = false }: { onResume: () => void; floating?: boolean }) {
  return <div className={floating ? styles.waitingLabel : styles.compactWaiting}>
    <button className={styles.textButton} type="button" onClick={onResume}>继续补全</button>
  </div>;
}

export function FlowWaiting({ busy, label, onCancel, floating = false, compact = false, cancelRef }: {
  busy: boolean; label?: string | undefined; onCancel: () => void; floating?: boolean; compact?: boolean; cancelRef?: RefObject<HTMLButtonElement>;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [busy, label]);
  const message = compact
    ? !busy ? '正在补全联系…' : slow ? '仍在接续，可停止等待。' : label ? `沿「${label}」接续中…` : '正在接续…'
    : !busy ? '经句已到，正在补全联系…' : slow
      ? '这次等待较久，尚未收到经句。可以停止后重试。'
      : label ? `正在沿「${label}」寻找可接续的经文…` : '正在寻找与这一念相连的经文…';
  return <div className={compact ? styles.compactWaiting : floating ? styles.waitingLabel : styles.inlineWaiting}>
    <p role="status">{message}</p>
    <button ref={cancelRef} className={styles.textButton} type="button" aria-label="停止展开" onClick={onCancel}>{compact ? '停止' : '停止展开'}</button>
  </div>;
}
