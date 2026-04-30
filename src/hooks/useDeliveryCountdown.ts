import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DeliveryEstimate,
  getDeliveryEstimate,
  nowET,
} from '@/lib/delivery';

export interface UseDeliveryCountdownOptions {
  /** Whether the customer has currently selected HIT. */
  isHitSelected?: boolean;
  /** Optional override for the tick interval (ms). Defaults to 1000. */
  tickMs?: number;
}

export interface UseDeliveryCountdownResult {
  /** Live delivery estimate, recomputed every tick. */
  estimate: DeliveryEstimate;
  /** Milliseconds remaining until `estimate.cutoffTime`. Clamped at zero. */
  remainingMs: number;
  /** Convenience flag — true while the HIT window is open AND not weekend-locked. */
  hitAvailable: boolean;
  /** True when the timer has crossed zero since the last render. */
  expired: boolean;
}

/**
 * Drives the dynamic delivery timer UI. Re-evaluates the engine on every
 * tick (default 1s), on `visibilitychange` (so a backgrounded tab catches
 * up on return) and whenever `isHitSelected` flips.
 *
 * Edge cases handled:
 *   - Timer reaches zero: next tick re-runs the engine, which naturally
 *     promotes the UI to the next state (standard → HIT close → weekend).
 *   - Tab in background for hours: visibilitychange listener forces a
 *     recompute on focus rather than relying on the drifted interval.
 *   - HIT toggle: included in the dependency array so a fresh estimate
 *     is computed synchronously on the next render.
 */
export function useDeliveryCountdown(options: UseDeliveryCountdownOptions = {}): UseDeliveryCountdownResult {
  const { isHitSelected = false, tickMs = 1000 } = options;
  const [tick, setTick] = useState<number>(() => Date.now());

  // Tick every `tickMs`.
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  // Resync on visibility change (handles long backgrounded tabs).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        setTick(Date.now());
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const estimate = useMemo<DeliveryEstimate>(
    () => getDeliveryEstimate({ nowET: nowET(), isHitSelected }),
    // `tick` is intentionally a dependency so we recompute every interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, isHitSelected],
  );

  const remainingMs = Math.max(0, estimate.cutoffTime.getTime() - Date.now());

  // Track expiry transitions for callers that want to react once.
  const lastExpiredRef = useRef<boolean>(false);
  const expired = remainingMs === 0;
  useEffect(() => {
    lastExpiredRef.current = expired;
  }, [expired]);

  return {
    estimate,
    remainingMs,
    hitAvailable: estimate.hitAvailable,
    expired,
  };
}
