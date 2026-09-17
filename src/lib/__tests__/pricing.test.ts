import { describe, it, expect } from 'vitest';
import { inchesToSqFt, ropeCost, calcTotals, usd, PRICE_PER_SQFT, calculateTax, calculateTotalWithTax, TAX_RATE } from '../pricing';
import { calculateBannerPricing } from '../bannerPricingEngine';

describe('Pricing calculations', () => {
  it('should convert inches to square feet correctly', () => {
    expect(inchesToSqFt(48, 24)).toBe(8); // 48 * 24 / 144 = 8
    expect(inchesToSqFt(144, 144)).toBe(144); // 144 * 144 / 144 = 144
    expect(inchesToSqFt(12, 12)).toBe(1); // 12 * 12 / 144 = 1
  });

  it('should calculate rope cost correctly', () => {
    expect(ropeCost(48, 1)).toBe(8); // (48 / 12) * 2 * 1 = 8
    expect(ropeCost(48, 2)).toBe(16); // (48 / 12) * 2 * 2 = 16
    expect(ropeCost(24, 1)).toBe(4); // (24 / 12) * 2 * 1 = 4
  });

  it('should calculate totals correctly for 48x24 banner with 13oz vinyl', () => {
    const result = calcTotals({
      widthIn: 48,
      heightIn: 24,
      qty: 1,
      material: '13oz',
      addRope: false
    });

    expect(result.area).toBe(8);
    expect(result.unit).toBe(40);
    expect(result.rope).toBe(0);
    expect(result.materialTotal).toBe(40);
    expect(result.tax).toBe(2.4);
    expect(result.totalWithTax).toBe(42.4);
  });

  it('should calculate totals correctly with rope', () => {
    const result = calcTotals({
      widthIn: 48,
      heightIn: 24,
      qty: 2,
      material: '13oz',
      addRope: true
    });

    expect(result.area).toBe(8);
    expect(result.unit).toBe(40);
    expect(result.rope).toBe(16);
    expect(result.materialTotal).toBe(96);
    expect(result.tax).toBeCloseTo(5.76, 2);
    expect(result.totalWithTax).toBeCloseTo(101.76, 2);
  });

  it('keeps designer totals in parity for top-and-bottom rope placement', () => {
    const params = {
      widthIn: 48,
      heightIn: 24,
      qty: 2,
      material: '13oz' as const,
      addRope: true,
      ropePlacement: 'top-bottom' as const,
      polePockets: 'none',
    };
    const result = calcTotals(params);
    const canonical = calculateBannerPricing({
      widthIn: params.widthIn,
      heightIn: params.heightIn,
      quantity: params.qty,
      material: params.material,
      addRope: params.addRope,
      ropePlacement: params.ropePlacement,
      polePockets: params.polePockets,
    });

    expect(result.rope).toBe(32);
    expect(result.materialTotal).toBe(112);
    expect(result.rope * 100).toBe(canonical.ropeCostCents);
    expect(result.materialTotal * 100).toBe(canonical.subtotalBeforeDiscountCents);
  });

  it('should format currency correctly', () => {
    expect(usd(36)).toBe('$36.00');
    expect(usd(36.5)).toBe('$36.50');
    expect(usd(1234.56)).toBe('$1,234.56');
  });

  it('should have correct price per square foot values', () => {
    expect(PRICE_PER_SQFT['13oz']).toBe(4.5);
    expect(PRICE_PER_SQFT['15oz']).toBe(6.0);
    expect(PRICE_PER_SQFT['18oz']).toBe(7.5);
    expect(PRICE_PER_SQFT['mesh']).toBe(6.0);
  });

  describe('Quick Quote specific calculations', () => {
    it('should calculate correct prices for different materials with 48x24 banner', () => {
      const baseParams = { widthIn: 48, heightIn: 24, qty: 1, addRope: false };

      // 13oz: 8 sq ft * $5.00 = $40.00
      expect(calcTotals({ ...baseParams, material: '13oz' }).materialTotal).toBe(40);

      // 15oz: 8 sq ft * $6.00 = $48.00
      expect(calcTotals({ ...baseParams, material: '15oz' }).materialTotal).toBe(48);

      // 18oz: 8 sq ft * $7.50 = $60.00
      expect(calcTotals({ ...baseParams, material: '18oz' }).materialTotal).toBe(60);

      // Mesh: 8 sq ft * $6.00 = $48.00
      expect(calcTotals({ ...baseParams, material: 'mesh' }).materialTotal).toBe(48);
    });

    it('should handle quantity correctly', () => {
      const result = calcTotals({
        widthIn: 48,
        heightIn: 24,
        qty: 3,
        material: '13oz',
        addRope: false
      });

      expect(result.area).toBe(8);
      expect(result.unit).toBe(40);
      expect(result.materialTotal).toBe(120);
      expect(result.tax).toBeCloseTo(7.2, 2);
      expect(result.totalWithTax).toBeCloseTo(127.2, 2);
    });
  });

  describe('Tax calculations', () => {
    it('should calculate 6% tax correctly', () => {
      expect(calculateTax(100)).toBe(6);
      expect(calculateTax(50)).toBe(3);
      expect(calculateTax(36)).toBe(2.16);
    });

    it('should calculate total with tax correctly', () => {
      expect(calculateTotalWithTax(100)).toBe(106);
      expect(calculateTotalWithTax(50)).toBe(53);
      expect(calculateTotalWithTax(36)).toBe(38.16);
    });

    it('should have correct tax rate constant', () => {
      expect(TAX_RATE).toBe(0.06);
    });
  });
});
