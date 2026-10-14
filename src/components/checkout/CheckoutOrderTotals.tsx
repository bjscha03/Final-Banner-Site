import React, { useId } from 'react';
import { CircleCheck, Tag } from 'lucide-react';
import { usd } from '@/lib/pricing';

export interface CheckoutOrderTotalsProps {
  subtotalCents: number;
  minOrderAdjustmentCents?: number;
  discountAmountCents?: number;
  discountLabel?: string;
  discountHelperMessage?: string;
  shippingLabel: string;
  shippingPending?: boolean;
  pricingPending?: boolean;
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
  shippingPending = false,
  pricingPending = false,
  taxCents,
  taxRate = 0.06,
  sameDayFeeCents = 0,
  saturdayFeeCents = 0,
  totalCents,
}) => {
  const headingId = useId();
  const itemSubtotalCents = Math.max(0, subtotalCents - minOrderAdjustmentCents);
  const taxLabel = `Tax (${Math.round(taxRate * 100)}%)`;

  return (
    <section
      aria-labelledby={headingId}
      className="checkout-totals"
      data-testid="checkout-order-totals"
    >
      <div className="checkout-totals-heading">
        <div>
          <h3 id={headingId} className="text-base font-bold text-[#0B1F3A] sm:text-lg">
            Order total
          </h3>
          <p className={pricingPending || shippingPending ? "text-xs text-amber-800" : "sr-only"}>{pricingPending?'Selected option prices are being confirmed':shippingPending ? 'Product estimate before delivery' : 'Complete total, including tax'}</p>
        </div>
        <span className="sr-only">USD</span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Subtotal</span>
          <span className="whitespace-nowrap font-semibold text-slate-800">
            {pricingPending?'Pending':usd(itemSubtotalCents / 100)}
          </span>
        </div>

        {!pricingPending && minOrderAdjustmentCents > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-600">Minimum order adjustment</span>
            <span className="whitespace-nowrap font-semibold text-slate-800">
              {usd(minOrderAdjustmentCents / 100)}
            </span>
          </div>
        )}

        {!pricingPending && discountAmountCents > 0 && (
          <>
            <div className="flex justify-between gap-4 text-[#c94e00]">
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
          {shippingPending ? <span className="text-amber-800 font-semibold">Not yet calculated</span> : sameDayFeeCents > 0 ? (
            <span className="whitespace-nowrap font-semibold text-slate-700">Next-Day Air Included</span>
          ) : (
            <span className="flex items-center gap-1 whitespace-nowrap font-semibold text-[#c94e00]">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
              FREE
            </span>
          )}
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-slate-600">{taxLabel}</span>
          <span className="whitespace-nowrap font-semibold text-slate-800">{pricingPending?'Pending':usd(taxCents / 100)}</span>
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

        <div className="checkout-final-total">
          <div>
            <p className="font-bold text-[#0B1F3A]">Total</p>
            <p className="text-[11px] text-slate-500">Including tax and shipping</p>
          </div>
          <span className="whitespace-nowrap text-xl font-black text-[#071C35] sm:text-2xl">
            {pricingPending||shippingPending?'Pending':usd(totalCents / 100)}
          </span>
        </div>
      </div>
    </section>
  );
};

export default CheckoutOrderTotals;
