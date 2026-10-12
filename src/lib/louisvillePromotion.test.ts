import { describe, it, expect } from "vitest";
import {
  getPromoDiscountSubtotalCents,
  resolveBestDiscount,
  type PromoDiscountInput,
} from "./discount-resolver";
import { resolvePromo } from "./promoEngine";
const promo: PromoDiscountInput = {
  code: "LOU25-AAAAAAAAAAAAAAAAAAAA",
  campaign: "louisville-neighbors-25-v1",
  discountScope: "banner_lines",
  discountPercentage: 25,
};
const items = [
  {
    id: "banner",
    product_type: "banner",
    width_in: 120,
    height_in: 48,
    line_total_cents: 10000,
  },
  {
    id: "magnet",
    product_type: "car_magnet",
    width_in: 24,
    height_in: 18,
    line_total_cents: 10000,
  },
];
describe("Louisville coupon pricing", () => {
  it("keeps storefront and cart pricing limited to banner lines", () => {
    expect(getPromoDiscountSubtotalCents(items, 20000, promo)).toBe(10000);
    expect(
      resolveBestDiscount({
        subtotalCents: 20000,
        quantity: 5,
        quantitySubtotalCents: 10000,
        promoDiscount: promo,
        promoSubtotalCents: getPromoDiscountSubtotalCents(items, 20000, promo),
      }).appliedDiscountAmountCents,
    ).toBe(2500);
    expect(
      resolvePromo({
        subtotalCents: 10000,
        quantity: 1,
        code: promo.code,
        validatedPromo: promo,
        items: [items[0]],
      }).appliedDiscountAmountCents,
    ).toBe(2500);
  });
  it("fails closed when a scoped subtotal or valid campaign is missing", () => {
    expect(
      resolveBestDiscount({
        subtotalCents: 20000,
        quantity: 1,
        promoDiscount: promo,
      }).appliedDiscountAmountCents,
    ).toBe(0);
    expect(
      getPromoDiscountSubtotalCents(items, 20000, {
        ...promo,
        campaign: "spoofed",
      }),
    ).toBe(0);
  });
});
