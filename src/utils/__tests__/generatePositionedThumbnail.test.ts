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
});
