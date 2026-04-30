import { useEffect, useMemo, useState } from 'react';
import {
  evaluateSameDayEligibility,
  EvaluateResult,
  EligibilityItem,
} from '@/lib/sameDayService';

/**
 * useSameDayService — re-evaluates Same-Day Hit Service eligibility on a
 * 30s tick (so the UI flips state automatically across noon ET).
 *
 * Pass the cart items so we can also surface the eligible subtotal for fee
 * preview in the upsell card.
 */
export function useSameDayService(items: EligibilityItem[]): EvaluateResult {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(
    () => evaluateSameDayEligibility({ now, items }),
    // re-evaluate when items change (qty/size/product) or the tick advances
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, JSON.stringify(items.map((i) => [i.product_type, i.quantity, i.line_total_cents]))],
  );
}
