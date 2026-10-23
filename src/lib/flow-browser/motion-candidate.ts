import { useEffect, useState } from 'react';

export type ReaderMotion = 'current' | 'liquid-live';

/** Only an explicit preview URL exposes the candidate controls. */
export function readMotionCandidate(search: string): ReaderMotion | null {
  const mode = new URLSearchParams(search).get('motion');
  return mode === 'liquid' ? 'liquid-live' : mode === 'current' ? 'current' : null;
}

export function preserveMotionCandidate(url: URL, search: string) {
  const mode = readMotionCandidate(search);
  if (mode !== null) url.searchParams.set('motion', mode === 'liquid-live' ? 'liquid' : 'current');
  return url;
}

export function useMotionCandidate() {
  const [mode, setMode] = useState<ReaderMotion | null>(null);
  useEffect(() => {
    const update = () => setMode(readMotionCandidate(window.location.search));
    update();
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  return {
    available: mode !== null,
    variant: mode ?? 'current',
    toggle() {
      if (mode === null) return;
      const next = mode === 'liquid-live' ? 'current' : 'liquid-live';
      const url = new URL(window.location.href);
      url.searchParams.set('motion', next === 'liquid-live' ? 'liquid' : 'current');
      // Preserve the reader's trail and path. Switching material neither
      // remounts the stream nor creates a navigation or stored preference.
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      setMode(next);
    },
  };
}
