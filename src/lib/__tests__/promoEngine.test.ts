import { describe, expect, it } from 'vitest';
import { resolvePromo, computePromoTotals, getKnownPromo, KNOWN_PROMO_CODES } from '@/lib/promoEngine';

describe('promoEngine', () => {
  describe('getKnownPromo', () => {
    it('returns NEW20 metadata case-insensitively', () => {
      expect(getKnownPromo('new20')?.code).toBe('NEW20');
      expect(getKnownPromo('NEW20')?.discountPercentage).toBe(20);
    });
    it('returns null for unknown / empty codes', () => {
      expect(getKnownPromo(null)).toBeNull();
      expect(getKnownPromo('')).toBeNull();
      expect(getKnownPromo('BOGUS')).toBeNull();
    });
    it('NEW20 is flagged as first-order-only', () => {
      expect(KNOWN_PROMO_CODES.NEW20.firstOrderOnly).toBe(true);
    });
  });

  describe('no auto-application', () => {
    it('returns no discount when no code is supplied (qty 1)', () => {
      const r = resolvePromo({ subtotalCents: 5000, quantity: 1, code: null });
      expect(r.appliedDiscountType).toBe('none');
      expect(r.appliedDiscountAmountCents).toBe(0);
    });
    it('returns ONLY quantity discount when no code is supplied (qty 3)', () => {
      const r = resolvePromo({ subtotalCents: 10000, quantity: 3, code: null });
      expect(r.appliedDiscountType).toBe('quantity');
      expect(r.appliedDiscountAmountCents).toBe(700); // 7%
      expect(r.promoDiscountAvailable).toBe(false);
    });
  });

  describe('best-discount-wins (no stacking)', () => {
    it('promo wins over quantity at qty 1 when promo is bigger', () => {
      const r = resolvePromo({ subtotalCents: 10000, quantity: 1, code: 'NEW20' });
      expect(r.appliedDiscountType).toBe('promo');
      expect(r.appliedDiscountAmountCents).toBe(2000);
    });
    it('promo wins over quantity at qty 3 (20% > 7%)', () => {
      const r = resolvePromo({ subtotalCents: 10000, quantity: 3, code: 'NEW20' });
      expect(r.appliedDiscountType).toBe('promo');
      expect(r.appliedDiscountAmountCents).toBe(2000);
    });
    it('discounts do NOT stack: applied amount equals only the winner', () => {
      const r = resolvePromo({ subtotalCents: 10000, quantity: 5, code: 'NEW20' });
      // qty 5 = 13% = $13.00; promo NEW20 = 20% = $20.00 → promo wins.
      expect(r.appliedDiscountAmountCents).toBe(2000);
      expect(r.appliedDiscountType).toBe('promo');
      // Both are still surfaced as "available" for UI helper messaging.
      expect(r.quantityDiscountAvailable).toBe(true);
      expect(r.promoDiscountAvailable).toBe(true);
    });
  });

  describe('computePromoTotals', () => {
    it('computes tax on subtotal-after-best-discount', () => {
      const t = computePromoTotals(10000, 3, 0.06, 'NEW20');
      expect(t.subtotalCents).toBe(10000);
      expect(t.discount.appliedDiscountAmountCents).toBe(2000);
      expect(t.subtotalAfterDiscountCents).toBe(8000);
      expect(t.taxCents).toBe(480);
      expect(t.totalCents).toBe(8480);
    });
    it('does not apply ANY discount when code is null', () => {
      const t = computePromoTotals(10000, 1, 0.06, null);
      expect(t.discount.appliedDiscountAmountCents).toBe(0);
      expect(t.subtotalAfterDiscountCents).toBe(10000);
      expect(t.totalCents).toBe(10600);
    });
  });
});
