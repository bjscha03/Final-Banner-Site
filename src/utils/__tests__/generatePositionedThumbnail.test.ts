import { describe, expect, it } from 'vitest';
import { calculatePositionedOutputSize } from '../generatePositionedThumbnail';

describe('calculatePositionedOutputSize', () => {
  it('targets 6000px longest side for high-resolution web previews under the pixel cap', () => {
    const size = calculatePositionedOutputSize(24, 72, 6000, 24_000_000);

    expect(Math.max(size.widthPx, size.heightPx)).toBe(6000);
    expect(size.widthPx * size.heightPx).toBeLessThanOrEqual(24_000_000);
    expect(size.widthPx).toBe(2000);
  });

  it('scales below 6000px longest side when the 24MP cap requires it', () => {
    const size = calculatePositionedOutputSize(102, 84, 6000, 24_000_000);

    expect(Math.max(size.widthPx, size.heightPx)).toBeGreaterThan(1200);
    expect(Math.max(size.widthPx, size.heightPx)).toBeLessThan(6000);
    expect(size.widthPx * size.heightPx).toBeLessThanOrEqual(24_000_000);
  });

  it.each([
    [24, 18],
    [48, 24],
    [72, 24],
    [72, 36],
    [96, 48],
    [120, 48],
    [120, 12],
    [24, 72],
    [24, 24],
    [240, 12],
    [12, 240],
  ])('bounds %d × %d inches by pixels while preserving product ratio', (widthIn, heightIn) => {
    const size = calculatePositionedOutputSize(widthIn, heightIn, 1400, 1_500_000);
    expect(Math.max(size.widthPx, size.heightPx)).toBeLessThanOrEqual(1400);
    expect(size.widthPx * size.heightPx).toBeLessThanOrEqual(1_500_000);
    expect(size.widthPx / size.heightPx).toBeCloseTo(widthIn / heightIn, 2);
  });
});
