import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, contents) {
  fs.writeFileSync(file, contents, 'utf8');
}

function replaceOnce(file, before, after, label) {
  const contents = read(file);
  const first = contents.indexOf(before);
  if (first < 0) {
    throw new Error(`${label}: target was not found in ${file}`);
  }
  if (contents.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: target was not unique in ${file}`);
  }
  write(file, `${contents.slice(0, first)}${after}${contents.slice(first + before.length)}`);
  console.log(`patched ${file}: ${label}`);
}

const lines = (...values) => values.join('\n');

// ---------------------------------------------------------------------------
// Client discount resolver: retain whether a competing promotion is percent
// or fixed-dollar so customer messaging stays accurate.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/lib/discount-resolver.ts',
  lines(
    '  amountCents: number;',
    '  rate: number;',
    '  priority: number;',
    '}',
  ),
  lines(
    '  amountCents: number;',
    '  rate: number;',
    '  priority: number;',
    '  isPercentage: boolean;',
    '}',
  ),
  'add candidate promotion-kind metadata',
);

replaceOnce(
  'src/lib/discount-resolver.ts',
  lines(
    '  let amountCents = 0;',
    '  let rate = 0;',
    '',
    '  const percentage = Number(promoDiscount.discountPercentage || 0);',
  ),
  lines(
    '  let amountCents = 0;',
    '  let rate = 0;',
    '  let isPercentage = false;',
    '',
    '  const percentage = Number(promoDiscount.discountPercentage || 0);',
  ),
  'initialize manual promotion kind',
);

replaceOnce(
  'src/lib/discount-resolver.ts',
  lines(
    '  if (percentage > 0) {',
    '    rate = percentage / 100;',
    '    amountCents = Math.round(safeBaseCents * rate);',
  ),
  lines(
    '  if (percentage > 0) {',
    '    rate = percentage / 100;',
    '    isPercentage = true;',
    '    amountCents = Math.round(safeBaseCents * rate);',
  ),
  'mark manual percentage promotions',
);

replaceOnce(
  'src/lib/discount-resolver.ts',
  lines(
    '    amountCents,',
    '    rate,',
    '    priority: 2,',
    '  };',
  ),
  lines(
    '    amountCents,',
    '    rate,',
    '    priority: 2,',
    '    isPercentage,',
    '  };',
  ),
  'store manual promotion kind',
);

replaceOnce(
  'src/lib/discount-resolver.ts',
  lines(
    '        rate: quantityDiscountRate,',
    '        priority: 1,',
    '      }',
  ),
  lines(
    '        rate: quantityDiscountRate,',
    '        priority: 1,',
    '        isPercentage: true,',
    '      }',
  ),
  'mark quantity candidate as percentage',
);

replaceOnce(
  'src/lib/discount-resolver.ts',
  lines(
    '        rate: LARGE_BANNER_PROMO_RATE,',
    '        priority: 3,',
    '      }',
  ),
  lines(
    '        rate: LARGE_BANNER_PROMO_RATE,',
    '        priority: 3,',
    '        isPercentage: true,',
    '      }',
  ),
  'mark automatic candidate as percentage',
);

replaceOnce(
  'src/lib/discount-resolver.ts',
  "    if (winner.source === 'automatic' && manualCandidate?.rate > 0) {",
  "    if (winner.source === 'automatic' && manualCandidate?.isPercentage) {",
  'use percentage-specific conflict copy',
);

// ---------------------------------------------------------------------------
// Zustand cart projections: derive automatic eligibility from actual line
// dimensions during cart refresh, checkout refresh and canonical repricing.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/store/cart.ts',
  lines(
    'import {',
    '  getPromoDiscountSubtotalCents,',
    '  resolveBestDiscount,',
  ),
  lines(
    'import {',
    '  getAutomaticLargeBannerSubtotalCents,',
    '  getPromoDiscountSubtotalCents,',
    '  resolveBestDiscount,',
  ),
  'import automatic promotion subtotal helper',
);

replaceOnce(
  'src/store/cart.ts',
  lines(
    '          promoSubtotalCents: getPromoDiscountSubtotalCents(',
    '            projectedItems,',
    '            projectedSubtotalCents,',
    '            projectedPromoDiscount,',
    '          ),',
    '        });',
  ),
  lines(
    '          promoSubtotalCents: getPromoDiscountSubtotalCents(',
    '            projectedItems,',
    '            projectedSubtotalCents,',
    '            projectedPromoDiscount,',
    '          ),',
    '          automaticPromotionSubtotalCents: getAutomaticLargeBannerSubtotalCents(projectedItems),',
    '        });',
  ),
  'include automatic promotion in canonical cart projection',
);

replaceOnce(
  'src/store/cart.ts',
  lines(
    '          promoDiscount,',
    '          promoSubtotalCents: getPromoDiscountSubtotalCents(items, subtotalCents, promoDiscount),',
    '        });',
  ),
  lines(
    '          promoDiscount,',
    '          promoSubtotalCents: getPromoDiscountSubtotalCents(items, subtotalCents, promoDiscount),',
    '          automaticPromotionSubtotalCents: getAutomaticLargeBannerSubtotalCents(items),',
    '        });',
  ),
  'include automatic promotion in live cart totals',
);

// ---------------------------------------------------------------------------
// Minor strict TypeScript cleanup in the unified order-pricing adapter.
// ---------------------------------------------------------------------------
replaceOnce(
  'src/lib/order-pricing.ts',
  lines(
    '  if (item.pole_pocket_position || item.pole_pockets) {',
    '    parts.push(item.pole_pocket_position || item.pole_pockets);',
    '  }',
  ),
  lines(
    '  const pocketPosition = item.pole_pocket_position || item.pole_pockets;',
    '  if (pocketPosition) {',
    '    parts.push(pocketPosition);',
    '  }',
  ),
  'narrow pole-pocket description value',
);

// ---------------------------------------------------------------------------
// Server order persistence: use the authoritative discount label and store
// enough promotion metadata to audit the original subtotal, winning offer,
// automatic eligibility and final discounted subtotal.
// ---------------------------------------------------------------------------
replaceOnce(
  'netlify/functions/_shared/legacy/create-order-core.cjs',
  lines(
    '        ADD COLUMN IF NOT EXISTS applied_discount_cents INTEGER DEFAULT 0,',
    "        ADD COLUMN IF NOT EXISTS applied_discount_label TEXT DEFAULT '',",
    "        ADD COLUMN IF NOT EXISTS applied_discount_type TEXT DEFAULT 'none'",
  ),
  lines(
    '        ADD COLUMN IF NOT EXISTS applied_discount_cents INTEGER DEFAULT 0,',
    "        ADD COLUMN IF NOT EXISTS applied_discount_label TEXT DEFAULT '',",
    "        ADD COLUMN IF NOT EXISTS applied_discount_type TEXT DEFAULT 'none',",
    '        ADD COLUMN IF NOT EXISTS applied_promotion_id TEXT,',
    "        ADD COLUMN IF NOT EXISTS applied_promotion_source TEXT DEFAULT 'none',",
    '        ADD COLUMN IF NOT EXISTS applied_promotion_percentage INTEGER DEFAULT 0,',
    '        ADD COLUMN IF NOT EXISTS automatic_promotion_eligible BOOLEAN DEFAULT FALSE,',
    '        ADD COLUMN IF NOT EXISTS subtotal_after_discount_cents INTEGER DEFAULT 0',
  ),
  'add promotion audit columns',
);

replaceOnce(
  'netlify/functions/_shared/legacy/create-order-core.cjs',
  lines(
    '  orderData.applied_discount_cents = totals.applied_discount_cents || 0;',
    "  orderData.applied_discount_type = totals.applied_discount_type || 'none';",
    "  if (totals.applied_discount_type === 'quantity') {",
    '    const percentage = Math.round(totals.applied_discount_rate * 100);',
    '    orderData.applied_discount_label = `Qty Discount (${percentage}% off)`;',
    "  } else if (totals.applied_discount_type === 'promo') {",
    "    orderData.applied_discount_label = `Promo: ${orderData.discountCode?.code || 'Applied'}`;",
    '  } else {',
    "    orderData.applied_discount_label = '';",
    '  }',
  ),
  lines(
    '  orderData.applied_discount_cents = totals.applied_discount_cents || 0;',
    "  orderData.applied_discount_type = totals.applied_discount_type || 'none';",
    '  orderData.applied_discount_label = totals.applied_discount_label || \'\';',
    '  orderData.applied_promotion_id = totals.applied_promotion_id || null;',
    "  orderData.applied_promotion_source = totals.applied_promotion_source || 'none';",
    '  orderData.applied_promotion_percentage = Math.round((totals.applied_discount_rate || 0) * 100);',
    '  orderData.automatic_promotion_eligible = totals.automatic_promotion_eligible === true;',
    '  orderData.subtotal_after_discount_cents = totals.subtotal_after_discount_cents;',
  ),
  'persist authoritative promotion resolution',
);

replaceOnce(
  'netlify/functions/_shared/legacy/create-order-core.cjs',
  'discount_code, applied_discount_cents, applied_discount_label, applied_discount_type, same_day_hit_service',
  'discount_code, applied_discount_cents, applied_discount_label, applied_discount_type, applied_promotion_id, applied_promotion_source, applied_promotion_percentage, automatic_promotion_eligible, subtotal_after_discount_cents, same_day_hit_service',
  'insert promotion audit columns',
);

replaceOnce(
  'netlify/functions/_shared/legacy/create-order-core.cjs',
  "${orderData.discountCode?.code || null}, ${orderData.applied_discount_cents || 0}, ${orderData.applied_discount_label || ''}, ${orderData.applied_discount_type || 'none'}, ${orderSameDayHitService}",
  "${orderData.discountCode?.code || null}, ${orderData.applied_discount_cents || 0}, ${orderData.applied_discount_label || ''}, ${orderData.applied_discount_type || 'none'}, ${orderData.applied_promotion_id || null}, ${orderData.applied_promotion_source || 'none'}, ${orderData.applied_promotion_percentage || 0}, ${orderData.automatic_promotion_eligible === true}, ${orderData.subtotal_after_discount_cents || 0}, ${orderSameDayHitService}",
  'insert promotion audit values',
);

replaceOnce(
  'src/lib/orders/types.ts',
  lines(
    '  applied_discount_cents?: number;',
    '  applied_discount_label?: string;',
    '  applied_discount_type?: string;',
    '  discount_code?: string | null;',
  ),
  lines(
    '  applied_discount_cents?: number;',
    '  applied_discount_label?: string;',
    '  applied_discount_type?: string;',
    '  applied_promotion_id?: string | null;',
    "  applied_promotion_source?: 'automatic' | 'promo_code' | 'quantity' | 'none' | string;",
    '  applied_promotion_percentage?: number;',
    '  automatic_promotion_eligible?: boolean;',
    '  subtotal_after_discount_cents?: number;',
    '  discount_code?: string | null;',
  ),
  'type promotion audit fields returned to admin and My Orders',
);

// ---------------------------------------------------------------------------
// Abandoned carts: show the automatic discount by its real label and stop
// issuing a second 25% offer for newly-created qualifying cart emails. A
// previously reserved offer is preserved only to keep provider retries
// idempotent; checkout still resolves it to the same single automatic 25%.
// ---------------------------------------------------------------------------
replaceOnce(
  'netlify/functions/_shared/legacy/send-abandoned-cart-email.cjs',
  lines(
    "    existingDiscountLabel: currentTotals.applied_discount_type === 'quantity'",
    "      ? 'Automatic quantity discount'",
    "      : currentTotals.applied_discount_type === 'promo' && existingPromo?.code",
    '        ? `${existingPromo.code} discount`',
    "        : 'Discount',",
  ),
  lines(
    '    existingDiscountLabel: currentTotals.applied_discount_label',
    "      || (currentTotals.applied_discount_type === 'quantity'",
    "        ? 'Automatic quantity discount'",
    "        : currentTotals.applied_discount_type === 'promo' && existingPromo?.code",
    '          ? `${existingPromo.code} discount`',
    "          : 'Discount'),",
  ),
  'display automatic promotion label in recovery email totals',
);

replaceOnce(
  'netlify/functions/_shared/legacy/send-abandoned-cart-email.cjs',
  '    const offer = await getOrCreateDiscountCode(sql, cart, sequence, cartItems);',
  lines(
    '    const automaticCartTotals = computeTotals(cartItems, 0.06, checkoutOptions(), null);',
    '    const reservedOfferMetadata = parseJsonObject(cart.recovery_delivery_metadata);',
    '    const hasReservedOffer = reservedOfferMetadata.offerExpected === true',
    '      || Boolean(cart.recovery_delivery_discount_code);',
    '    const offer = automaticCartTotals.automatic_promotion_eligible && !hasReservedOffer',
    '      ? null',
    '      : await getOrCreateDiscountCode(sql, cart, sequence, cartItems);',
  ),
  'suppress redundant abandoned-cart percentage offer',
);

console.log('all large-banner promotion patches applied');
