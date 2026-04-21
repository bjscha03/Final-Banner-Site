import { describe, expect, it } from 'vitest';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';

describe('bannerPricingEngine', () => {
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

    expect(result.baseBannerPriceCents).toBe(3600);
    expect(result.ropeCostCents).toBe(0);
    expect(result.polePocketCostCents).toBe(0);
    expect(result.quantityDiscountCents).toBe(0);
    expect(result.subtotalCents).toBe(3600);
    expect(result.taxCents).toBe(216);
    expect(result.totalCents).toBe(3816);
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
    expect(result.subtotalBeforeDiscountCents).toBe(7200);
    expect(result.quantityDiscountCents).toBe(360);
    expect(result.subtotalCents).toBe(6840);
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

    expect(result.ropeLinearFeet).toBe(8);
    expect(result.ropeCostCents).toBe(1600);
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
    expect(result.ropeCostCents).toBe(1600);
    expect(result.subtotalBeforeDiscountCents).toBe(8300);
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
});
