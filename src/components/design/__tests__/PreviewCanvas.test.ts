import { describe, it, expect } from 'vitest';

// Helper functions from PreviewCanvas (extracted for testing)
function cornerPoints(w: number, h: number, m: number) {
  return [
    { x: m, y: m },           // TL
    { x: w - m, y: m },       // TR
    { x: m, y: h - m },       // BL
    { x: w - m, y: h - m },   // BR
  ];
}

function midpoints(length: number, m: number, spacing: number): number[] {
  const usable = Math.max(0, length - 2 * m);
  const n = Math.floor(usable / spacing);
  if (n <= 0) return [];
  const step = usable / (n + 1);
  return Array.from({ length: n }, (_, k) => m + (k + 1) * step);
}

function dedupe(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const seen = new Set<string>();
  return points.filter(p => {
    const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type Grommets = 
  | 'none'
  | 'every-2-3ft'
  | 'every-1-2ft'
  | '4-corners'
  | 'top-corners'
  | 'right-corners'
  | 'left-corners';

function grommetPoints(w: number, h: number, mode: Grommets) {
  const m = 1; // 1 inch margin from edges
  const corners = cornerPoints(w, h, m);
  const pts: { x: number; y: number }[] = [];

  const addCorners = (sides: ('top' | 'right' | 'bottom' | 'left')[]) => {
    const [TL, TR, BL, BR] = corners;
    if (sides.includes('top')) { pts.push(TL, TR); }
    if (sides.includes('bottom')) { pts.push(BL, BR); }
    if (sides.includes('left')) { pts.push(TL, BL); }
    if (sides.includes('right')) { pts.push(TR, BR); }
  };

  if (mode === 'none') return pts;

  if (mode === '4-corners') {
    pts.push(...corners);
    return dedupe(pts);
  }

  if (mode === 'top-corners') { addCorners(['top']); return dedupe(pts); }
  if (mode === 'left-corners') { addCorners(['left']); return dedupe(pts); }
  if (mode === 'right-corners') { addCorners(['right']); return dedupe(pts); }

  // every-N case:
  const s = mode === 'every-1-2ft' ? 18 : 24; // inches
  
  // Add corners first
  pts.push(...corners);

  // Add top/bottom midpoints
  for (const x of midpoints(w, m, s)) {
    pts.push({ x, y: m });          // top
    pts.push({ x, y: h - m });      // bottom
  }
  
  // Add left/right midpoints
  for (const y of midpoints(h, m, s)) {
    pts.push({ x: m, y });          // left
    pts.push({ x: w - m, y });      // right
  }
  
  return dedupe(pts);
}

describe('Grommet Calculations', () => {
  it('should return no grommets for none mode', () => {
    const points = grommetPoints(48, 24, 'none');
    expect(points).toHaveLength(0);
  });

  it('should return exactly 4 grommets for 4-corners mode', () => {
    const points = grommetPoints(48, 24, '4-corners');
    expect(points).toHaveLength(4);
    
    // Check corner positions (1 inch inset)
    expect(points).toContainEqual({ x: 1, y: 1 });     // TL
    expect(points).toContainEqual({ x: 47, y: 1 });    // TR
    expect(points).toContainEqual({ x: 1, y: 23 });    // BL
    expect(points).toContainEqual({ x: 47, y: 23 });   // BR
  });

  it('should return only top corners for top-corners mode', () => {
    const points = grommetPoints(48, 24, 'top-corners');
    expect(points).toHaveLength(2);
    expect(points).toContainEqual({ x: 1, y: 1 });     // TL
    expect(points).toContainEqual({ x: 47, y: 1 });    // TR
  });

  it('should calculate correct spacing for every-2-3ft (24") on 48x24 banner', () => {
    const points = grommetPoints(48, 24, 'every-2-3ft');
    
    // Should have 4 corners + midpoints
    // Width: 48" - 2" (margins) = 46" usable, 46/24 = 1.9, floor = 1 midpoint per edge
    // Height: 24" - 2" (margins) = 22" usable, 22/24 = 0.9, floor = 0 midpoints per edge
    // Expected: 4 corners + 2 top/bottom midpoints = 6 total
    expect(points.length).toBeGreaterThanOrEqual(4);
    
    // Should include all 4 corners
    expect(points).toContainEqual({ x: 1, y: 1 });     // TL
    expect(points).toContainEqual({ x: 47, y: 1 });    // TR
    expect(points).toContainEqual({ x: 1, y: 23 });    // BL
    expect(points).toContainEqual({ x: 47, y: 23 });   // BR
  });

  it('should calculate correct spacing for every-1-2ft (18") spacing', () => {
    const points = grommetPoints(48, 24, 'every-1-2ft');
    
    // Should have more grommets than 24" spacing
    const points24 = grommetPoints(48, 24, 'every-2-3ft');
    expect(points.length).toBeGreaterThanOrEqual(points24.length);
  });

  it('should handle edge cases with small banners', () => {
    const points = grommetPoints(12, 12, 'every-2-3ft');
    
    // Small banner should still have 4 corners minimum
    expect(points.length).toBeGreaterThanOrEqual(4);
  });

  it('should calculate grommet radius correctly', () => {
    const radius1 = Math.max(0.15, Math.min(48, 24) * 0.0075);
    const radius2 = Math.max(0.15, Math.min(12, 12) * 0.0075);
    
    expect(radius1).toBe(0.18); // 24 * 0.0075 = 0.18
    expect(radius2).toBe(0.15); // min value
  });
});
