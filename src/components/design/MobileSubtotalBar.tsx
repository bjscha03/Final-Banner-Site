import type { ReactNode } from 'react';

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
            {subtotal}
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
