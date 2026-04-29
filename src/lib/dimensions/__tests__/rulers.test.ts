import { describe, it, expect } from 'vitest';
import { getRulerTicks } from '../rulers';

describe('getRulerTicks', () => {
  it('returns empty array for non-positive lengths', () => {
    expect(getRulerTicks(0, 'in')).toEqual([]);
    expect(getRulerTicks(-5, 'ft')).toEqual([]);
    expect(getRulerTicks(NaN, 'in')).toEqual([]);
  });

  it('produces ft labels at 0..N for a 4ft x 2ft style banner (48in width)', () => {
    const ticks = getRulerTicks(48, 'ft');
    const majors = ticks.filter(t => t.major);
    const labels = majors.map(t => t.label);
    expect(labels).toEqual(['0 ft', '1 ft', '2 ft', '3 ft', '4 ft']);
    expect(majors.map(t => t.pos)).toEqual([0, 12, 24, 36, 48]);
  });

  it('produces inch labels at 0..N for a 48in width', () => {
    const ticks = getRulerTicks(48, 'in');
    const majors = ticks.filter(t => t.major);
    expect(majors[0].label).toBe('0 in');
    expect(majors[majors.length - 1].label).toBe('48 in');
    const pos = majors.map(t => t.pos);
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
    expect(pos[pos.length - 1]).toBe(48);
  });

  it('honors maxMajorLabels by widening the major step', () => {
    const dense = getRulerTicks(48, 'in').filter(t => t.major).length;
    const sparse = getRulerTicks(48, 'in', { maxMajorLabels: 4 }).filter(t => t.major).length;
    expect(sparse).toBeLessThan(dense);
    expect(sparse).toBeLessThanOrEqual(5);
  });

  it('always includes endpoints in ft mode for non-integer foot lengths', () => {
    const ticks = getRulerTicks(30, 'ft'); // 2.5 ft
    const majors = ticks.filter(t => t.major);
    expect(majors[0].pos).toBe(0);
    expect(majors[majors.length - 1].pos).toBe(30);
  });

  it('positions are in inches regardless of display unit', () => {
    const inTicks = getRulerTicks(24, 'in').filter(t => t.major);
    const ftTicks = getRulerTicks(24, 'ft').filter(t => t.major);
    expect(inTicks[inTicks.length - 1].pos).toBe(24);
    expect(ftTicks[ftTicks.length - 1].pos).toBe(24);
  });
});
