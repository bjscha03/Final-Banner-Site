import { describe, expect, it } from 'vitest';
import { getProductConfig, validateProductConfiguration } from '.';

describe('product registry checkout validation', () => {
  it('enforces the banner minimum, maximum, and square-foot ceiling', () => {
    expect(validateProductConfiguration({ productType: 'banner', widthIn: 5, heightIn: 24 })).toMatchObject({
      valid: false,
      code: 'DIMENSIONS_OUT_OF_RANGE',
    });
    expect(validateProductConfiguration({ productType: 'banner', widthIn: 601, heightIn: 24 })).toMatchObject({
      valid: false,
      code: 'DIMENSIONS_OUT_OF_RANGE',
    });
    expect(validateProductConfiguration({ productType: 'banner', widthIn: 600, heightIn: 241 })).toMatchObject({
      valid: false,
      code: 'AREA_LIMIT_EXCEEDED',
    });
  });

  it('keeps bottom-corners grommets in registry and designer validation parity', () => {
    expect(getProductConfig('banner').grommets.some((option) => option.value === 'bottom-corners')).toBe(true);
    expect(validateProductConfiguration({
      productType: 'banner',
      widthIn: 48,
      heightIn: 24,
      grommets: 'bottom-corners',
    })).toEqual({ valid: true });
  });
});
