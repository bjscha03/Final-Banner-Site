/**
 * CartItemBreakdown
 *
 * Per-cart-item pricing breakdown that mirrors the boxed pricing panel used
 * by the site-wide PriceBreakdown component on /design and /google-ads-banner.
 *
 * Inputs come from the cart item's authoritative stored pricing fields
 * (`unit_price_cents`, `rope_cost_cents`, `pole_pocket_cost_cents`,
 * `line_total_cents`, `yard_sign_signs_subtotal_cents`,
 * `yard_sign_stakes_subtotal_cents`) — i.e. the same numbers produced by the
 * shared pricing engines at Add-to-Cart time. We do NOT redo the product
 * pricing math in cart UI; we only allocate the already-resolved cart discount
 * so every displayed line reconciles with the authoritative cart summary.
 */
import React from 'react';
import { Tag } from 'lucide-react';
import { usd } from '@/lib/pricing';
import type { CartItem } from '@/store/cart';
import {
  isQualifyingLargeBannerDiscountItem,
  type ResolvedDiscount,
} from '@/lib/discount-resolver';
import {
  LARGE_BANNER_PROMOTION_ID,
  LARGE_BANNER_PROMOTION_LABEL,
  isLargeBannerPromotionIdentifier,
} from '@/lib/largeBannerPromotion';
import { isYardSignItem } from '@/lib/product-display';

export interface CartItemBreakdownProps {
  item: CartItem;
  resolvedDiscount: ResolvedDiscount;
  /** Raw cart subtotal used for ordinary full-order promo allocation. */
  cartRawSubtotalCents: number;
  /** Banner-only subtotal used for quantity-discount allocation. */
  bannerRawSubtotalCents?: number;
  className?: string;
}

interface BreakdownRow {
  label: string;
  amountCents: number;
  isDiscount?: boolean;
  icon?: React.ReactNode;
}

const productTypeOf = (item: CartItem): 'banner' | 'yard_sign' | 'car_magnet' => {
  if (isYardSignItem(item)) return 'yard_sign';
  if ((item.product_type || 'banner') === 'car_magnet') return 'car_magnet';
  return 'banner';
};

/** Allocate one resolved cart discount proportionally within its eligible base. */
const allocateDiscount = (
  itemLineTotalCents: number,
  discountBaseCents: number,
  totalDiscountCents: number,
): number => {
  if (totalDiscountCents <= 0 || discountBaseCents <= 0 || itemLineTotalCents <= 0) {
    return 0;
  }
  return Math.round((itemLineTotalCents * totalDiscountCents) / discountBaseCents);
};

const buildRows = (
  item: CartItem,
  resolved: ResolvedDiscount,
  cartRawSubtotalCents: number,
  bannerRawSubtotalCents: number,
): { rows: BreakdownRow[]; baseSubtotalCents: number; lineTotalCents: number } => {
  const productType = productTypeOf(item);
  const lineTotalRaw = item.line_total_cents || 0;
  const rows: BreakdownRow[] = [];

  if (productType === 'yard_sign') {
    const signsSubtotal = item.yard_sign_signs_subtotal_cents ?? lineTotalRaw;
    const stakesSubtotal = item.yard_sign_stakes_subtotal_cents ?? 0;
    rows.push({ label: 'Base sign price', amountCents: signsSubtotal });
    if (stakesSubtotal > 0) {
      const qtyLabel = item.yard_sign_step_stakes_qty
        ? ` (×${item.yard_sign_step_stakes_qty})`
        : '';
      rows.push({ label: `Step stakes${qtyLabel}`, amountCents: stakesSubtotal });
    }
  } else if (productType === 'car_magnet') {
    rows.push({ label: 'Base price', amountCents: lineTotalRaw });
  } else {
    const rope = item.rope_cost_cents || 0;
    const pole = item.pole_pocket_cost_cents || 0;
    const baseBanner = lineTotalRaw - rope - pole;
    rows.push({ label: 'Base banner', amountCents: Math.max(0, baseBanner) });
    if (pole > 0) rows.push({ label: 'Pole pockets', amountCents: pole });
    if (rope > 0) rows.push({ label: 'Rope', amountCents: rope });
  }

  const discountType = resolved.appliedDiscountType;
  const totalDiscountCents = resolved.appliedDiscountAmountCents;
  const automaticLargeBannerDiscount = discountType === 'promo'
    && (
      resolved.promotionId === LARGE_BANNER_PROMOTION_ID
      || isLargeBannerPromotionIdentifier(resolved.promoDiscountCode)
    );

  let allocatedDiscountCents = 0;
  let discountLabel = '';

  if (totalDiscountCents > 0 && discountType !== 'none') {
    if (discountType === 'quantity') {
      if (productType === 'banner') {
        allocatedDiscountCents = allocateDiscount(
          lineTotalRaw,
          bannerRawSubtotalCents,
          totalDiscountCents,
        );
      }
      const ratePct = Math.round(resolved.appliedDiscountRate * 100);
      discountLabel = `Quantity discount${ratePct ? ` (${ratePct}% off)` : ''}`;
    } else if (automaticLargeBannerDiscount) {
      const qualifies = isQualifyingLargeBannerDiscountItem({
        id: item.id,
        product_type: item.product_type || 'banner',
        width_in: item.width_in,
        height_in: item.height_in,
        line_total_cents: lineTotalRaw,
      });
      allocatedDiscountCents = qualifies
        ? Math.round(lineTotalRaw * resolved.appliedDiscountRate)
        : 0;
      discountLabel = LARGE_BANNER_PROMOTION_LABEL;
    } else {
      allocatedDiscountCents = allocateDiscount(
        lineTotalRaw,
        cartRawSubtotalCents,
        totalDiscountCents,
      );
      const ratePct = Math.round(resolved.appliedDiscountRate * 100);
      const code = resolved.promoDiscountCode || 'Promo';
      discountLabel = `Promo ${code}${ratePct ? ` (${ratePct}% off)` : ''}`;
    }
  }

  if (allocatedDiscountCents > 0) {
    rows.push({
      label: discountLabel,
      amountCents: allocatedDiscountCents,
      isDiscount: true,
      icon: <Tag className="h-3.5 w-3.5" />,
    });
  }

  const lineTotalCents = Math.max(0, lineTotalRaw - allocatedDiscountCents);
  return { rows, baseSubtotalCents: lineTotalRaw, lineTotalCents };
};

const CartItemBreakdown: React.FC<CartItemBreakdownProps> = ({
  item,
  resolvedDiscount,
  cartRawSubtotalCents,
  bannerRawSubtotalCents,
  className = '',
}) => {
  const { rows, baseSubtotalCents, lineTotalCents } = buildRows(
    item,
    resolvedDiscount,
    cartRawSubtotalCents,
    bannerRawSubtotalCents ?? cartRawSubtotalCents,
  );

  const hasAdjustment = lineTotalCents !== baseSubtotalCents;

  return (
    <div
      className={`rounded-xl p-3 sm:p-4 ${className}`}
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        border: '1px solid rgba(148,163,184,0.3)',
      }}
      data-testid="cart-item-breakdown"
    >
      <div className="space-y-1.5 text-xs sm:text-sm">
        {rows.map((row, idx) => (
          <div
            key={`${row.label}-${idx}`}
            className={`flex justify-between gap-3 ${row.isDiscount ? 'text-green-700' : ''}`}
          >
            <span
              className={`flex min-w-0 items-center gap-1 ${row.isDiscount ? '' : 'text-gray-600'}`}
            >
              {row.icon}
              <span className="truncate">{row.label}</span>
            </span>
            <span
              className={`whitespace-nowrap font-semibold ${row.isDiscount ? '' : 'text-gray-800'}`}
            >
              {row.isDiscount ? '-' : ''}
              {usd(row.amountCents / 100)}
            </span>
          </div>
        ))}

        {hasAdjustment && (
          <div className="flex justify-between gap-3 border-t border-slate-300/60 pt-2 mt-1">
            <span className="text-gray-600">Original line price</span>
            <span className="whitespace-nowrap font-semibold text-slate-400 line-through decoration-2">
              {usd(baseSubtotalCents / 100)}
            </span>
          </div>
        )}

        <div
          className={`flex justify-between gap-3 ${hasAdjustment ? '' : 'border-t border-slate-300/60 pt-2 mt-1'}`}
        >
          <span className="font-bold text-gray-800">Line total</span>
          <span className={`whitespace-nowrap font-bold ${hasAdjustment ? 'text-emerald-600' : 'text-[#18448D]'}`}>
            {usd(lineTotalCents / 100)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CartItemBreakdown;
