import { describe, it, expect } from 'vitest';
import {
  validateYardSignQuantity,
  YARD_SIGN_MAX_QUANTITY,
  YARD_SIGN_MIN_QUANTITY,
  YARD_SIGN_INCREMENT,
  getTotalDesignQuantity,
  type YardSignDesign,
} from '../yard-sign-pricing';

describe('validateYardSignQuantity', () => {
  it('returns invalid (no message) for 0', () => {
    const result = validateYardSignQuantity(0);
    expect(result.valid).toBe(false);
    expect(result.message).toBeUndefined();
  });

  it('returns minimum error for quantity less than 10', () => {
    const result = validateYardSignQuantity(5);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Minimum order is 10');
  });

  it('TEST 1: allows total = 10', () => {
    const result = validateYardSignQuantity(10);
    expect(result.valid).toBe(true);
  });

  it('TEST 2: allows total = 20', () => {
    const result = validateYardSignQuantity(20);
    expect(result.valid).toBe(true);
  });

  it('TEST 3: blocks total = 7', () => {
    const result = validateYardSignQuantity(7);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Minimum order is 10');
  });

  it('TEST 4: blocks total = 25', () => {
    const result = validateYardSignQuantity(25);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('increments of 10');
  });

  it('TEST 5: allows total = 90', () => {
    const result = validateYardSignQuantity(90);
    expect(result.valid).toBe(true);
  });

  it('TEST 6: blocks total = 100', () => {
    const result = validateYardSignQuantity(100);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Maximum');
  });

  it('allows 30', () => {
    expect(validateYardSignQuantity(30).valid).toBe(true);
  });

  it('allows 50', () => {
    expect(validateYardSignQuantity(50).valid).toBe(true);
  });

  it('allows 70', () => {
    expect(validateYardSignQuantity(70).valid).toBe(true);
  });

  it('blocks 15', () => {
    const result = validateYardSignQuantity(15);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('increments of 10');
  });

  it('blocks 42', () => {
    const result = validateYardSignQuantity(42);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('increments of 10');
  });

  it('blocks 1', () => {
    const result = validateYardSignQuantity(1);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Minimum order is 10');
  });

  it('exports correct constants', () => {
    expect(YARD_SIGN_MAX_QUANTITY).toBe(90);
    expect(YARD_SIGN_MIN_QUANTITY).toBe(10);
    expect(YARD_SIGN_INCREMENT).toBe(10);
  });
});

describe('getTotalDesignQuantity', () => {
  const makeDesign = (qty: number): YardSignDesign => ({
    id: `${qty}`,
    fileName: 'test.png',
    fileUrl: 'https://example.com/test.png',
    fileKey: 'test-key',
    thumbnailUrl: 'https://example.com/thumb.png',
    isPdf: false,
    quantity: qty,
  });

  it('sums quantities across multiple designs (valid: 5+5=10)', () => {
    const designs = [makeDesign(5), makeDesign(5)];
    expect(getTotalDesignQuantity(designs)).toBe(10);
    expect(validateYardSignQuantity(getTotalDesignQuantity(designs)).valid).toBe(true);
  });

  it('sums quantities across multiple designs (invalid: 3+4=7)', () => {
    const designs = [makeDesign(3), makeDesign(4)];
    expect(getTotalDesignQuantity(designs)).toBe(7);
    expect(validateYardSignQuantity(getTotalDesignQuantity(designs)).valid).toBe(false);
  });

  it('single design with quantity 10 is valid', () => {
    expect(getTotalDesignQuantity([makeDesign(10)])).toBe(10);
    expect(validateYardSignQuantity(10).valid).toBe(true);
  });

  it('empty designs returns 0', () => {
    expect(getTotalDesignQuantity([])).toBe(0);
  });
});
