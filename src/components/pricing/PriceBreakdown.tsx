import React from 'react';
import { Tag, DollarSign } from 'lucide-react';
import { usd } from '@/lib/pricing';

/**
 * Shared, site-wide pricing summary UI.
 *
 * This is the single approved style for displaying price breakdowns across
 * /design, /google-ads-banner, and any other
 * pricing surface. All input data must come pre-computed from the shared
 * pricing engines (banner / yard-sign / car-magnet) so that the same
 * configuration always renders the same numbers everywhere.
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
  /** Header heading shown above the big price (e.g. "Your Instant Quote"). */
  heading?: string;
  /** Header subheading (small caption under heading). */
  subheading?: string;
  /** When true, render a soft yellow header with icon. */
  showHeader?: boolean;

  /** Centered top-summary primary line, e.g. "8.00 sq ft • $4.50 per sq ft" */
  topLine: string;
  /** Centered top-summary secondary line, e.g. "for 2 banners" */
  secondaryLine?: string;
  /** When false, hides the top summary text block above the divider. */
  showTopSummary?: boolean;

  /** Optional small detail rows shown above the breakdown, e.g. Material/Print/Quantity. */
  detailRows?: PriceBreakdownDetailRow[];

  /** Base subtotal before any discounts (cents). Required. */
  baseSubtotalCents: number;
  /** Label for the base subtotal row. Defaults to "Base subtotal". */
  baseSubtotalLabel?: string;

  /** Add-on rows (rope, pole pockets, stakes, etc.). Hidden when empty / zero. */
  addOns?: PriceBreakdownAddon[];

  /** Quantity discount (positive cents amount; rendered as -$X.XX in green). */
  quantityDiscountCents?: number;
  /** Quantity discount rate (0..1). When set, label includes "(N% off)". */
  quantityDiscountRate?: number;

  /** Promo discount (positive cents amount; rendered as -$X.XX in green). */
  promoDiscountCents?: number;
  /** Promo discount rate (0..1). When set, label includes "(N% off)". */
  promoDiscountRate?: number;
  /** Promo code label (e.g., "BOTF20"). */
  promoDiscountCode?: string;

  /** Optional minimum-order adjustment row (positive cents). */
  minOrderAdjustmentCents?: number;

  /** Tax (cents). */
  taxCents: number;
  /** Tax rate 0..1; controls label like "Tax (6%)". */
  taxRate?: number;

  /** Adjusted subtotal (after discounts, before tax) in cents. */
  adjustedSubtotalCents: number;
  /** Total with tax (cents) — visually emphasized. */
  totalCents: number;

  /** Optional promo input below the breakdown. */
  promo?: PriceBreakdownPromo;

  /** Footer note (e.g. "Tax calculated at checkout"). */
  footerNote?: string;

  /** Class name on outer container. */
  className?: string;
}

/**
 * Compact, polished pricing summary card. Fully responsive; no overflow on
 * mobile. All data should come from a normalized pricing engine output.
 */
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
  taxCents,
  taxRate = 0.06,
  adjustedSubtotalCents,
  totalCents,
  promo,
  footerNote = 'Tax calculated at checkout',
  className = '',
}) => {
  const taxLabel = `Tax${taxRate ? ` (${Math.round(taxRate * 100)}%)` : ''}`;
  const quantityDiscountLabel = `Quantity discount${
    quantityDiscountRate ? ` (${Math.round(quantityDiscountRate * 100)}% off)` : ''
  }`;
  const promoDiscountLabel = `Promo${promoDiscountCode ? ` ${promoDiscountCode}` : ''}${
    promoDiscountRate ? ` (${Math.round(promoDiscountRate * 100)}% off)` : ''
  }`;

  const visibleAddOns = (addOns || []).filter(a => a && a.amountCents > 0);
  const hasQuantityDiscount = quantityDiscountCents > 0;
  const hasPromoDiscount = promoDiscountCents > 0;
  const hasMinOrderAdjustment = minOrderAdjustmentCents > 0;
  const hasDetailRows = Boolean(detailRows && detailRows.length > 0);

  return (
    <div
      className={`bg-white border border-slate-300 rounded-xl overflow-hidden ${className}`}
      style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)' }}
      data-testid="price-breakdown"
    >
      {showHeader && (heading || subheading) && (
        <div
          className="px-6 py-5 border-b border-slate-200"
          style={{
            background:
              'linear-gradient(180deg, #fefce8 0%, #fef9c3 50%, #fef08a 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div className="text-center">
            <div className="inline-flex items-center gap-3 mb-2">
              <div className="relative">
                <div
                  className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg"
                  style={{ boxShadow: '0 6px 16px rgba(249,115,22,0.5)' }}
                >
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full shadow-sm animate-pulse border-2 border-white" />
              </div>
              {heading && (
                <h3 className="text-2xl font-bold text-slate-900">{heading}</h3>
              )}
            </div>
            {subheading && (
              <p className="text-sm text-slate-600 font-medium">{subheading}</p>
            )}
          </div>
        </div>
      )}

      <div
        className="p-6 sm:p-8"
        style={{ background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)' }}
      >
        {/* SECTION A — Top summary (centered, large total) */}
        <div className="text-center mb-6">
          <div
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.08)' }}
          >
            {usd(totalCents / 100)}
          </div>
        </div>

        {/* SECTION B — Boxed breakdown panel */}
        <div
          className="rounded-xl p-4 sm:p-5 space-y-2"
          style={{
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
            boxShadow:
              'inset 0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
            border: '1px solid rgba(148,163,184,0.3)',
          }}
        >
          {/* Centered top summary line(s) */}
          {showTopSummary && (
            <>
              <p className="font-bold text-gray-800 text-center break-words">{topLine}</p>
              {secondaryLine && (
                <p className="text-sm text-gray-600 font-medium text-center break-words">
                  {secondaryLine}
                </p>
              )}
            </>
          )}

          {/* Optional configuration detail rows */}
          {hasDetailRows && (
            <div className={`${showTopSummary ? 'pt-3 mt-2 border-t border-slate-300/60' : ''} space-y-1 text-sm text-gray-700`}>
              {detailRows.map((row, idx) => (
                <div
                  key={`${row.label}-${idx}`}
                  className="flex justify-between gap-3"
                >
                  <span className="text-gray-600">{row.label}</span>
                  <span className="font-medium text-gray-800 text-right">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Breakdown rows */}
          <div className={`${showTopSummary || hasDetailRows ? 'pt-3 mt-2 border-t border-slate-300/60' : ''} space-y-1.5 text-sm`}>
            <div className="flex justify-between gap-3">
              <span className="text-gray-600">{baseSubtotalLabel}</span>
              <span className="font-semibold text-gray-800">
                {usd(baseSubtotalCents / 100)}
              </span>
            </div>

            {visibleAddOns.map((addon, idx) => (
              <div
                key={`${addon.label}-${idx}`}
                className="flex justify-between gap-3"
              >
                <span className="text-gray-600">{addon.label}</span>
                <span className="font-semibold text-gray-800">
                  {usd(addon.amountCents / 100)}
                </span>
              </div>
            ))}

            {hasQuantityDiscount && (
              <div className="flex justify-between gap-3 text-green-700">
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  {quantityDiscountLabel}
                </span>
                <span className="font-semibold">
                  -{usd(quantityDiscountCents / 100)}
                </span>
              </div>
            )}

            {hasPromoDiscount && (
              <div className="flex justify-between gap-3 text-green-700">
                <span className="flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  {promoDiscountLabel}
                </span>
                <span className="font-semibold">
                  -{usd(promoDiscountCents / 100)}
                </span>
              </div>
            )}

            {hasMinOrderAdjustment && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-600">Minimum order adjustment</span>
                <span className="font-semibold text-gray-800">
                  {usd(minOrderAdjustmentCents / 100)}
                </span>
              </div>
            )}

            <div className="flex justify-between gap-3">
              <span className="text-gray-600">{taxLabel}</span>
              <span className="font-semibold text-gray-800">
                {usd(taxCents / 100)}
              </span>
            </div>

            <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-slate-300/60">
              <span className="font-bold text-gray-800">Adjusted subtotal</span>
              <span className="font-bold text-gray-800">
                {usd(adjustedSubtotalCents / 100)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-gray-800">Total with tax</span>
              <span className="font-bold text-[#ff6b35]">
                {usd(totalCents / 100)}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION C — Promo input */}
        {promo && (
          <div className="mt-4">
            {!promo.applied ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promo.code}
                  onChange={e => promo.onCodeChange(e.target.value.toUpperCase())}
                  placeholder="Promo Code"
                  className="flex-1 min-w-0 border rounded-xl px-3 py-2 text-base"
                />
                <button
                  type="button"
                  onClick={promo.onApply}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium whitespace-nowrap"
                >
                  Apply
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <span className="text-sm font-semibold text-green-800 flex items-center gap-1.5 min-w-0">
                  <Tag className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {promo.appliedLabel || `${promo.code} applied`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={promo.onRemove}
                  className="text-xs text-red-500 hover:text-red-700 font-medium whitespace-nowrap"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {footerNote && (
          <p className="text-xs text-gray-400 mt-4 text-center">{footerNote}</p>
        )}
      </div>
    </div>
  );
};

export default PriceBreakdown;
