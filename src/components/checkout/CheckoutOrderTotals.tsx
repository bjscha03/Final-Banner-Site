import React from 'react';
import { CircleCheck, Tag } from 'lucide-react';
import { usd } from '@/lib/pricing';

export interface CheckoutOrderTotalsProps {
  subtotalCents: number;
  minOrderAdjustmentCents?: number;
  discountAmountCents?: number;
  discountLabel?: string;
  discountHelperMessage?: string;
  shippingLabel: string;
  taxCents: number;
  taxRate?: number;
  sameDayFeeCents?: number;
  saturdayFeeCents?: number;
  totalCents: number;
}

/**
 * The single authoritative order-level pricing summary shown at checkout.
 * Every amount is supplied by the cart store; this component only formats the
 * already-computed values and never recalculates checkout pricing.
 */
const CheckoutOrderTotals: React.FC<CheckoutOrderTotalsProps> = ({
  subtotalCents,
  minOrderAdjustmentCents = 0,
  discountAmountCents = 0,
  discountLabel = 'Discount',
  discountHelperMessage,
  shippingLabel,
  taxCents,
  taxRate = 0.06,
  sameDayFeeCents = 0,
  saturdayFeeCents = 0,
  totalCents,
}) => {
  const itemSubtotalCents = Math.max(0, subtotalCents - minOrderAdjustmentCents);
  const taxLabel = `Tax (${Math.round(taxRate * 100)}%)`;

  return (
    <section
      aria-labelledby="checkout-price-details-heading"
      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-inner sm:p-5"
      data-testid="checkout-order-totals"
    >
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h3 id="checkout-price-details-heading" className="text-base font-bold text-[#0B1F3A] sm:text-lg">
            Price details
          </h3>
          <p className="text-xs text-slate-500">Complete total, including tax</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">USD</span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Subtotal</span>
          <span className="whitespace-nowrap font-semibold text-slate-800">
            {usd(itemSubtotalCents / 100)}
          </span>
        </div>

        {minOrderAdjustmentCents > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-600">Minimum order adjustment</span>
            <span className="whitespace-nowrap font-semibold text-slate-800">
              {usd(minOrderAdjustmentCents / 100)}
            </span>
          </div>
        )}

        {discountAmountCents > 0 && (
          <>
            <div className="flex justify-between gap-4 text-green-700">
              <span className="flex min-w-0 items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{discountLabel}</span>
              </span>
              <span className="whitespace-nowrap font-semibold">
                -{usd(discountAmountCents / 100)}
              </span>
            </div>
            {discountHelperMessage && (
              <p className="text-xs italic leading-4 text-slate-500">{discountHelperMessage}</p>
            )}
          </>
        )}

        <div className="flex justify-between gap-4">
          <span className="text-slate-600">{shippingLabel}</span>
          {sameDayFeeCents > 0 ? (
            <span className="whitespace-nowrap font-semibold text-slate-700">Next-Day Air Included</span>
          ) : (
            <span className="flex items-center gap-1 whitespace-nowrap font-semibold text-green-700">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
              FREE
            </span>
          )}
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-600">{taxLabel}</span>
          <span className="whitespace-nowrap font-semibold text-slate-800">{usd(taxCents / 100)}</span>
        </div>

        {sameDayFeeCents > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-600">Same-Day Hit Service</span>
            <span className="whitespace-nowrap font-semibold text-slate-800">
              {usd(sameDayFeeCents / 100)}
            </span>
          </div>
        )}

        {saturdayFeeCents > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-600">Saturday Delivery</span>
            <span className="whitespace-nowrap font-semibold text-slate-800">
              {usd(saturdayFeeCents / 100)}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-end justify-between gap-4 border-t-2 border-slate-300 pt-3">
          <div>
            <p className="font-bold text-[#0B1F3A]">Final total</p>
            <p className="text-[11px] text-slate-500">Tax included</p>
          </div>
          <span className="whitespace-nowrap text-xl font-black text-[#FF6A00] sm:text-2xl">
            {usd(totalCents / 100)}
          </span>
        </div>
      </div>
    </section>
  );
};

export default CheckoutOrderTotals;
