import { describe, expect, it } from 'vitest';
import {
  LARGE_BANNER_PROMOTION_ID,
  SMALL_BANNER_PROMOTION_CAMPAIGN,
  SMALL_BANNER_PROMOTION_ID,
  SMALL_BANNER_PROMOTION_SCOPE,
  getPromoDiscountSubtotalCents,
  resolveBestDiscount,
  type PromoDiscountCartItem,
  type PromoDiscountInput,
} from './discount-resolver';
import { resolvePromo } from './promoEngine';

const item = (
  id: string,
  productType: string | undefined,
  width: number,
  height: number,
  lineTotalCents: number,
): PromoDiscountCartItem => ({
  id,
  product_type: productType,
  width_in: width,
  height_in: height,
  line_total_cents: lineTotalCents,
});

const twentyOff = (overrides: Partial<PromoDiscountInput> = {}): PromoDiscountInput => ({
  code: SMALL_BANNER_PROMOTION_ID,
  discountPercentage: 20,
  discountScope: SMALL_BANNER_PROMOTION_SCOPE,
  campaign: SMALL_BANNER_PROMOTION_CAMPAIGN,
  ...overrides,
});

describe('20OFF client resolver parity with the server', () => {
  it('4x2 banner + 20OFF = 20% off', () => {
    const items = [item('a', 'banner', 48, 24, 5000)];
    const promoSubtotalCents = getPromoDiscountSubtotalCents(items, 5000, twentyOff());
    const resolved = resolveBestDiscount({ subtotalCents: 5000, quantity: 1, promoDiscount: twentyOff(), promoSubtotalCents });
    expect(resolved.appliedDiscountType).toBe('promo');
    expect(resolved.appliedDiscountAmountCents).toBe(1000);
    expect(resolved.promotionId).toBeNull();
  });

  it('6x3 banner + 20OFF = 25% (automatic discount wins, 20OFF metadata is unchanged)', () => {
    const items = [item('a', 'banner', 72, 36, 10000)];
    const promo = twentyOff();
    const promoSubtotalCents = getPromoDiscountSubtotalCents(items, 10000, promo);
    const resolved = resolveBestDiscount({ subtotalCents: 10000, quantity: 1, promoDiscount: promo, promoSubtotalCents });
    expect(resolved.appliedDiscountType).toBe('promo');
    expect(resolved.appliedDiscountAmountCents).toBe(2500);
    expect(resolved.promotionId).toBe(LARGE_BANNER_PROMOTION_ID);
  });

  it('4x2 -> 6x3 -> 4x2: switching dimensions changes the winner without losing 20OFF', () => {
    const promo = twentyOff();
    const small = item('a', 'banner', 48, 24, 5000);
    const large = item('a', 'banner', 72, 36, 10000);

    const first = resolveBestDiscount({
      subtotalCents: 5000,
      quantity: 1,
      promoDiscount: promo,
      promoSubtotalCents: getPromoDiscountSubtotalCents([small], 5000, promo),
    });
    expect(first.appliedDiscountAmountCents).toBe(1000);

    const middle = resolveBestDiscount({
      subtotalCents: 10000,
      quantity: 1,
      promoDiscount: promo,
      promoSubtotalCents: getPromoDiscountSubtotalCents([large], 10000, promo),
    });
    expect(middle.appliedDiscountAmountCents).toBe(2500);
    expect(middle.promotionId).toBe(LARGE_BANNER_PROMOTION_ID);

    const last = resolveBestDiscount({
      subtotalCents: 5000,
      quantity: 1,
      promoDiscount: promo,
      promoSubtotalCents: getPromoDiscountSubtotalCents([small], 5000, promo),
    });
    expect(last.appliedDiscountAmountCents).toBe(1000);
    expect(last.promotionId).toBeNull();
  });

  it('getPromoDiscountSubtotalCents requires an exact code + percent + scope + campaign match', () => {
    const items = [item('a', 'banner', 48, 24, 5000)];
    expect(getPromoDiscountSubtotalCents(items, 5000, twentyOff({ campaign: 'wrong_campaign' }))).toBe(0);
    expect(getPromoDiscountSubtotalCents(items, 5000, twentyOff({ campaign: undefined }))).toBe(0);
    expect(getPromoDiscountSubtotalCents(items, 5000, twentyOff({ discountPercentage: 15 }))).toBe(0);
    expect(getPromoDiscountSubtotalCents(items, 5000, twentyOff({ code: 'NOT20OFF' }))).toBe(0);
    expect(getPromoDiscountSubtotalCents(items, 5000, twentyOff())).toBe(5000);
  });

  it('resolvePromo (promoEngine) mirrors the same 20% vs 25% outcome via the shared KNOWN_PROMO_CODES metadata', () => {
    const smallBannerLine = { id: 'line', product_type: 'banner', width_in: 48, height_in: 24, line_total_cents: 5000 };
    const largeBannerLine = { id: 'line', product_type: 'banner', width_in: 72, height_in: 36, line_total_cents: 10000 };

    const small = resolvePromo({ subtotalCents: 5000, quantity: 1, code: '20off', items: [smallBannerLine] });
    expect(small.appliedDiscountAmountCents).toBe(1000);
    expect(small.promotionId).toBeNull();

    const large = resolvePromo({ subtotalCents: 10000, quantity: 1, code: '20off', items: [largeBannerLine] });
    expect(large.appliedDiscountAmountCents).toBe(2500);
    expect(large.promotionId).toBe(LARGE_BANNER_PROMOTION_ID);
  });
});
