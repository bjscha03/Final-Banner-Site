import { describe, expect, it } from 'vitest';

import { DESIGN_GROMMET_OPTIONS, getGrommetLabel } from '../grommets';

describe('grommet helpers', () => {
  it('exposes the shared design and Google Ads grommet options', () => {
    expect(DESIGN_GROMMET_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'every-2-3ft',
      'every-1-2ft',
      '4-corners',
      'top-corners',
      'bottom-corners',
      'left-corners',
      'right-corners',
    ]);

    expect(DESIGN_GROMMET_OPTIONS.map((option) => option.label)).toEqual([
      'None',
      'Every 2–3 Feet',
      'Every 1–2 Feet',
      '4 Corners Only',
      'Top Corners Only',
      'Bottom Corners Only',
      'Left Side Only',
      'Right Side Only',
    ]);
  });

  it('formats current stored grommet values for display', () => {
    expect(getGrommetLabel('none')).toBe('None');
    expect(getGrommetLabel('4-corners')).toBe('4 Corners Only');
    expect(getGrommetLabel('every-2-3ft')).toBe('Every 2–3 Feet');
    expect(getGrommetLabel('every-1-2ft')).toBe('Every 1–2 Feet');
    expect(getGrommetLabel('top-corners')).toBe('Top Corners Only');
    expect(getGrommetLabel('bottom-corners')).toBe('Bottom Corners Only');
    expect(getGrommetLabel('left-corners')).toBe('Left Side Only');
    expect(getGrommetLabel('right-corners')).toBe('Right Side Only');
  });
});
