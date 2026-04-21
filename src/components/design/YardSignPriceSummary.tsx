/**
 * Yard Sign Price Summary Card
 *
 * Sticky right-side card showing live price breakdown for yard sign orders.
 * Renders the unified site-wide PriceBreakdown component.
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  type YardSignPricing,
  type YardSignDesign,
  validateYardSignQuantity,
} from '@/lib/yard-sign-pricing';
import { usd } from '@/lib/pricing';
import PriceBreakdown from '@/components/pricing/PriceBreakdown';

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
  const quantityValidation = validateYardSignQuantity(pricing.totalSignQuantity);
  const isInvalid = !quantityValidation.valid && pricing.totalSignQuantity > 0;

  if (pricing.totalSignQuantity === 0) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ background: '#F7F8FA', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      >
        <p className="text-sm text-gray-500 mb-1">Your Price</p>
        <p className="text-3xl font-extrabold text-gray-300 leading-tight">—</p>
        <p className="text-xs text-gray-400 mt-3">Add a design to see pricing</p>
      </div>
    );
  }

  if (isInvalid) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{ background: '#F7F8FA', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
      >
        <p className="text-sm text-gray-500 mb-1">Your Price</p>
        <p className="text-2xl font-bold text-red-500 leading-tight">Invalid Quantity</p>
        <p className="text-sm text-red-600 mt-1 flex items-center justify-center gap-1">
          <AlertTriangle className="h-4 w-4" />
          {quantityValidation.message}
        </p>
      </div>
    );
  }

  const detailRows = [
    { label: 'Print', value: pricing.sidedness === 'double' ? 'Double-Sided' : 'Single-Sided' },
    { label: 'Material', value: 'Corrugated Plastic' },
    ...(designs.length > 0 ? [{ label: 'Designs uploaded', value: String(designs.length) }] : []),
  ];

  const addOns = pricing.addStepStakes && pricing.stepStakeTotalCents > 0
    ? [{
        label: `Step stakes (×${pricing.stepStakeQuantity})`,
        amountCents: pricing.stepStakeTotalCents,
      }]
    : undefined;

  return (
    <PriceBreakdown
      topLine={`24" × 18" Yard Signs • ${usd(pricing.unitPriceCents / 100)}/sign`}
      secondaryLine={`for ${pricing.totalSignQuantity} ${pricing.totalSignQuantity === 1 ? 'sign' : 'signs'}`}
      detailRows={detailRows}
      baseSubtotalCents={pricing.signSubtotalCents}
      baseSubtotalLabel="Signs subtotal"
      addOns={addOns}
      promoDiscountCents={pricing.promoDiscountCents}
      promoDiscountRate={pricing.promoDiscountRate}
      promoDiscountCode={promoApplied ? promoCode : undefined}
      taxCents={pricing.taxCents}
      taxRate={pricing.taxRate}
      adjustedSubtotalCents={pricing.totalCents}
      totalCents={pricing.totalWithTaxCents}
      promo={{
        code: promoCode,
        applied: promoApplied,
        onCodeChange: onPromoCodeChange,
        onApply: onPromoApply,
        onRemove: onPromoRemove,
        appliedLabel: promoApplied
          ? `${promoCode} — ${Math.round(pricing.promoDiscountRate * 100)}% off`
          : undefined,
      }}
      footerNote="FREE Next-Day Air Included • Tax calculated at checkout"
    />
  );
};

export default YardSignPriceSummary;
