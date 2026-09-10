import { describe, it, expect } from 'vitest';
import {
  QUANTITY_DISCOUNT_TIERS,
  getQuantityDiscountRate,
  calculateQuantityDiscount,
  getAllDiscountTiers,
} from '../quantity-discount';

describe('Quantity Discount - "Buy More, Save More"', () => {
  describe('QUANTITY_DISCOUNT_TIERS', () => {
    it('should have correct tier configuration', () => {
      expect(QUANTITY_DISCOUNT_TIERS).toHaveLength(5);
      
      // Verify tier structure
      expect(QUANTITY_DISCOUNT_TIERS[0]).toEqual({ minQuantity: 1, discountRate: 0.00, label: '0% OFF' });
      expect(QUANTITY_DISCOUNT_TIERS[1]).toEqual({ minQuantity: 2, discountRate: 0.05, label: '5% OFF' });
      expect(QUANTITY_DISCOUNT_TIERS[2]).toEqual({ minQuantity: 3, discountRate: 0.07, label: '7% OFF' });
      expect(QUANTITY_DISCOUNT_TIERS[3]).toEqual({ minQuantity: 4, discountRate: 0.10, label: '10% OFF' });
      expect(QUANTITY_DISCOUNT_TIERS[4]).toEqual({ minQuantity: 5, discountRate: 0.13, label: '13% OFF' });
    });
  });

  describe('getQuantityDiscountRate', () => {
    it('should return 0% for quantity 1', () => {
      expect(getQuantityDiscountRate(1)).toBe(0.00);
    });

    it('should return 5% for quantity 2', () => {
      expect(getQuantityDiscountRate(2)).toBe(0.05);
    });

    it('should return 7% for quantity 3', () => {
      expect(getQuantityDiscountRate(3)).toBe(0.07);
    });

    it('should return 10% for quantity 4', () => {
      expect(getQuantityDiscountRate(4)).toBe(0.10);
    });

    it('should return 13% for quantity 5', () => {
      expect(getQuantityDiscountRate(5)).toBe(0.13);
    });

    it('should return 13% for quantity 6 (uses highest tier)', () => {
      expect(getQuantityDiscountRate(6)).toBe(0.13);
    });

    it('should return 13% for very large quantities', () => {
      expect(getQuantityDiscountRate(100)).toBe(0.13);
    });

    it('should return 0% for quantity 0 or less', () => {
      expect(getQuantityDiscountRate(0)).toBe(0.00);
      expect(getQuantityDiscountRate(-1)).toBe(0.00);
    });
  });

  describe('calculateQuantityDiscount', () => {
    it('should calculate 0% discount for qty 1', () => {
      const result = calculateQuantityDiscount(10000, 1); // $100.00 subtotal

      expect(result.quantity).toBe(1);
      expect(result.discountRate).toBe(0.00);
      expect(result.discountCents).toBe(0);
      expect(result.subtotalBeforeDiscountCents).toBe(10000);
      expect(result.subtotalAfterDiscountCents).toBe(10000);
    });

    it('should calculate 5% discount for qty 2', () => {
      const result = calculateQuantityDiscount(10000, 2); // $100.00 subtotal

      expect(result.quantity).toBe(2);
      expect(result.discountRate).toBe(0.05);
      expect(result.discountCents).toBe(500); // $5.00
      expect(result.subtotalBeforeDiscountCents).toBe(10000);
      expect(result.subtotalAfterDiscountCents).toBe(9500); // $95.00
    });

    it('should calculate 7% discount for qty 3', () => {
      const result = calculateQuantityDiscount(10000, 3);

      expect(result.discountRate).toBe(0.07);
      expect(result.discountCents).toBe(700); // $7.00
      expect(result.subtotalAfterDiscountCents).toBe(9300);
    });

    it('should calculate 10% discount for qty 4', () => {
      const result = calculateQuantityDiscount(10000, 4);

      expect(result.discountRate).toBe(0.10);
      expect(result.discountCents).toBe(1000); // $10.00
      expect(result.subtotalAfterDiscountCents).toBe(9000);
    });

    it('should calculate 13% discount for qty 5', () => {
      const result = calculateQuantityDiscount(10000, 5);

      expect(result.discountRate).toBe(0.13);
      expect(result.discountCents).toBe(1300); // $13.00
      expect(result.subtotalAfterDiscountCents).toBe(8700);
    });

    it('should calculate 13% discount for qty 6 (max tier)', () => {
      const result = calculateQuantityDiscount(10000, 6);

      expect(result.discountRate).toBe(0.13);
      expect(result.discountCents).toBe(1300);
      expect(result.subtotalAfterDiscountCents).toBe(8700);
    });

    it('should round cents correctly (no float drift)', () => {
      // Test with a subtotal that would cause float issues: $33.33
      const result = calculateQuantityDiscount(3333, 2); // 5% of 3333 = 166.65

      expect(result.discountCents).toBe(167); // Should round properly
      expect(result.subtotalAfterDiscountCents).toBe(3166);
    });

    it('should handle edge case of very small subtotal', () => {
      const result = calculateQuantityDiscount(100, 5); // $1.00 with 13% off

      expect(result.discountCents).toBe(13);
      expect(result.subtotalAfterDiscountCents).toBe(87);
    });

    it('should handle zero subtotal', () => {
      const result = calculateQuantityDiscount(0, 5);

      expect(result.discountCents).toBe(0);
      expect(result.subtotalAfterDiscountCents).toBe(0);
    });
  });

  describe('getAllDiscountTiers', () => {
    it('should return all tiers for UI display', () => {
      const tiers = getAllDiscountTiers();
      
      expect(tiers).toHaveLength(5);
      expect(tiers).toEqual(QUANTITY_DISCOUNT_TIERS);
    });
  });
});

