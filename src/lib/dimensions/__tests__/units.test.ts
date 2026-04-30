import { describe, expect, it } from 'vitest';

import {
  feetToInches,
  formatDimensionInUnit,
  inchesToFeet,
  normalizeDimensions,
} from '../units';

describe('dimension unit utilities', () => {
  it('inchesToFeet converts correctly', () => {
    expect(inchesToFeet(48)).toBe(4);
    expect(inchesToFeet(24)).toBe(2);
    expect(inchesToFeet(0)).toBe(0);
    expect(inchesToFeet(6)).toBe(0.5);
  });

  it('feetToInches converts correctly', () => {
    expect(feetToInches(4)).toBe(48);
    expect(feetToInches(2)).toBe(24);
    expect(feetToInches(0)).toBe(0);
    expect(feetToInches(0.5)).toBe(6);
  });

  it('round trips inches -> feet -> inches', () => {
    expect(feetToInches(inchesToFeet(48))).toBe(48);
    expect(feetToInches(inchesToFeet(96))).toBe(96);
  });

  it('handles non-finite input safely', () => {
    expect(inchesToFeet(NaN)).toBe(0);
    expect(feetToInches(Infinity)).toBe(0);
  });

  it('normalizeDimensions in inches passes through', () => {
    expect(normalizeDimensions(48, 24, 'in')).toEqual({ widthIn: 48, heightIn: 24 });
  });

  it('normalizeDimensions in feet converts to inches', () => {
    expect(normalizeDimensions(4, 2, 'ft')).toEqual({ widthIn: 48, heightIn: 24 });
  });

  it('formatDimensionInUnit shows expected labels', () => {
    expect(formatDimensionInUnit(48, 'in')).toBe('48 in');
    expect(formatDimensionInUnit(48, 'ft')).toBe('4 ft');
    expect(formatDimensionInUnit(30, 'ft')).toBe('2.5 ft');
    expect(formatDimensionInUnit(0, 'in')).toBe('0 in');
  });
});
