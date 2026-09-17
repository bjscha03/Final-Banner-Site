import { describe, expect, it } from 'vitest';
import { calculateBannerPricing, calculateBannerUnitBasePriceCents } from '@/lib/bannerPricingEngine';

describe('bannerPricingEngine', () => {
  it.each([[20,10000],[21,10325],[50,19750],[51,20025],[250,74750],[800,226000]])('prices %s square feet progressively', (area, cents) => {
    expect(calculateBannerUnitBasePriceCents(area, '13oz')).toBe(cents);
  });

  it('calculates base banner pricing with no add-ons', () => {
    const result = calculateBannerPricing({
      widthIn: 48,
      heightIn: 24,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      polePockets: 'none',
      addRope: false,
    });

    expect(result.baseBannerPriceCents).toBe(4000);
    expect(result.ropeCostCents).toBe(0);
    expect(result.polePocketCostCents).toBe(0);
    expect(result.quantityDiscountCents).toBe(0);
    expect(result.subtotalCents).toBe(4000);
    expect(result.taxCents).toBe(240);
    expect(result.totalCents).toBe(4240);
  });

  it('applies quantity discount for qty 2', () => {
    const result = calculateBannerPricing({
      widthIn: 48,
      heightIn: 24,
      quantity: 2,
      material: '13oz',
      grommets: 'none',
      polePockets: 'none',
      addRope: false,
    });

    expect(result.quantityDiscountRate).toBe(0.05);
    expect(result.subtotalBeforeDiscountCents).toBe(8000);
    expect(result.quantityDiscountCents).toBe(400);
    expect(result.subtotalCents).toBe(7600);
  });

  it('includes pole pocket setup + linear foot charge', () => {
    const result = calculateBannerPricing({
      widthIn: 48,
      heightIn: 24,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      polePockets: 'top',
      addRope: false,
    });

    expect(result.polePocketLinearFeet).toBe(4);
    expect(result.polePocketSetupFeeCents).toBe(1500);
    expect(result.polePocketCostCents).toBe(2300);
  });

  it('includes rope linear foot charge', () => {
    const result = calculateBannerPricing({
      widthIn: 48,
      heightIn: 24,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      polePockets: 'none',
      addRope: true,
    });

    expect(result.ropeLinearFeet).toBe(4);
    expect(result.ropeCostCents).toBe(800);
  });

  it('includes both pole pockets and rope charges', () => {
    const result = calculateBannerPricing({
      widthIn: 48,
      heightIn: 24,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      polePockets: 'top-bottom',
      addRope: true,
    });

    expect(result.polePocketCostCents).toBe(3100);
    expect(result.ropeCostCents).toBe(800);
    expect(result.subtotalBeforeDiscountCents).toBe(7900);
  });

  it('uses material pricing map correctly', () => {
    const result = calculateBannerPricing({
      widthIn: 48,
      heightIn: 24,
      quantity: 1,
      material: '18oz',
      grommets: 'none',
      polePockets: 'none',
      addRope: false,
    });

    expect(result.unitBasePriceCents).toBe(6000);
    expect(result.subtotalCents).toBe(6000);
    expect(result.totalCents).toBe(6360);
  });

  it('returns zero until both banner dimensions are configured', () => {
    for (const [widthIn, heightIn] of [[0, 0], [72, 0], [0, 36]]) {
      const result = calculateBannerPricing({
        widthIn,
        heightIn,
        quantity: 1,
        material: '13oz',
        grommets: 'none',
        polePockets: 'left',
        addRope: true,
      });

      expect(result.unitBasePriceCents).toBe(0);
      expect(result.baseBannerPriceCents).toBe(0);
      expect(result.ropeCostCents).toBe(0);
      expect(result.polePocketCostCents).toBe(0);
      expect(result.subtotalBeforeDiscountCents).toBe(0);
      expect(result.taxCents).toBe(0);
      expect(result.totalCents).toBe(0);
    }
  });

  it("calculates the updated 6' × 3' price after the customer selects it", () => {
    const result = calculateBannerPricing({
      widthIn: 72,
      heightIn: 36,
      quantity: 1,
      material: '13oz',
      grommets: 'none',
      polePockets: 'none',
      addRope: false,
    });

    expect(result.baseBannerPriceCents).toBe(9000);
    expect(result.subtotalCents).toBe(9000);
    expect(result.taxCents).toBe(540);
    expect(result.totalCents).toBe(9540);
  });

});
