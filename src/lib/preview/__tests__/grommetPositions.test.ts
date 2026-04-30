import { describe, expect, it } from 'vitest';

import {
  GROMMET_EDGE_INSET_IN,
  getGrommetPositions,
  getGrommetRadius,
  toGrommetOverlayOption,
} from '../grommetPositions';

describe('getGrommetPositions', () => {
  it('returns no positions for option=none', () => {
    expect(getGrommetPositions(48, 24, 'none')).toHaveLength(0);
  });

  it('returns 4 inset corners for 4-corners option', () => {
    const pts = getGrommetPositions(48, 24, '4-corners');
    expect(pts).toHaveLength(4);
    const m = GROMMET_EDGE_INSET_IN;
    expect(pts).toContainEqual({ x: m, y: m });
    expect(pts).toContainEqual({ x: 48 - m, y: m });
    expect(pts).toContainEqual({ x: m, y: 24 - m });
    expect(pts).toContainEqual({ x: 48 - m, y: 24 - m });
  });

  it('returns evenly spaced grommets for every-2-feet on a 4ft x 2ft banner', () => {
    // 4 ft × 2 ft = 48 in × 24 in
    const pts = getGrommetPositions(48, 24, 'every-2-feet');
    // At minimum the 4 corners are present.
    expect(pts.length).toBeGreaterThanOrEqual(4);
    // Symmetry check: each edge position has its opposite-edge counterpart.
    const xs = pts.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(GROMMET_EDGE_INSET_IN, 5);
    expect(xs[xs.length - 1]).toBeCloseTo(48 - GROMMET_EDGE_INSET_IN, 5);
  });

  it('treats inches and feet equivalently when normalized to inches', () => {
    // 4 ft × 2 ft (entered in feet, normalized to inches)
    const ft = getGrommetPositions(4 * 12, 2 * 12, 'every-2-feet');
    // 48 in × 24 in (already inches)
    const inches = getGrommetPositions(48, 24, 'every-2-feet');
    expect(ft).toEqual(inches);
  });

  it('returns no positions for invalid sizes', () => {
    expect(getGrommetPositions(0, 24, '4-corners')).toEqual([]);
    expect(getGrommetPositions(48, -1, '4-corners')).toEqual([]);
    expect(getGrommetPositions(NaN, 24, '4-corners')).toEqual([]);
  });

  it('handles very small banners without inverting positions', () => {
    const pts = getGrommetPositions(1.5, 1.5, '4-corners');
    expect(pts.length).toBeGreaterThan(0);
    pts.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1.5);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1.5);
    });
  });
});

describe('toGrommetOverlayOption', () => {
  it('maps legacy values to the PR-2 overlay options', () => {
    expect(toGrommetOverlayOption('none')).toBe('none');
    expect(toGrommetOverlayOption(undefined)).toBe('none');
    expect(toGrommetOverlayOption('4-corners')).toBe('4-corners');
    expect(toGrommetOverlayOption('top-corners')).toBe('4-corners');
    expect(toGrommetOverlayOption('left-corners')).toBe('4-corners');
    expect(toGrommetOverlayOption('right-corners')).toBe('4-corners');
    expect(toGrommetOverlayOption('every-2-3ft')).toBe('every-2-feet');
    expect(toGrommetOverlayOption('every-1-2ft')).toBe('every-2-feet');
  });
});

describe('getGrommetRadius', () => {
  it('stays within bounds across banner sizes', () => {
    expect(getGrommetRadius(12, 12)).toBeGreaterThanOrEqual(0.25);
    expect(getGrommetRadius(1000, 1000)).toBeLessThanOrEqual(0.6);
    expect(getGrommetRadius(0, 0)).toBeGreaterThanOrEqual(0.25);
  });
});
