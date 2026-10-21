'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { FontProgress } from '@/lib/flow-browser/fonts';
import styles from './flow.module.css';

// Wavelength samples belong to this light effect, never to interface tokens.
const rays = ['#ff6551', '#ffa563', '#f5dfab', '#dcf1d9', '#91e6ec', '#79adff', '#b1a0ff'];
type Props = { active: boolean; progress: FontProgress; quote: string; reducedMotion: boolean };

export function FlowLoading({ active, progress, quote, reducedMotion }: Props) {
  const [visible, setVisible] = useState(active);
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    if (active) { openedAt.current = performance.now(); setVisible(true); return undefined; }
    if (reducedMotion || openedAt.current === null || performance.now() - openedAt.current < 160) {
      setVisible(false); return undefined;
    }
    const timer = window.setTimeout(() => setVisible(false), 480);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion]);
  if (!visible) return null;
  const ratio = progress.total > 0 ? progress.loaded / progress.total : 0;
  const spread = active && progress.phase !== 'manifest' ? 0.55 + ratio * 0.45 : 0;
  const style = { '--prism-spread': spread } as CSSProperties;
  return <div className={styles.opticalLoading} data-phase={active ? progress.phase : 'focus'} data-has-quote={!!quote || undefined} style={style} aria-hidden={!active}>
    <div className={styles.prismLight} aria-hidden="true">
      {rays.map((color, index) => <span key={color} className={styles.prismRay} style={{ '--wavelength': color, '--ray-angle': `${(index - 3) * 11}deg` } as CSSProperties} />)}
      <span className={styles.lightPoint} />
    </div>
    <p className={`${styles.lightQuote} ${styles.classicText}`} aria-hidden="true">{quote}</p>
    <p className={styles.lightCaption} role={active ? 'status' : undefined}>{active ? !quote && progress.phase === 'manifest' ? '正在取来经文…' : '经文已到，正在准备字形…' : ''}</p>
  </div>;
}
