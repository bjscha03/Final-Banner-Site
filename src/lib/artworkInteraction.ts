export type ArtworkCorner = 'tl' | 'tr' | 'bl' | 'br';
type Transform = { x: number; y: number; scaleX: number; scaleY: number };
type Rect = { left: number; top: number; width: number; height: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Visible proxy controls never change the actual artwork or print rectangle. */
export function reachableArtworkFrame(frame: Rect, canvas: { w: number; h: number }): Rect {
  const insetX = Math.min(22, canvas.w / 4);
  const insetY = Math.min(22, canvas.h / 4);
  const minWidth = Math.min(44, canvas.w - 2 * insetX);
  const minHeight = Math.min(44, canvas.h - 2 * insetY);
  const left = clamp(frame.left, insetX, canvas.w - insetX - minWidth);
  const top = clamp(frame.top, insetY, canvas.h - insetY - minHeight);
  const right = clamp(frame.left + frame.width, left + minWidth, canvas.w - insetX);
  const bottom = clamp(frame.top + frame.height, top + minHeight, canvas.h - insetY);
  return { left, top, width: right - left, height: bottom - top };
}

/** Resize around the opposite artwork corner, including when controls are proxies. */
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
