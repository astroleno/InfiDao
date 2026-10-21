'use client';

import { useEffect, useRef, useState } from 'react';
import type { FlowFrame } from '@/lib/flow/contracts';
import { prepareFlowFonts } from '@/lib/flow-browser/fonts';
import { createFlowRendererHost } from '@/lib/flow-browser/renderer-host';
import type { FlowRendererHost } from '@/lib/flow-browser/renderer-host';
import type { ReadingSnapshot } from '@/lib/flow-browser/storage';
import styles from './flow.module.css';

type Selection = Parameters<Parameters<typeof createFlowRendererHost>[3]['callbacks']['onSelect']>[0];

type Props = {
  frames: FlowFrame[];
  active?: FlowFrame | null;
  chainId: string;
  snapshot?: ReadingSnapshot | null;
  paused: boolean;
  reducedMotion: boolean;
  onSelect: (selection: Selection) => void;
  onPauseChange: (paused: boolean) => void;
  onActiveChange: (frame: FlowFrame) => void;
  onSnapshot: (snapshot: ReadingSnapshot) => void;
  onHostReady: (host: FlowRendererHost | null) => void;
  onVisualReady?: () => void;
};

export function WheelCanvas({ frames, active, chainId, snapshot, paused, reducedMotion, onSelect, onPauseChange, onActiveChange, onSnapshot, onHostReady, onVisualReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<FlowRendererHost | null>(null);
  const callbacksRef = useRef({ onSelect, onPauseChange, onActiveChange, onSnapshot, onHostReady, onVisualReady });
  const framesRef = useRef(frames);
  const snapshotRef = useRef(snapshot);
  const chainIdRef = useRef(chainId);
  const latestChainIdRef = useRef(chainId);
  const reducedMotionRef = useRef(reducedMotion);
  const pausedRef = useRef(paused);
  const activeRef = useRef(active?.id);
  const [fontFamily, setFontFamily] = useState('');
  const [fontError, setFontError] = useState('');
  const [graphicsError, setGraphicsError] = useState('');
  const [fontAttempt, setFontAttempt] = useState(0);
  const [retryingFonts, setRetryingFonts] = useState(false);
  const fontRetryRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<Selection | null>(null);

  callbacksRef.current = { onSelect, onPauseChange, onActiveChange, onSnapshot, onHostReady, onVisualReady };
  framesRef.current = frames;
  snapshotRef.current = snapshot;
  latestChainIdRef.current = chainId;
  reducedMotionRef.current = reducedMotion;
  pausedRef.current = paused;
  activeRef.current = active?.id;
  const hasFrames = frames.length > 0;

  useEffect(() => {
    if (!framesRef.current.length || !canvasRef.current || !atlasRef.current) return;
    let cancelled = false;
    let host: FlowRendererHost | null = null;
    const prepare = async () => {
      let prepared = framesRef.current;
      let fonts;
      for (;;) {
        prepared = framesRef.current;
        fonts = await prepareFlowFonts(prepared.map(frame => ({ quote: frame.quote })));
        if (cancelled) return;
        if (prepared === framesRef.current) break;
      }
      if (cancelled || !canvasRef.current || !atlasRef.current) return;
      setFontFamily(fonts.family);
      setFontError('');
      setRetryingFonts(false);
      if (document.activeElement === fontRetryRef.current) canvasRef.current.focus({ preventScroll: true });
      // Constructor notifications must not rewind a reader who moved while
      // the glyphs were loading. The text record already owns that position.
      const desired = activeRef.current;
      const restored = snapshotRef.current?.activeFrameId || prepared[0]?.id;
      let starting = true;
      host = createFlowRendererHost(canvasRef.current, atlasRef.current, prepared, {
        paused: reducedMotionRef.current || pausedRef.current,
        reducedMotion: reducedMotionRef.current,
        snapshot: snapshotRef.current ? { ...snapshotRef.current, paused: pausedRef.current } : null,
        callbacks: {
          onSelect: hit => callbacksRef.current.onSelect(hit),
          onPreview: hit => setPreview(hit),
          onPauseChange: value => callbacksRef.current.onPauseChange(value),
          onActiveChange: frame => { if (!starting) callbacksRef.current.onActiveChange(frame); },
          onSnapshot: value => callbacksRef.current.onSnapshot(value),
          onError: error => {
            setGraphicsError(error.message || 'WEBGL_UNAVAILABLE');
            callbacksRef.current.onVisualReady?.();
          },
          onReady: () => { setGraphicsError(''); callbacksRef.current.onVisualReady?.(); },
        },
      });
      if (pausedRef.current && desired && desired !== restored) host.focusFrame(desired);
      starting = false;
      hostRef.current = host;
      chainIdRef.current = latestChainIdRef.current;
      callbacksRef.current.onHostReady(host);
    };
    void prepare().catch(error => {
      if (cancelled) return;
      setFontError(error instanceof Error ? error.message : 'FONT_UNAVAILABLE');
      setRetryingFonts(false);
      setGraphicsError('FONT_UNAVAILABLE');
      callbacksRef.current.onPauseChange(true);
      callbacksRef.current.onVisualReady?.();
    });
    return () => {
      cancelled = true;
      host?.destroy();
      if (hostRef.current === host) {
        hostRef.current = null;
        callbacksRef.current.onHostReady(null);
      }
    };
    // Initial load and explicit asset retry share this path. Retrying fonts
    // keeps the current chain/snapshot and never calls the reading provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFrames, fontAttempt]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void prepareFlowFonts(frames.map(frame => ({ quote: frame.quote }))).then(fonts => {
      if (cancelled || hostRef.current !== host) return;
      setFontFamily(fonts.family); setFontError('');
      setGraphicsError(value => value === 'FONT_UNAVAILABLE' ? '' : value);
      if (chainIdRef.current !== chainId) {
        chainIdRef.current = chainId;
        host.switchChain(frames, snapshotRef.current || null, reducedMotionRef.current);
      } else host.setFrames(frames, pausedRef.current ? activeRef.current : undefined);
    }).catch(error => {
      if (cancelled || hostRef.current !== host) return;
      setFontError(error instanceof Error ? error.message : 'FONT_UNAVAILABLE');
      setGraphicsError('FONT_UNAVAILABLE');
      callbacksRef.current.onPauseChange(true);
      callbacksRef.current.onVisualReady?.();
    });
    return () => { cancelled = true; };
  }, [frames, chainId]);

  useEffect(() => {
    hostRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    hostRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  function keyDown(event: React.KeyboardEvent<HTMLCanvasElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      hostRef.current?.step(event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (hostRef.current) hostRef.current.togglePause();
      else onPauseChange(!paused);
    } else if (event.key === 'Escape' && preview) {
      event.preventDefault();
      setPreview(null);
    }
  }

  const quote = active?.quote || frames[0]?.quote || '';

  return (
    <div className={styles.canvasShell} data-graphics-error={graphicsError || undefined}>
      <canvas
        ref={canvasRef}
        className={styles.wheelCanvas}
        aria-label="经典经轮。轻触可停驻阅读，拖动可回看，聚焦后按空格可暂停或继续，上下方向键浏览前后经文。"
        aria-describedby="flow-wheel-help"
        tabIndex={0}
        onPointerDown={event => hostRef.current?.pointerDown(event.nativeEvent)}
        onPointerMove={event => hostRef.current?.pointerMove(event.nativeEvent)}
        onPointerUp={event => hostRef.current?.pointerUp(event.nativeEvent)}
        onPointerCancel={event => hostRef.current?.pointerCancel(event.nativeEvent)}
        onLostPointerCapture={event => hostRef.current?.pointerCancel(event.nativeEvent)}
        onKeyDown={keyDown}
      />
      <canvas ref={atlasRef} className={styles.atlasCanvas} aria-hidden="true" />
      {preview && (
        <div className={styles.wordFeedback} style={{ left: preview.left, top: preview.top, width: preview.right - preview.left, height: preview.bottom - preview.top }} aria-hidden="true" />
      )}
      <p id="flow-wheel-help" className={styles.srOnly}>
        经文可以逐词接续。轻触空白停驻，拖动回看；键盘用空格暂停或继续，上下方向键停驻并浏览前后经文，Tab 进入阅读操作。
      </p>
      {fontError && <p className={styles.status} role="status">经文字体暂未完整载入，仍可静读。
        <button ref={fontRetryRef} className={styles.textButton} type="button" disabled={retryingFonts}
          onClick={() => { setRetryingFonts(true); setFontAttempt(value => value + 1); }}>{retryingFonts ? '正在载入字体…' : '重试字体'}</button>
      </p>}
      {graphicsError && (
        <div className={styles.staticFallback} role="status">
          <p className={styles.fallbackLabel}>经轮暂不可用，当前经句仍可阅读</p>
          <p className={styles.classicText} style={fontFamily ? { fontFamily } : undefined}>{quote}</p>
        </div>
      )}
    </div>
  );
}
