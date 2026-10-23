'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlowStream } from './FlowStream';
import { MOTION_COMPARE_ENTRIES } from './motion-compare-data';
import { entryKey } from '@/lib/flow-browser/continuity';
import { prepareFlowFonts } from '@/lib/flow-browser/fonts';
import type { StreamMotionVariant } from '@/lib/flow-browser/motion-profile';
import styles from './motion-compare.module.css';

const variants: Array<{ id: StreamMotionVariant; letter: string; short: string; title: string; description: string }> = [
  { id: 'liquid-live-before', letter: 'C+', short: '上一版', title: '上一版 · 微波较弱', description: '保留原来的余波与微波，停下后变化较轻。' },
  { id: 'liquid-live', letter: 'C+', short: '持续微波', title: '本次 · 流动优化', description: '快滚后自然回弹，微波持续流动；弧面、白字与火彩保持原样。' },
];
const noop = () => {};
const resolved = async () => {};
const emptyBookmarks = new Set<string>();

export function MotionCompare() {
  const rootRef = useRef<HTMLElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const positionRef = useRef(0);
  const speedRef = useRef(36);
  const motionSeedRef = useRef<number | undefined>(undefined);
  const [active, setActive] = useState<StreamMotionVariant>('liquid-live');
  const [single, setSingle] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(36);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [fontState, setFontState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [fontAttempt, setFontAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [activeKey, setActiveKey] = useState(entryKey(MOTION_COMPARE_ENTRIES[0]!));
  const [selection, setSelection] = useState('');
  const restore = useMemo(() => ({ revision, top: positionRef.current }), [revision]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReducedMotion(media.matches); if (media.matches) setPlaying(false); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let disposed = false;
    setFontState('loading');
    void prepareFlowFonts(MOTION_COMPARE_ENTRIES.map(entry => entry.frame)).then(() => {
      if (!disposed) {
        motionSeedRef.current ??= Math.random() * 289;
        setFontState('ready');
      }
    }).catch(() => { if (!disposed) setFontState('failed'); });
    return () => { disposed = true; };
  }, [fontAttempt]);

  const synchronize = useCallback((top: number) => {
    const panels = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-flow-viewport]') || [])
      .filter(panel => panel.clientHeight > 0);
    if (!panels.length) return;
    const limit = Math.min(...panels.map(panel => panel.scrollHeight - panel.clientHeight));
    const next = Math.max(0, Math.min(limit, top));
    positionRef.current = next;
    for (const panel of panels) if (Math.abs(panel.scrollTop - next) >= 1) panel.scrollTop = next;
    if (rangeRef.current) {
      rangeRef.current.max = String(limit);
      rangeRef.current.value = String(next);
      rangeRef.current.setAttribute('aria-valuetext', `经文位置 ${Math.round(next)}`);
    }
  }, []);

  const onViewportScroll = useCallback((top: number) => {
    // Native scrolling may round our fractional playback position. Keep the
    // fraction so reading speed does not depend on device-pixel rounding.
    if (Math.abs(top - positionRef.current) >= 1) synchronize(top);
  }, [synchronize]);

  useLayoutEffect(() => {
    if (fontState !== 'ready') return;
    synchronize(positionRef.current);
    const root = rootRef.current;
    const resize = new ResizeObserver(() => synchronize(positionRef.current));
    if (root) resize.observe(root);
    return () => resize.disconnect();
  }, [fontState, active, single, revision, synchronize]);

  useEffect(() => {
    if (!playing || fontState !== 'ready' || reducedMotion) return;
    let handle = 0, previous = 0;
    const tick = (now: number) => {
      if (!document.hidden && previous) synchronize(positionRef.current + Math.min(48, now - previous) * speedRef.current / 1000);
      if (rangeRef.current && positionRef.current >= Number(rangeRef.current.max) - .5) { setPlaying(false); return; }
      previous = now;
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, fontState, reducedMotion, synchronize]);

  const pause = useCallback(() => setPlaying(false), []);
  const reset = () => {
    setPlaying(false);
    setSelection('');
    synchronize(0);
    setRevision(value => value + 1);
  };

  return <main ref={rootRef} className={styles.page} data-motion-compare data-view={single ? 'single' : 'compare'}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>六经注我 · 动效小样</p><h1>先看差别，再定分寸。</h1></div>
      <p className={styles.intro}>停滚后的余波渐弱，边缘仍保留轻柔、持续的波动。</p>
    </header>

    <div className={styles.toolbar}>
      <div className={styles.choices} role="group" aria-label="选择动效版本">
        {variants.map(variant => <button key={variant.id} type="button" aria-pressed={active === variant.id}
          onClick={() => { setActive(variant.id); setSelection(''); }}><span>{variant.letter}</span>{variant.short}</button>)}
      </div>
      <div className={styles.playback}>
        <button type="button" onClick={() => setPlaying(value => !value)} disabled={fontState !== 'ready' || reducedMotion}
          aria-label={playing ? '暂停同步滚动' : '播放同步滚动'}>{playing ? '暂停滚动' : '播放'}</button>
        <button type="button" onClick={reset}>回到开头</button>
        <label className={styles.speed}>速度<select value={speed} onChange={event => { const next = Number(event.target.value); speedRef.current = next; setSpeed(next); }}>
          <option value={12}>阅读速度</option><option value={36}>对比速度</option><option value={72}>快速经过</option>
        </select></label>
        <button type="button" className={styles.viewToggle} aria-pressed={single} onClick={() => setSingle(value => !value)}>{single ? '两版并排' : '单独看'}</button>
      </div>
    </div>

    <label className={styles.scrubber}><span>拖动看展开与收拢</span><input ref={rangeRef} type="range" min={0} max={3000} defaultValue={0} step={1}
      aria-label="同步经文位置" onInput={event => { setPlaying(false); synchronize(Number(event.currentTarget.value)); }} /></label>

    {fontState !== 'ready' ? <div className={styles.loading} role="status">{fontState === 'loading' ? '正在准备经文字体…' : <><span>经文字体未能载入。</span><button type="button" onClick={() => setFontAttempt(value => value + 1)}>重新载入</button></>}</div>
      : <div className={styles.comparison}>
        {variants.map(variant => <section key={variant.id} className={styles.option} data-active={active === variant.id} data-variant={variant.id} aria-label={`${variant.letter} · ${variant.title}`}>
          <div className={styles.caption}><div><span className={styles.letter}>{variant.letter}</span><h2>{variant.title}</h2>{variant.id === 'liquid-live' && <span className={styles.recommended}>本次微调</span>}</div><p>{variant.description}</p></div>
          <div className={styles.stage}>
            <span className={styles.brand} aria-hidden="true">六经注我</span>
            <FlowStream key={revision} entries={MOTION_COMPARE_ENTRIES} activeKey={activeKey} paused={!playing} autoScroll={false} reducedMotion={reducedMotion}
              motionVariant={variant.id} motionSeed={(motionSeedRef.current ?? 0) + revision * .417} settleEntrance pending={false} connecting={null} restore={restore} canContinue={false}
              onContinue={noop} onPrepareNext={noop} onPause={pause} onRead={entry => setActiveKey(entryKey(entry))}
              onScroll={onViewportScroll} onVisualReady={noop} onBranch={item => { setPlaying(false); setSelection(`已点中「${item.label}」`); }}
              sourceOpen={false} onToggleSource={noop} bookmarkKeys={emptyBookmarks} onBookmark={noop}
              notesFrameId={null} notes={[]} savingNote={false} onSaveNote={resolved} onDeleteNote={resolved} onUndoNote={resolved} onUpdateNote={resolved} />
          </div>
        </section>)}
      </div>}

    <footer className={styles.footer}><span>{reducedMotion ? '已按系统设置减少动态效果。' : playing ? '两版同步滚动；可在文字上直接滚动。' : '滚动已暂停 · 边缘微波继续。'}</span><span role="status" aria-live="polite">{selection}</span></footer>
  </main>;
}
