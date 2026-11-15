import { useEffect, useState } from 'react';

const QUERY = '(max-width: 480px)';

const matches = () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;

/**
 * True on small phones. Charts then use a narrower drawing area so their SVG text is not shrunk
 * to an unreadable size when the 680-unit drawing is scaled down to a 390 px screen.
 */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setNarrow(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);
  return narrow;
}
