import { describe, expect, it } from 'vitest';
import { calculatePositionedOutputSize } from './generatePositionedThumbnail';

describe('calculatePositionedOutputSize', () => {
  it('preserves a wide product aspect ratio', () => {
    expect(calculatePositionedOutputSize(96, 48, 1200)).toEqual({
      widthPx: 1200,
      heightPx: 600,
    });
  });

  it('preserves a tall product aspect ratio', () => {
    expect(calculatePositionedOutputSize(24, 48, 1200)).toEqual({
      widthPx: 600,
      heightPx: 1200,
    });
  });

  it('respects the mobile total-pixel cap', () => {
    const result = calculatePositionedOutputSize(48, 48, 1200, 1_000_000);
    expect(result.widthPx).toBe(1000);
    expect(result.heightPx).toBe(1000);
    expect(result.widthPx * result.heightPx).toBeLessThanOrEqual(1_000_000);
  });
});
