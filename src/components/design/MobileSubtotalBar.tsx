import { useSyncExternalStore, type ReactNode } from 'react';
import { usd } from '@/lib/pricing';
import {
  getAutomaticPromotionDisplayServerSnapshot,
  getAutomaticPromotionDisplaySnapshot,
  subscribeAutomaticPromotionDisplay,
} from '@/lib/automaticPromotionDisplay';

export interface MobileSubtotalBarProps {
  subtotal: ReactNode;
  priceNote?: ReactNode;
  cartItemCount: number;
  onViewCart: () => void;
}

/**
 * Shared mobile footer for both configurators. Keeping this in one component
 * prevents paid and organic traffic from receiving different mobile actions.
 */
export default function MobileSubtotalBar({
  subtotal,
  priceNote,
  cartItemCount,
  onViewCart,
}: MobileSubtotalBarProps) {
  const automaticPromotion = useSyncExternalStore(
    subscribeAutomaticPromotionDisplay,
    getAutomaticPromotionDisplaySnapshot,
    getAutomaticPromotionDisplayServerSnapshot,
  );

  const displayedSubtotal = automaticPromotion.active ? (
    <div data-testid="mobile-automatic-large-banner-price">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-gray-400 line-through decoration-2">
          {usd(automaticPromotion.originalSubtotalCents / 100)}
        </span>
        <span className="text-xl font-bold text-emerald-600">
          {usd(automaticPromotion.discountedSubtotalCents / 100)}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] font-bold leading-tight text-emerald-700">
        {automaticPromotion.label} automatically applied
      </p>
    </div>
  ) : subtotal;

  return (
    <>
      <div aria-hidden="true" className="h-24 md:hidden" />
      <div
        data-testid="mobile-subtotal-bar"
        className="fixed inset-x-0 bottom-0 z-40 overflow-x-clip border-t border-gray-200 bg-white px-4 pt-3 shadow-lg md:hidden"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
      >
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Subtotal</p>
            {displayedSubtotal}
            {priceNote ? (
              <p data-testid="mobile-subtotal-note" className="mt-0.5 text-[11px] font-medium leading-tight text-orange-700">
                {priceNote}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onViewCart}
            className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-[#18448D] transition-colors hover:bg-slate-50"
          >
            View Cart ({cartItemCount})
          </button>
        </div>
      </div>
    </>
  );
}
