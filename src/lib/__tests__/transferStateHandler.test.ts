import { describe, expect, it } from 'vitest';
import { serializeQuickQuote, parseQuickQuote } from '@/lib/transferStateHandler';

describe('transferStateHandler', () => {
  describe('banner round-trip', () => {
    it('preserves size, qty, material, and add-on flags', () => {
      const state = {
        productType: 'banner' as const,
        widthIn: 96,
        heightIn: 48,
        quantity: 3,
        material: '15oz',
        grommets: 'every-2ft',
        polePockets: 'top',
        addRope: true,
      };
      const params = serializeQuickQuote(state);
      const parsed = parseQuickQuote(params);
      expect(parsed).toEqual(state);
    });

    it('NEVER includes a price field in the params', () => {
      const params = serializeQuickQuote({
        productType: 'banner',
        widthIn: 96,
        heightIn: 48,
        quantity: 3,
        material: '15oz',
      });
      for (const key of params.keys()) {
        expect(key.toLowerCase()).not.toContain('price');
        expect(key.toLowerCase()).not.toContain('total');
      }
    });
  });

  describe('car magnet round-trip', () => {
    it('preserves size, qty, and rounded corners', () => {
      const state = {
        productType: 'car_magnet' as const,
        widthIn: 24,
        heightIn: 12,
        quantity: 5,
        roundedCorners: '0.5',
      };
      const parsed = parseQuickQuote(serializeQuickQuote(state));
      expect(parsed).toEqual(state);
    });
  });

  describe('yard sign round-trip', () => {
    it('preserves size, sidedness, qty, and step stake info', () => {
      const state = {
        productType: 'yard_sign' as const,
        size: '24x18',
        printSide: 'double' as const,
        quantity: 30,
        material: 'corrugated-plastic',
        stepStakes: true,
        stepStakeQty: 30,
      };
      const parsed = parseQuickQuote(serializeQuickQuote(state));
      expect(parsed).toEqual(state);
    });
  });

  describe('parser fallbacks', () => {
    it('returns null when no recognizable productType is present', () => {
      const params = new URLSearchParams({ qty: '1' });
      expect(parseQuickQuote(params)).toBeNull();
    });

    it('accepts product=car-magnets and yields car_magnet productType', () => {
      const parsed = parseQuickQuote(new URLSearchParams({
        product: 'car-magnets',
        size: '18x12',
        qty: '2',
      }));
      expect(parsed?.productType).toBe('car_magnet');
    });
  });
});
