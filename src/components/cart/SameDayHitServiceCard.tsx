import React, { useEffect, useRef } from 'react';
import { Clock, Zap } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/components/ui/use-toast';
import { useSameDayService } from '@/hooks/useSameDayService';
import { computeSameDayFeesCents } from '@/lib/sameDayService';
import { getSameDayKeyForProduct } from '@/lib/sameDayConfig';
import { sameDayConfig } from '@/lib/sameDayConfig';
import { usd } from '@/lib/pricing';

export interface SameDayHitServiceCardProps {
  /**
   * `default` — full upsell card used in the cart / checkout summary.
   * `compact` — slimmer version used inside product-page order summaries.
   */
  variant?: 'default' | 'compact';
  /**
   * Optional product-page preview subtotal in cents. When provided (and the
   * window is open), the card renders the selectable option using this value
   * to compute the fee preview, so the customer can opt in before adding the
   * item to the cart. The cart store will recompute the authoritative fee
   * once the item is in the cart.
   */
  previewSubtotalCents?: number;
  /**
   * When `false`, the compact product-page card renders a disabled hint
   * explaining the option will become available once the order details are
   * complete. Has no effect on the default variant.
   */
  previewHasPrice?: boolean;
}

/**
 * Same-Day Hit Service upsell card.
 *
 * - Production priority upsell — NOT shipping. Standard offer (24-hour
 *   production + free next-day air) is unchanged and is reinforced in the
 *   copy here so customers don't perceive standard service as worse.
 * - Default behavior is ALWAYS unchecked — the option is never auto-selected.
 *   Eligibility only controls whether the option is shown / available.
 * - Single checkbox row (no duplicate checkbox + button) to avoid confusion.
 * - When the ET cutoff has passed, the card is replaced with a disabled
 *   notice. Any previously selected flags are cleared via the cart store's
 *   reconciler and a toast is shown.
 */
const SameDayHitServiceCard: React.FC<SameDayHitServiceCardProps> = ({
  variant = 'default',
  previewSubtotalCents,
  previewHasPrice = true,
}) => {
  const items = useCartStore((s) => s.items);
  const sameDayHitService = useCartStore((s) => s.sameDayHitService);
  const saturdayDelivery = useCartStore((s) => s.saturdayDelivery);
  const setSameDayHitService = useCartStore((s) => s.setSameDayHitService);
  const setSaturdayDelivery = useCartStore((s) => s.setSaturdayDelivery);
  const reconcileSameDayHitService = useCartStore((s) => s.reconcileSameDayHitService);
  const { toast } = useToast();

  const evalResult = useSameDayService(items as any);
  const isCompact = variant === 'compact';

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

  // Closed-window state: render a disabled notice. Reinforce that standard
  // service (24h production + free next-day air) still applies so customers
  // don't feel the standard offer is worse.
  if (!evalResult.windowOpen) {
    // For the default variant, if the cart has nothing eligible at all, hide
    // entirely to reduce noise on the cart/checkout page. Compact variants on
    // product pages always show the closed notice so customers learn the
    // option exists earlier in the day.
    if (
      !isCompact &&
      !items.some((i) => !!getSameDayKeyForProduct(i.product_type))
    ) {
      return null;
    }
    return (
      <div
        className={`rounded-xl border border-slate-200 bg-slate-50 ${
          isCompact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'
        } opacity-90`}
        data-testid="same-day-hit-service-card-closed"
      >
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <h3 className={`font-semibold text-slate-700 ${isCompact ? 'text-sm' : 'text-sm'}`}>
              Same-Day Hit Service
            </h3>
            <p className={`text-slate-500 mt-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
              Same-Day Hit Service is available on eligible orders before 12:00 PM ET. Standard
              24-hour production and free next-day air shipping still apply.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Window is open. For the default (cart/checkout) variant, hide entirely
  // when there is nothing eligible in the cart (e.g. only design deposits).
  if (!isCompact && !evalResult.hasEligibleItem) {
    return null;
  }

  // Compact (product-page) variant: if the page hasn't computed a price yet,
  // render a disabled hint so the customer knows the option is coming.
  if (isCompact && !previewHasPrice) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 opacity-90"
        data-testid="same-day-hit-service-card-pending"
      >
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Same-Day Hit Service</h3>
            <p className="text-xs text-slate-500 mt-1">
              Same-Day Hit Service may be available after you upload artwork and complete your
              order details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Pick the subtotal used for fee preview. On product pages, prefer the
  // page-supplied value because the item isn't in the cart yet. On cart /
  // checkout, fall back to the cart's eligible subtotal.
  const subtotalForPreview =
    isCompact && typeof previewSubtotalCents === 'number'
      ? previewSubtotalCents
      : evalResult.eligibleSubtotalCents;

  const fees = computeSameDayFeesCents(subtotalForPreview, {
    sameDay: true,
    saturday: false,
  });
  const feeDisplay = usd(fees.sameDayFeeCents / 100);

  // Compact (product-page) variant — single checkbox row, branded accent.
  if (isCompact) {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3 sm:p-4 shadow-sm"
        data-testid="same-day-hit-service-card-compact"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-full bg-amber-100 p-1.5">
            <Zap className="h-4 w-4 text-amber-700" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Want this to ship today?</h3>
            <p className="text-xs text-slate-700 mt-1">
              Your standard order still includes 24-hour production and free next-day air
              shipping. Add Same-Day Hit Service if you want this order prioritized to ship today.
            </p>

            <label className="mt-3 flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  checked={sameDayHitService}
                  onChange={(e) => setSameDayHitService(e.target.checked)}
                  aria-label="Add Same-Day Hit Service"
                />
                <span className="font-semibold">Add Same-Day Hit Service</span>
              </span>
              <span className="font-bold text-amber-700 text-sm whitespace-nowrap">
                +{feeDisplay}
              </span>
            </label>

            <p className="text-[11px] text-slate-500 mt-2">Available before 12:00 PM ET.</p>
          </div>
        </div>
      </div>
    );
  }

  // Default (cart / checkout) variant.
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
            Standard orders are still printed within 24 hours and shipped free via next-day air.
            Add Same-Day Hit Service only if you want us to prioritize production so this order
            can ship today.
          </p>

          <div className="mt-4 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="flex items-center gap-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  checked={sameDayHitService}
                  onChange={(e) => setSameDayHitService(e.target.checked)}
                  aria-label="Add Same-Day Hit Service"
                />
                <span className="font-semibold">Add Same-Day Hit Service</span>
              </span>
              <span className="font-bold text-amber-700 whitespace-nowrap">+{feeDisplay}</span>
            </label>

            {sameDayHitService && evalResult.saturdayEligible && (
              <label className="flex items-center justify-between gap-3 cursor-pointer select-none pl-7">
                <span className="flex items-center gap-3 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    checked={saturdayDelivery}
                    onChange={(e) => setSaturdayDelivery(e.target.checked)}
                    aria-label="Add Saturday Delivery"
                  />
                  <span className="font-semibold">Add Saturday Delivery</span>
                </span>
                <span className="font-bold text-amber-700 whitespace-nowrap">
                  +{usd(sameDayConfig.saturdayDeliveryFee)}
                </span>
              </label>
            )}
          </div>

          <p className="text-xs text-slate-500 mt-3">
            Available on eligible orders before 12:00 PM ET.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SameDayHitServiceCard;
