import { describe, expect, it } from 'vitest';

import { DESIGN_GROMMET_OPTIONS, getGrommetLabel } from '../grommets';

describe('grommet helpers', () => {
  it('exposes the shared design and Google Ads grommet options', () => {
    expect(DESIGN_GROMMET_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      '4-corners',
      'every-2-3ft',
    ]);

    expect(DESIGN_GROMMET_OPTIONS.map((option) => option.label)).toEqual([
      'None',
      '4 Corners',
      'Every 2 Feet',
    ]);
  });

  it('formats current and legacy stored grommet values for display', () => {
    expect(getGrommetLabel('none')).toBe('None');
    expect(getGrommetLabel('4-corners')).toBe('4 Corners');
    expect(getGrommetLabel('every-2-3ft')).toBe('Every 2 Feet');
    expect(getGrommetLabel('every-1-2ft')).toBe('Every 1–2 Feet');
    expect(getGrommetLabel('top-corners')).toBe('Top Corners');
  });
});
