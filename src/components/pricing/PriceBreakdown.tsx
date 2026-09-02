import React from 'react';
import { Tag, DollarSign, Truck } from 'lucide-react';
import { usd } from '@/lib/pricing';
import {
  LARGE_BANNER_PROMO_ID,
  LARGE_BANNER_PROMO_LABEL,
  LARGE_BANNER_PROMO_PERCENTAGE,
} from '@/lib/discount-resolver';

/**
 * Shared, site-wide pricing summary UI.
 *
 * All numbers are pre-computed by the shared pricing/discount engines. This
 * component only controls presentation and never recalculates eligibility.
 */

export interface PriceBreakdownAddon {
  label: string;
  amountCents: number;
}

export interface PriceBreakdownDetailRow {
  label: string;
  value: React.ReactNode;
}

export interface PriceBreakdownPromo {
  code: string;
  applied: boolean;
  onCodeChange: (code: string) => void;
  onApply: () => void;
  onRemove: () => void;
  appliedLabel?: string;
}

export interface PriceBreakdownProps {
  heading?: string;
  subheading?: string;
  showHeader?: boolean;
  topLine: string;
  secondaryLine?: string;
  showTopSummary?: boolean;
  detailRows?: PriceBreakdownDetailRow[];
  baseSubtotalCents: number;
  baseSubtotalLabel?: string;
  addOns?: PriceBreakdownAddon[];
  quantityDiscountCents?: number;
  quantityDiscountRate?: number;
  promoDiscountCents?: number;
  promoDiscountRate?: number;
  promoDiscountCode?: string;
  minOrderAdjustmentCents?: number;
  sameDayHitServiceCents?: number;
  taxCents: number;
  taxRate?: number;
  adjustedSubtotalCents: number;
  totalCents: number;
  promo?: PriceBreakdownPromo;
  footerNote?: string;
  taxCalculatedAtCheckout?: boolean;
  className?: string;
}

const PriceBreakdown: React.FC<PriceBreakdownProps> = ({
  heading,
  subheading,
  showHeader = false,
  topLine,
  secondaryLine,
  showTopSummary = true,
  detailRows,
  baseSubtotalCents,
  baseSubtotalLabel = 'Base subtotal',
  addOns,
  quantityDiscountCents = 0,
  quantityDiscountRate,
  promoDiscountCents = 0,
  promoDiscountRate,
  promoDiscountCode,
  minOrderAdjustmentCents = 0,
  sameDayHitServiceCents = 0,
  taxCents,
  taxRate = 0.06,
  adjustedSubtotalCents,
  totalCents,
  promo,
  footerNote = 'Tax calculated at checkout',
  taxCalculatedAtCheckout = false,
  className = '',
}) => {
  const taxLabel = `Tax${taxRate ? ` (${Math.round(taxRate * 100)}%)` : ''}`;
  const quantityDiscountLabel = `Quantity discount${
    quantityDiscountRate ? ` (${Math.round(quantityDiscountRate * 100)}% off)` : ''
  }`;
  const isAutomaticLargeBannerPromotion =
    promoDiscountCode === LARGE_BANNER_PROMO_ID && promoDiscountCents > 0;
  const promoDiscountLabel = isAutomaticLargeBannerPromotion
    ? LARGE_BANNER_PROMO_LABEL
    : `Promo${promoDiscountCode ? ` ${promoDiscountCode}` : ''}${
        promoDiscountRate ? ` (${Math.round(promoDiscountRate * 100)}% off)` : ''
      }`;

  const hasSameDayFee = sameDayHitServiceCents > 0;
  const shippingNote = hasSameDayFee
    ? 'Same-Day production priority selected. Next-day air shipping is still included.'
    : 'Most standard orders are produced within 24 hours; free next-day air begins after production.';
  const shippingValueLabel = hasSameDayFee ? 'Next-Day Air Included' : 'FREE';
  const baseFooterNote = footerNote || '';
  const composedFooterNote = hasSameDayFee
    ? ['Next-Day Air Included', 'Same-Day production priority selected', baseFooterNote]
        .filter(Boolean)
        .join(' • ')
    : ['Free Next-Day Air After Production', baseFooterNote].filter(Boolean).join(' • ');

  const visibleAddOns = (addOns || []).filter((addon) => addon && addon.amountCents > 0);
  const hasQuantityDiscount = quantityDiscountCents > 0;
  const hasPromoDiscount = promoDiscountCents > 0;
  const hasMinOrderAdjustment = minOrderAdjustmentCents > 0;
  const hasDetailRows = Boolean(detailRows && detailRows.length > 0);
  const originalHeadlineTotalCents = isAutomaticLargeBannerPromotion
    ? totalCents + promoDiscountCents
    : totalCents;

  const detailRowsContainerClass = [
    showTopSummary ? 'pt-3 mt-2 border-t border-slate-300/60' : '',
    'space-y-1 text-sm text-gray-700',
  ]
    .filter(Boolean)
    .join(' ');
  const breakdownRowsClass = [
    showTopSummary || hasDetailRows ? 'pt-3 mt-2 border-t border-slate-300/60' : '',
    'space-y-1.5 text-sm',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-300 bg-white ${className}`}
      style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)' }}
      data-testid="price-breakdown"
    >
      {showHeader && (heading || subheading) && (
        <div
          className="border-b border-slate-200 px-6 py-5"
          style={{
            background: 'linear-gradient(180deg, #fefce8 0%, #fef9c3 50%, #fef08a 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div className="text-center">
            <div className="mb-2 inline-flex items-center gap-3">
              <div className="relative">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg"
                  style={{ boxShadow: '0 6px 16px rgba(249,115,22,0.5)' }}
                >
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
                <div className="absolute -right-1 -top-1 h-4 w-4 animate-pulse rounded-full border-2 border-white bg-green-500 shadow-sm" />
              </div>
              {heading && <h3 className="text-2xl font-bold text-slate-900">{heading}</h3>}
            </div>
            {subheading && <p className="text-sm font-medium text-slate-600">{subheading}</p>}
          </div>
        </div>
      )}

      <div
        className="p-6 sm:p-8"
        style={{ background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)' }}
      >
        {/* Primary price. Automatic large-banner savings use the approved navy,
            gray strike-through, orange accent and green savings hierarchy. */}
        <div className="mb-6 text-center" aria-live="polite">
          {isAutomaticLargeBannerPromotion ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <span
                  className="text-4xl font-extrabold leading-tight text-[#0b2a5b] sm:text-5xl md:text-6xl"
                  data-testid="discounted-price"
                >
                  {usd(totalCents / 100)}
                </span>
                <span
                  className="text-2xl font-semibold text-slate-400 line-through decoration-2 sm:text-3xl"
                  data-testid="original-price"
                >
                  {usd(originalHeadlineTotalCents / 100)}
                </span>
                <span className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-extrabold text-white shadow-sm sm:text-base">
                  {LARGE_BANNER_PROMO_PERCENTAGE}% OFF
                </span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm font-bold text-emerald-700 sm:text-base">
                <Tag className="h-4 w-4" aria-hidden="true" />
                <span>
                  You save {usd(promoDiscountCents / 100)} ({LARGE_BANNER_PROMO_PERCENTAGE}%)
                </span>
              </div>
            </>
          ) : (
            <div
              className="text-4xl font-bold leading-tight text-[#0b2a5b] sm:text-5xl md:text-6xl"
              style={{ textShadow: '0 2px 4px rgba(0,0,0,0.08)' }}
            >
              {usd(totalCents / 100)}
            </div>
          )}
        </div>

        <div
          className="space-y-2 rounded-xl p-4 sm:p-5"
          style={{
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
            border: '1px solid rgba(148,163,184,0.3)',
          }}
        >
          {showTopSummary && (
            <>
              <p className="break-words text-center font-bold text-gray-800">{topLine}</p>
              {secondaryLine && (
                <p className="break-words text-center text-sm font-medium text-gray-600">
                  {secondaryLine}
                </p>
              )}
            </>
          )}

          {hasDetailRows && (
            <div className={detailRowsContainerClass}>
              {detailRows!.map((row, idx) => (
                <div key={`${row.label}-${idx}`} className="flex justify-between gap-3">
                  <span className="text-gray-600">{row.label}</span>
                  <span className="text-right font-medium text-gray-800">{row.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className={breakdownRowsClass}>
            <div className="flex justify-between gap-3">
              <span className="text-gray-600">{baseSubtotalLabel}</span>
              <span
                className={`font-semibold text-gray-800 ${
                  isAutomaticLargeBannerPromotion ? 'line-through decoration-2 decoration-slate-500' : ''
                }`}
              >
                {usd(baseSubtotalCents / 100)}
              </span>
            </div>

            {visibleAddOns.map((addon, idx) => (
              <div key={`${addon.label}-${idx}`} className="flex justify-between gap-3">
                <span className="text-gray-600">{addon.label}</span>
                <span className="font-semibold text-gray-800">{usd(addon.amountCents / 100)}</span>
              </div>
            ))}

            {hasQuantityDiscount && (
              <div className="flex justify-between gap-3 text-green-700">
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  {quantityDiscountLabel}
                </span>
                <span className="font-semibold">-{usd(quantityDiscountCents / 100)}</span>
              </div>
            )}

            {hasPromoDiscount && (
              <div className="flex justify-between gap-3 text-green-700" data-testid="promotion-discount-row">
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  {promoDiscountLabel}
                </span>
                <span className="font-semibold">-{usd(promoDiscountCents / 100)}</span>
              </div>
            )}

            {hasMinOrderAdjustment && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-600">Minimum order adjustment</span>
                <span className="font-semibold text-gray-800">{usd(minOrderAdjustmentCents / 100)}</span>
              </div>
            )}

            {hasSameDayFee && (
              <div className="flex justify-between gap-3 text-amber-700">
                <span className="font-medium">Same-Day Hit Service</span>
                <span className="font-semibold">+{usd(sameDayHitServiceCents / 100)}</span>
              </div>
            )}

            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between gap-3">
                <span className={`flex items-center gap-1.5 font-medium ${hasSameDayFee ? 'text-slate-700' : 'text-green-700'}`}>
                  <Truck className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                  Shipping
                </span>
                <span className={`font-semibold ${hasSameDayFee ? 'text-slate-700' : 'text-green-700'}`}>
                  {shippingValueLabel}
                </span>
              </div>
              <p className="pl-5 text-[11px] leading-tight text-slate-500">{shippingNote}</p>
            </div>

            {!taxCalculatedAtCheckout && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-600">{taxLabel}</span>
                <span className="font-semibold text-gray-800">{usd(taxCents / 100)}</span>
              </div>
            )}

            {!taxCalculatedAtCheckout && (
              <div className="mt-1 flex justify-between gap-3 border-t border-slate-300/60 pt-2">
                <span className="font-bold text-gray-800">Adjusted subtotal</span>
                <span className="font-bold text-gray-800">{usd(adjustedSubtotalCents / 100)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between gap-3 border-t border-slate-300/60 pt-2">
              <span className="font-bold text-gray-800">
                {taxCalculatedAtCheckout ? 'Subtotal before tax' : 'Total with tax'}
              </span>
              <span className="font-bold text-[#0b2a5b]">{usd(totalCents / 100)}</span>
            </div>
          </div>
        </div>

        {promo && (
          <div className="mt-4">
            {!promo.applied ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promo.code}
                  onChange={(event) => promo.onCodeChange(event.target.value.toUpperCase())}
                  placeholder="Promo Code"
                  aria-label="Promo code"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-base"
                />
                <button
                  type="button"
                  onClick={promo.onApply}
                  className="whitespace-nowrap rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200"
                >
                  Apply
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-green-800">
                  <Tag className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{promo.appliedLabel || `${promo.code} applied`}</span>
                </span>
                <button
                  type="button"
                  onClick={promo.onRemove}
                  className="whitespace-nowrap text-xs font-medium text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {composedFooterNote && (
          <p className="mt-4 text-center text-xs text-gray-400">{composedFooterNote}</p>
        )}
      </div>
    </div>
  );
};

export default PriceBreakdown;
