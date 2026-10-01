'use client';

import { useEffect, useState, type RefObject } from 'react';
import styles from './flow.module.css';

export function FlowWaiting({ busy, label, onCancel, floating = false, cancelRef }: {
  busy: boolean; label?: string | undefined; onCancel: () => void; floating?: boolean; cancelRef?: RefObject<HTMLButtonElement>;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [busy, label]);
  return <div className={floating ? styles.waitingLabel : styles.inlineWaiting}>
    <p role="status">{!busy ? '经句已到，正在补全联系…' : slow
      ? '这次等待较久，尚未收到经句。可以停止后重试。'
      : label ? `正在沿「${label}」寻找可接续的经文…` : '正在寻找与这一念相连的经文…'}</p>
    <button ref={cancelRef} className={styles.textButton} type="button" onClick={onCancel}>停止展开</button>
  </div>;
}
