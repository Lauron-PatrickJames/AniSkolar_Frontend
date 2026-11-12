import { useEffect, useRef, useState } from 'react';

// Keeps a page's data current without a page refresh: the number goes up
// when the user comes back to the tab, and every `everyMs` while the tab is
// visible (never more than once per `minGapMs`). Put it in a load effect's
// dependencies, or reload when it changes:
//   const tick = useRefreshTick();
//   useEffect(() => { if (tick) load(); }, [tick]);
export function useRefreshTick(everyMs = 3 * 60_000, minGapMs = 30_000): number {
  const [tick, setTick] = useState(0);
  const last = useRef(Date.now());
  useEffect(() => {
    const bump = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last.current < minGapMs) return;
      last.current = Date.now();
      setTick(t => t + 1);
    };
    const timer = window.setInterval(bump, everyMs);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, [everyMs, minGapMs]);
  return tick;
}
