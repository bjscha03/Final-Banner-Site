/**
 * Yard Sign Price Summary Card
 * 
 * Sticky right-side card showing live price breakdown for yard sign orders.
 */
import React from 'react';
import { Tag, AlertTriangle } from 'lucide-react';
import { type YardSignPricing, type YardSignDesign, YARD_SIGN_MAX_QUANTITY } from '@/lib/yard-sign-pricing';
import { usd } from '@/lib/pricing';

interface YardSignPriceSummaryProps {
  pricing: YardSignPricing;
  designs: YardSignDesign[];
  promoCode: string;
  promoApplied: boolean;
  onPromoCodeChange: (c: string) => void;
  onPromoApply: () => void;
  onPromoRemove: () => void;
}

const YardSignPriceSummary: React.FC<YardSignPriceSummaryProps> = ({
  pricing,
  designs,
  promoCode,
  promoApplied,
  onPromoCodeChange,
  onPromoApply,
  onPromoRemove,
}) => {
  const isOverLimit = pricing.totalSignQuantity > YARD_SIGN_MAX_QUANTITY;

  return (
    <div className="rounded-xl p-6 text-center" style={{ background: "#F7F8FA", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <p className="text-sm text-gray-500 mb-1">Your Price</p>

      {pricing.totalSignQuantity === 0 ? (
        <p className="text-3xl font-extrabold text-gray-300 leading-tight">—</p>
      ) : isOverLimit ? (
        <>
          <p className="text-2xl font-bold text-red-500 leading-tight">Over Limit</p>
          <p className="text-sm text-red-600 mt-1 flex items-center justify-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            Reduce to {YARD_SIGN_MAX_QUANTITY} signs or fewer
          </p>
        </>
      ) : (
        <>
          {pricing.promoDiscountRate > 0 ? (
            <>
              <p className="text-2xl text-gray-400 line-through leading-tight">{usd(pricing.subtotalCents / 100)}</p>
              <p className="text-5xl font-extrabold text-green-600 leading-tight">{usd(pricing.totalCents / 100)}</p>
              <p className="text-sm text-green-600 font-semibold mt-1">You save {usd(pricing.promoDiscountCents / 100)}!</p>
            </>
          ) : (
            <p className="text-5xl font-extrabold text-gray-900 leading-tight">{usd(pricing.totalCents / 100)}</p>
          )}
          <p className="text-base text-green-600 font-semibold mt-2">FREE Next-Day Air Included</p>
          <p className="text-sm text-gray-500 mt-1">Printed within 24 hours.</p>
          {pricing.totalSignQuantity > 0 && (
            <p className="text-sm text-gray-500 mt-1">{usd(pricing.unitPriceCents / 100)}/sign</p>
          )}
        </>
      )}

      {/* Order details */}
      {pricing.totalSignQuantity > 0 && !isOverLimit && (
        <div className="text-left text-sm text-gray-600 space-y-1 mt-4 mb-2">
          <p><strong>Product:</strong> Yard Signs</p>
          <p><strong>Size:</strong> 24&quot; × 18&quot;</p>
          <p><strong>Material:</strong> Corrugated Plastic</p>
          <p><strong>Print:</strong> {pricing.sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'}</p>
          {designs.length > 0 && (
            <p><strong>Designs:</strong> {designs.length} uploaded</p>
          )}
          <p><strong>Total Signs:</strong> {pricing.totalSignQuantity}</p>
          <p className="text-gray-500 text-xs pl-4">
            Signs: {usd(pricing.signSubtotalCents / 100)}
          </p>
          {pricing.addStepStakes && (
            <>
              <p><strong>Step Stakes:</strong> {pricing.stepStakeQuantity}</p>
              <p className="text-gray-500 text-xs pl-4">
                Stakes: {usd(pricing.stepStakeTotalCents / 100)}
              </p>
            </>
          )}
          {pricing.promoDiscountRate > 0 && (
            <p className="text-green-600">
              <strong>Discount:</strong> {Math.round(pricing.promoDiscountRate * 100)}% off (−{usd(pricing.promoDiscountCents / 100)})
            </p>
          )}
        </div>
      )}

      {/* Promo Code */}
      <div className="mt-3 mb-2">
        {!promoApplied ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={e => onPromoCodeChange(e.target.value.toUpperCase())}
              placeholder="Promo Code"
              className="flex-1 border rounded-xl px-3 py-2 text-base"
            />
            <button onClick={onPromoApply} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium">
              Apply
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2">
            <span className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              {promoCode} — {Math.round(pricing.promoDiscountRate * 100)}% off
            </span>
            <button
              onClick={onPromoRemove}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">Tax calculated at checkout</p>
    </div>
  );
};

export default YardSignPriceSummary;
