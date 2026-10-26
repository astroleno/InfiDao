'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CLOSING_ASSET_ROOT, CLOSING_PRESETS, CLOSING_ROTATION_KEY, nextClosingPreset } from '@/lib/handwriting/closing-presets';
import { PUBLIC_READER_PATH } from '@/lib/flow-browser/public-route';
import styles from './closing-cards.module.css';

/** A static closing moment. Mount only when the reader asks to pause and keep a sentence. */
export function ReadingClosingCards({ onClose }: { onClose?: (() => void) | undefined }) {
  const [index, setIndex] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const initialized = useRef(false);
  const preset = index === null ? null : CLOSING_PRESETS[index]!;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let previous: string | null = null;
    try { previous = sessionStorage.getItem(CLOSING_ROTATION_KEY); } catch { /* The current visit still works without storage. */ }
    const next = nextClosingPreset(previous);
    setIndex(next);
    try { sessionStorage.setItem(CLOSING_ROTATION_KEY, CLOSING_PRESETS[next]!.id); } catch { /* Rotation remains local to this visit. */ }
  }, []);

  function change() {
    if (!preset) return;
    const next = nextClosingPreset(preset.id);
    setImageFailed(false); setImageAttempt(0); setIndex(next);
    try { sessionStorage.setItem(CLOSING_ROTATION_KEY, CLOSING_PRESETS[next]!.id); } catch { /* Export does not require browser storage. */ }
  }

  return <section className={styles.closing} aria-labelledby="reading-closing-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>六经注我</p><h1 id="reading-closing-title">读到这里，留一句。</h1></div>
      {onClose ? <button type="button" className={styles.textButton} onClick={onClose}>返回阅读</button>
        : <Link className={styles.textButton} href={PUBLIC_READER_PATH}>返回阅读</Link>}
    </header>
    <figure className={styles.figure}>
      <div className={styles.paper} aria-busy={!preset}>
        {preset && !imageFailed && <Image key={`${preset.id}-${imageAttempt}`} unoptimized priority
          src={`${CLOSING_ASSET_ROOT}/${preset.id}.png${imageAttempt ? `?retry=${imageAttempt}` : ''}`}
          alt={`${preset.quote}——《${preset.source}》${preset.chapter}，AI 生成手写纪念卡`}
          width={2480} height={3508} onError={() => setImageFailed(true)} />}
        {preset && imageFailed && <div className={styles.fallback}><p>{preset.quote}</p><span>手写图片暂不可取回。</span><button type="button" className={styles.paperButton} onClick={() => { setImageAttempt(value => value + 1); setImageFailed(false); }}>重试图片</button></div>}
      </div>
      <figcaption aria-live="polite">{preset ? `《${preset.source}》· ${preset.chapter}` : '留一句，慢慢读。'}</figcaption>
    </figure>
    <div className={styles.actions}>
      <button type="button" className={styles.textButton} disabled={!preset} onClick={change}>换一句</button>
      {preset && <a className={styles.saveButton} href={`${CLOSING_ASSET_ROOT}/${preset.id}.png`} download={`六经注我-${preset.id}.png`}>保存这张卡</a>}
    </div>
    <footer className={styles.footer}><p>三句经文，轮流相伴。此刻不必急着读完。</p>{preset && <a href={`${CLOSING_ASSET_ROOT}/${preset.id}.pdf`} download={`六经注我-${preset.id}.pdf`}>保存 PDF</a>}</footer>
  </section>;
}
