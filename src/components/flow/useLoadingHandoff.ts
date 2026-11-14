'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** The loading quotation is shown whole for one beat before it leaves. */
export const QUOTE_HOLD_MS = 650;
/** Matches the quotation's fade in flow.module.css. The lettering inks in only
 * after it has gone, so the same words never stand in two layouts at once. */
export const QUOTE_FADE_MS = 260;

export function useLoadingHandoff(quote: string, reducedMotion: boolean) {
  const [visualReady, setVisualReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const quoteAt = useRef<number | null>(null);

  useEffect(() => {
    if (quote && quoteAt.current === null && !ready) quoteAt.current = performance.now();
  }, [quote, ready]);

  useEffect(() => {
    if (!visualReady || ready) return undefined;
    const shown = quoteAt.current;
    const wait = reducedMotion || shown === null ? 0 : Math.max(0, shown + QUOTE_HOLD_MS - performance.now());
    if (wait === 0) { setReady(true); return undefined; }
    const timer = window.setTimeout(() => setReady(true), wait);
    return () => window.clearTimeout(timer);
  }, [visualReady, ready, reducedMotion]);

  useEffect(() => {
    if (!ready || revealed) return undefined;
    if (reducedMotion || quoteAt.current === null) { setRevealed(true); return undefined; }
    const timer = window.setTimeout(() => setRevealed(true), QUOTE_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [ready, revealed, reducedMotion]);

  const markVisualReady = useCallback(() => setVisualReady(true), []);
  return { ready, revealed, markVisualReady };
}
