export type ArtworkCorner = 'tl' | 'tr' | 'bl' | 'br';
type Transform = { x: number; y: number; scaleX: number; scaleY: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Resize around the opposite artwork corner. */
export function resizeArtworkFromCorner(
  original: Transform, base: { w: number; h: number }, corner: ArtworkCorner,
  dx: number, dy: number, locked: boolean,
): Transform {
  const sx = corner === 'tr' || corner === 'br' ? 1 : -1;
  const sy = corner === 'bl' || corner === 'br' ? 1 : -1;
  let scaleX = clamp(original.scaleX + sx * dx / base.w, 0.2, 5);
  let scaleY = clamp(original.scaleY + sy * dy / base.h, 0.2, 5);
  if (locked) {
    const rx = sx * dx / (base.w * original.scaleX);
    const ry = sy * dy / (base.h * original.scaleY);
    const ratio = clamp(1 + (Math.abs(rx) >= Math.abs(ry) ? rx : ry),
      Math.max(0.2 / original.scaleX, 0.2 / original.scaleY),
      Math.min(5 / original.scaleX, 5 / original.scaleY));
    scaleX = original.scaleX * ratio;
    scaleY = original.scaleY * ratio;
  }
  return {
    x: original.x + sx * base.w * (scaleX - original.scaleX) / 2,
    y: original.y + sy * base.h * (scaleY - original.scaleY) / 2,
    scaleX, scaleY,
  };
}
