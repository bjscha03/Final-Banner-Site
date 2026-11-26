import { useEffect, useState } from 'react';
import { isThanksgivingOrderWindow } from '@/lib/delivery/cutoffs';
import { etPartsOf } from '@/lib/delivery/timezone';

/** Hydrate without stale build-time dates, then refresh across ET boundaries. */
export function useThanksgivingSchedule(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const refresh = () => setActive(isThanksgivingOrderWindow(etPartsOf(new Date()).ymd));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return active;
}
