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

  describe('car magnet pricing uses flat per-unit totals (no quantity discount)', () => {
    const quantities = [1, 2, 3, 5];
    for (const qty of quantities) {
      it(`qty ${qty} keeps quantity discount at 0`, () => {
        const result = calculatePricing({
          productType: 'car_magnet',
          widthIn: 18,
          heightIn: 12,
          quantity: qty,
        });
        expect(result.quantityDiscountRate).toBe(0);
        expect(result.quantityDiscountCents).toBe(0);
        expect(result.subtotalCents).toBe(result.basePriceCents);
        // Total = subtotal + tax computed on subtotal.
        const expectedTax = Math.round(result.subtotalCents * 0.06);
        expect(result.taxCents).toBe(expectedTax);
        expect(result.totalCents).toBe(result.subtotalCents + expectedTax);
      });
    }
  });

  describe('car magnet calcCarMagnetPricing direct (legacy)', () => {
    it('keeps subtotal equal to base subtotal with no discount', () => {
      const r = calcCarMagnetPricing(18, 12, 3);
      expect(r.baseSubtotalCents).toBe(8700);
      expect(r.quantityDiscountRate).toBe(0);
      expect(r.quantityDiscountCents).toBe(0);
      expect(r.subtotalCents).toBe(8700);
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

    it('does NOT include a Quantity Discount line for car magnets', () => {
      const result = calculatePricing({
        productType: 'car_magnet',
        widthIn: 18,
        heightIn: 12,
        quantity: 3,
      });
      const line = result.breakdown.find((l) => l.label.startsWith('Quantity Discount'));
      expect(line).toBeUndefined();
    });
  });
});
