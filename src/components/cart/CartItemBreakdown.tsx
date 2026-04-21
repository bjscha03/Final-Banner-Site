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
 * shared pricing engines at Add-to-Cart time. We do NOT redo the pricing
 * math in cart UI; we render the engine output that already lives on the
 * item.
 *
 * Cart-level discounts (Best-Discount-Wins quantity OR promo) are allocated
 * to each item proportionally by raw line total so the per-item breakdown
 * reconciles with the cart summary totals.
 */
import React from 'react';
import { Tag } from 'lucide-react';
import { usd } from '@/lib/pricing';
import type { CartItem } from '@/store/cart';
import type { ResolvedDiscount } from '@/lib/discount-resolver';
import { isYardSignItem } from '@/lib/product-display';

export interface CartItemBreakdownProps {
  item: CartItem;
  resolvedDiscount: ResolvedDiscount;
  /** Raw cart subtotal (sum of all item line_total_cents) used for promo discount allocation. */
  cartRawSubtotalCents: number;
  /**
   * Banner-only subtotal (sum of line_total_cents for banner items) used for
   * allocating the quantity discount. Quantity discounts apply ONLY to banner
   * items. When omitted, falls back to `cartRawSubtotalCents`.
   */
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

/**
 * Allocate a cart-level discount amount to this item, proportionally to its
 * line_total_cents within the cart raw subtotal. Returns 0 when no discount
 * is applied or when the cart has no positive subtotal.
 */
const allocateDiscount = (
  itemLineTotalCents: number,
  cartRawSubtotalCents: number,
  totalDiscountCents: number,
): number => {
  if (totalDiscountCents <= 0 || cartRawSubtotalCents <= 0 || itemLineTotalCents <= 0) {
    return 0;
  }
  // Round to nearest cent. Per-item rounding may differ from cart-total
  // discount by ≤ N cents (N = number of items), which is acceptable for a
  // per-item attribution display. The cart summary total remains the source
  // of truth and is unchanged by this UI.
  return Math.round((itemLineTotalCents * totalDiscountCents) / cartRawSubtotalCents);
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
    // Yard signs: signs subtotal + optional step stakes. No quantity discount.
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
    // Car magnets: flat-priced. No quantity discount applied at the item level.
    rows.push({ label: 'Base price', amountCents: lineTotalRaw });
  } else {
    // Banner: base banner + add-ons (rope / pole pockets) from stored fields.
    const rope = item.rope_cost_cents || 0;
    const pole = item.pole_pocket_cost_cents || 0;
    const baseBanner = lineTotalRaw - rope - pole;
    rows.push({ label: 'Base banner', amountCents: Math.max(0, baseBanner) });
    if (pole > 0) rows.push({ label: 'Pole pockets', amountCents: pole });
    if (rope > 0) rows.push({ label: 'Rope', amountCents: rope });
  }

  // Per-item attribution of the cart-level resolved discount.
  // - Quantity discounts apply ONLY to banner items: allocated proportionally
  //   across banner items by their raw line total. Yard signs and car magnets
  //   receive ZERO quantity-discount allocation and therefore show no
  //   "Quantity discount" row.
  // - Promo discounts apply to the full cart: allocated proportionally across
  //   all items by their raw line total.
  const discountType = resolved.appliedDiscountType;
  const totalDiscountCents = resolved.appliedDiscountAmountCents;

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
      } // else: yard_sign / car_magnet → 0 (no quantity discount on non-banners)
      const ratePct = Math.round(resolved.appliedDiscountRate * 100);
      discountLabel = `Quantity discount${ratePct ? ` (${ratePct}% off)` : ''}`;
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
            className={`flex justify-between gap-3 ${
              row.isDiscount ? 'text-green-700' : ''
            }`}
          >
            <span
              className={`flex items-center gap-1 min-w-0 ${
                row.isDiscount ? '' : 'text-gray-600'
              }`}
            >
              {row.icon}
              <span className="truncate">{row.label}</span>
            </span>
            <span
              className={`font-semibold whitespace-nowrap ${
                row.isDiscount ? '' : 'text-gray-800'
              }`}
            >
              {row.isDiscount ? '-' : ''}
              {usd(row.amountCents / 100)}
            </span>
          </div>
        ))}

        {hasAdjustment && (
          <div className="flex justify-between gap-3 pt-2 mt-1 border-t border-slate-300/60">
            <span className="text-gray-600">Line subtotal</span>
            <span className="font-semibold text-gray-800 whitespace-nowrap">
              {usd(baseSubtotalCents / 100)}
            </span>
          </div>
        )}

        <div
          className={`flex justify-between gap-3 ${
            hasAdjustment ? '' : 'pt-2 mt-1 border-t border-slate-300/60'
          }`}
        >
          <span className="font-bold text-gray-800">Line total</span>
          <span className="font-bold text-[#18448D] whitespace-nowrap">
            {usd(lineTotalCents / 100)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CartItemBreakdown;
