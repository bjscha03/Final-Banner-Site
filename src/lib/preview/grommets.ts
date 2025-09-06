import { Grommets } from '@/store/quote';

export type GrommetMode = Grommets;

const INSET = 1; // inches from each edge

type Pt = { x: number; y: number };

export function grommetPoints(w: number, h: number, mode: GrommetMode): Pt[] {
  if (mode === 'none') return [];
  
  const c: Pt[] = [
    { x: INSET,     y: INSET     }, // TL
    { x: w - INSET, y: INSET     }, // TR
    { x: INSET,     y: h - INSET }, // BL
    { x: w - INSET, y: h - INSET }, // BR
  ];

  if (mode === '4-corners') return c;
  if (mode === 'top-corners') return [c[0], c[1]];
  if (mode === 'right-corners') return [c[1], c[3]];
  if (mode === 'left-corners') return [c[0], c[2]];

  const s = mode === 'every-1-2ft' ? 18 : 24; // inches
  const pts: Pt[] = [...c];

  // midpoints helper: evenly distribute between corners, excluding corners
  const mids = (usableInches: number, spacingInches: number) => {
    const n = Math.floor(usableInches / spacingInches);
    if (n <= 0) return [] as number[];
    const step = usableInches / (n + 1);
    return Array.from({ length: n }, (_, k) => (k + 1) * step);
  };

  // top/bottom runs
  for (const dx of mids(w - 2 * INSET, s)) {
    pts.push({ x: INSET + dx, y: INSET });       // top
    pts.push({ x: INSET + dx, y: h - INSET });   // bottom
  }
  
  // left/right runs
  for (const dy of mids(h - 2 * INSET, s)) {
    pts.push({ x: INSET,     y: INSET + dy });   // left
    pts.push({ x: w - INSET, y: INSET + dy });   // right
  }

  // de-dupe numeric equals (corners)
  return pts.filter((p, i, a) =>
    a.findIndex(q => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6) === i
  );
}

// radius scales with physical size so it's visible at any dimension - made more prominent
export function grommetRadius(w: number, h: number) {
  return Math.max(0.2, Math.min(w, h) * 0.02);
}
