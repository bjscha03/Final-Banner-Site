import React, { useEffect, useRef } from 'react';
import { Clock, Zap } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useSameDayService } from '@/hooks/useSameDayService';
import { computeSameDayFeesCents } from '@/lib/sameDayService';
import { sameDayConfig } from '@/lib/sameDayConfig';
import { usd } from '@/lib/pricing';

/**
 * Same-Day Hit Service upsell card.
 *
 * - Production priority upsell — NOT shipping. Standard offer wording
 *   (24-hour production + free next-day air) is unchanged elsewhere.
 * - Hidden when there are no Same-Day-eligible products in the cart.
 * - When the ET cutoff has passed, the card is replaced with a disabled
 *   notice. We also auto-clear any previously selected flags via the
 *   cart store's reconciler and surface a toast.
 */
const SameDayHitServiceCard: React.FC = () => {
  const items = useCartStore((s) => s.items);
  const sameDayHitService = useCartStore((s) => s.sameDayHitService);
  const saturdayDelivery = useCartStore((s) => s.saturdayDelivery);
  const setSameDayHitService = useCartStore((s) => s.setSameDayHitService);
  const setSaturdayDelivery = useCartStore((s) => s.setSaturdayDelivery);
  const reconcileSameDayHitService = useCartStore((s) => s.reconcileSameDayHitService);
  const { toast } = useToast();

  const evalResult = useSameDayService(items as any);

  // When the ET clock crosses noon (or eligibility is otherwise lost),
  // clear flags and notify the user exactly once per transition.
  const lastWindowOpenRef = useRef<boolean>(evalResult.windowOpen);
  useEffect(() => {
    const wasOpen = lastWindowOpenRef.current;
    lastWindowOpenRef.current = evalResult.windowOpen;
    if (wasOpen && !evalResult.windowOpen && (sameDayHitService || saturdayDelivery)) {
      const result = reconcileSameDayHitService();
      if (result.cleared) {
        toast({
          title: 'Same-Day Hit Service removed',
          description: 'Same-Day Hit Service is no longer available for today’s production window.',
        });
      }
    }
  }, [evalResult.windowOpen, sameDayHitService, saturdayDelivery, reconcileSameDayHitService, toast]);

  // Closed-window state: render a disabled notice (always visible so
  // customers understand the option exists earlier in the day).
  if (!evalResult.windowOpen) {
    // If there are no matching products at all, hide entirely to reduce noise.
    if (!items.some((i) => ['banner', 'yard_sign', 'car_magnet'].includes(i.product_type || 'banner'))) {
      return null;
    }
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 opacity-90">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Same-Day Hit Service</h3>
            <p className="text-sm text-slate-500 mt-1">
              Same-Day Hit Service is available on eligible orders before 12:00 PM ET.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Hide entirely when there is nothing eligible (e.g. only design deposits).
  if (!evalResult.hasEligibleItem) {
    return null;
  }

  const fees = computeSameDayFeesCents(evalResult.eligibleSubtotalCents, {
    sameDay: true,
    saturday: false,
  });

  return (
    <div
      className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 sm:p-5 shadow-sm"
      data-testid="same-day-hit-service-card"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-full bg-amber-100 p-2">
          <Zap className="h-5 w-5 text-amber-700" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-900">Need it to ship today?</h3>
          <p className="text-sm text-slate-700 mt-1">
            Submit your order before 12:00 PM ET and we’ll prioritize production so it can ship today.
          </p>

          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                checked={sameDayHitService}
                onChange={(e) => setSameDayHitService(e.target.checked)}
                aria-label="Add Same-Day Hit Service"
              />
              <span className="text-sm text-slate-800">
                <span className="font-semibold">Add Same-Day Hit Service</span>
                <span className="ml-2 font-bold text-amber-700">
                  {usd(fees.sameDayFeeCents / 100)}
                </span>
              </span>
            </label>

            {sameDayHitService && evalResult.saturdayEligible && (
              <label className="flex items-start gap-3 cursor-pointer select-none pl-7">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  checked={saturdayDelivery}
                  onChange={(e) => setSaturdayDelivery(e.target.checked)}
                  aria-label="Add Saturday Delivery"
                />
                <span className="text-sm text-slate-800">
                  <span className="font-semibold">Add Saturday Delivery</span>
                  <span className="ml-2 font-bold text-amber-700">
                    {usd(sameDayConfig.saturdayDeliveryFee)}
                  </span>
                </span>
              </label>
            )}
          </div>

          {!sameDayHitService && (
            <button
              type="button"
              onClick={() => setSameDayHitService(true)}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors"
            >
              Add Same-Day Hit Service — {usd(fees.sameDayFeeCents / 100)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SameDayHitServiceCard;
