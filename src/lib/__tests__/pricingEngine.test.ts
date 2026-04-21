import { describe, expect, it } from 'vitest';
import { calculatePricing, isQuantityDiscountEligible } from '@/lib/pricingEngine';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { calcCarMagnetPricing } from '@/lib/car-magnet-pricing';

describe('pricingEngine', () => {
  describe('eligibility', () => {
    it('includes banner and car_magnet, excludes yard_sign', () => {
      expect(isQuantityDiscountEligible('banner')).toBe(true);
      expect(isQuantityDiscountEligible('car_magnet')).toBe(true);
      expect(isQuantityDiscountEligible('yard_sign')).toBe(false);
      expect(isQuantityDiscountEligible(undefined)).toBe(true); // defaults to banner
    });
  });

  describe('banner facade matches bannerPricingEngine', () => {
    it('returns identical totals for the headline test case (8x4 15oz qty 3)', () => {
      const direct = calculateBannerPricing({
        widthIn: 96,
        heightIn: 48,
        quantity: 3,
        material: '15oz',
        addRope: false,
        polePockets: 'none',
        grommets: 'none',
      });
      const facade = calculatePricing({
        productType: 'banner',
        widthIn: 96,
        heightIn: 48,
        quantity: 3,
        material: '15oz',
        addRope: false,
        polePockets: 'none',
        grommets: 'none',
      });

      expect(facade.subtotalBeforeDiscountCents).toBe(direct.subtotalBeforeDiscountCents);
      expect(facade.quantityDiscountCents).toBe(direct.quantityDiscountCents);
      expect(facade.subtotalCents).toBe(direct.subtotalCents);
      expect(facade.totalCents).toBe(direct.totalCents);
      expect(facade.quantityDiscountRate).toBeCloseTo(0.07, 4);
      // Critical invariant: subtotal MUST equal raw subtotal minus discount.
      expect(facade.subtotalCents).toBe(
        facade.subtotalBeforeDiscountCents - facade.quantityDiscountCents,
      );
    });
  });

  describe('car magnet quantity discount tier matrix', () => {
    const tiers: Array<[number, number]> = [
      [1, 0],
      [2, 0.05],
      [3, 0.07],
      [4, 0.10],
      [5, 0.13],
      [6, 0.13],
    ];
    for (const [qty, rate] of tiers) {
      it(`qty ${qty} → ${(rate * 100).toFixed(0)}% discount applied to subtotal`, () => {
        const result = calculatePricing({
          productType: 'car_magnet',
          widthIn: 18,
          heightIn: 12,
          quantity: qty,
        });
        expect(result.quantityDiscountRate).toBeCloseTo(rate, 4);
        const expectedDiscount = Math.round(result.basePriceCents * rate);
        expect(result.quantityDiscountCents).toBe(expectedDiscount);
        // Discount MUST be reflected in subtotal — not just displayed.
        expect(result.subtotalCents).toBe(result.basePriceCents - expectedDiscount);
        // Total = subtotal + tax computed on subtotal.
        const expectedTax = Math.round(result.subtotalCents * 0.06);
        expect(result.taxCents).toBe(expectedTax);
        expect(result.totalCents).toBe(result.subtotalCents + expectedTax);
      });
    }
  });

  describe('car magnet calcCarMagnetPricing direct (legacy)', () => {
    it('exposes baseSubtotalCents AND post-discount subtotalCents', () => {
      const r = calcCarMagnetPricing(18, 12, 3);
      // Base price for 18x12 magnet is $22.00 each → $66.00 base for qty 3.
      expect(r.baseSubtotalCents).toBe(6600);
      // 7% discount = $4.62
      expect(r.quantityDiscountCents).toBe(462);
      expect(r.subtotalCents).toBe(6138);
    });
  });

  describe('breakdown invariants', () => {
    it('does NOT include a Quantity Discount line when amount is zero', () => {
      const result = calculatePricing({
        productType: 'banner',
        widthIn: 48,
        heightIn: 24,
        quantity: 1,
        material: '13oz',
        addRope: false,
        polePockets: 'none',
        grommets: 'none',
      });
      expect(result.quantityDiscountCents).toBe(0);
      expect(result.breakdown.find((l) => l.label.startsWith('Quantity Discount'))).toBeUndefined();
    });

    it('DOES include a Quantity Discount line with non-zero amount when applicable', () => {
      const result = calculatePricing({
        productType: 'car_magnet',
        widthIn: 18,
        heightIn: 12,
        quantity: 3,
      });
      const line = result.breakdown.find((l) => l.label.startsWith('Quantity Discount'));
      expect(line).toBeDefined();
      expect(line!.amountCents).toBeGreaterThan(0);
      expect(line!.isDiscount).toBe(true);
    });
  });
});
