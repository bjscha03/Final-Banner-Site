import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usd } from '@/lib/pricing';
import ShippingBenefitBadge from '@/components/pricing/ShippingBenefitBadge';
import {
  getAutomaticPromotionDisplayServerSnapshot,
  getAutomaticPromotionDisplaySnapshot,
  subscribeAutomaticPromotionDisplay,
} from '@/lib/automaticPromotionDisplay';

export interface MobileSubtotalBarProps {
  primaryAction?: { label: string; onClick: () => void; disabled: boolean };
  subtotal: ReactNode;
  priceNote?: ReactNode;
  promotionNote?: ReactNode;
  cartItemCount: number;
  onViewCart: () => void;
}

/**
 * Shared mobile footer for both configurators. Keeping this in one component
 * prevents paid and organic traffic from receiving different mobile actions.
 */
export default function MobileSubtotalBar({
  primaryAction,
  subtotal,
  priceNote,
  promotionNote,
  cartItemCount,
  onViewCart,
}: MobileSubtotalBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState<number>();
  const automaticPromotion = useSyncExternalStore(
    subscribeAutomaticPromotionDisplay,
    getAutomaticPromotionDisplaySnapshot,
    getAutomaticPromotionDisplayServerSnapshot,
  );

  // Match the spacer to the real footer height, including wrapped prices,
  // promotion notes, larger text and iPhone safe-area padding.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const updateHeight = () => {
      const height = Math.ceil(bar.getBoundingClientRect().height);
      if (height > 0) setBarHeight(height);
    };
    updateHeight();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight);
      return () => window.removeEventListener('resize', updateHeight);
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const displayedSubtotal = automaticPromotion.active && !primaryAction ? (
    <div data-testid="mobile-automatic-large-banner-price">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
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
      <div
        aria-hidden="true"
        data-testid="mobile-subtotal-spacer"
        className={primaryAction ? 'h-40 lg:hidden' : 'h-32 md:hidden'}
        style={barHeight ? { height: barHeight } : undefined}
      />
      <div
        ref={barRef}
        data-testid="mobile-subtotal-bar"
        className={`fixed inset-x-0 bottom-0 z-40 overflow-x-clip border-t border-gray-200 bg-white px-4 pt-3 shadow-lg ${primaryAction ? 'lg:hidden' : 'md:hidden'}`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
      >
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
              <p className="text-xs text-gray-500">{primaryAction ? 'Before tax' : 'Subtotal'}</p>
              {displayedSubtotal}
            </div>
            <ShippingBenefitBadge variant="sticky" className="shrink-0" />
            {promotionNote && <p data-testid="mobile-applied-discount" className="basis-full text-[11px] font-bold leading-tight text-emerald-700">{promotionNote}</p>}
            {priceNote ? (
              <p data-testid="mobile-subtotal-note" className="basis-full text-[11px] font-medium leading-tight text-orange-700">
                {priceNote}
              </p>
            ) : null}
          </div>
          {primaryAction ? <button type="button" data-banner-primary-action onClick={primaryAction.onClick} disabled={primaryAction.disabled} className="inline-flex min-h-12 max-w-[52%] items-center justify-center rounded-lg bg-[#FF6A00] px-4 py-3 text-sm font-bold leading-snug text-[#061A31] hover:bg-[#FF6A00] focus-visible:ring-2 focus-visible:ring-[#061A31] disabled:opacity-60">{primaryAction.label}</button> : <button
            type="button"
            onClick={onViewCart}
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-[#18448D] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18448D] focus-visible:ring-offset-2"
          >
            View Cart ({cartItemCount})
          </button>}
        </div>
      </div>
    </>
  );
}
