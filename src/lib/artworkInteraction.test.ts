import { describe, expect, it } from 'vitest';
import { reachableArtworkFrame, resizeArtworkFromCorner, type ArtworkCorner } from './artworkInteraction';

describe('reachable artwork controls', () => {
  it.each([{ w: 240, h: 120 }, { w: 320, h: 40 }, { w: 900, h: 450 }])('keeps controls inside %o without changing artwork', canvas => {
    for (const frame of [
      { left: -1000, top: -500, width: 2000, height: 1000 },
      { left: 2000, top: 2000, width: 10, height: 10 },
      { left: -2000, top: -2000, width: 10, height: 10 },
    ]) {
      const original = { ...frame };
      const controls = reachableArtworkFrame(frame, canvas);
      expect(controls.left).toBeGreaterThanOrEqual(0);
      expect(controls.top).toBeGreaterThanOrEqual(0);
      expect(controls.left + controls.width).toBeLessThanOrEqual(canvas.w);
      expect(controls.top + controls.height).toBeLessThanOrEqual(canvas.h);
      expect(controls.width).toBeGreaterThan(0);
      expect(controls.height).toBeGreaterThan(0);
      expect(frame).toEqual(original);
    }
  });
});

describe('corner resizing', () => {
  it.each(['tl', 'tr', 'bl', 'br'] as ArtworkCorner[])('keeps opposite corner fixed for %s, locked/unlocked and at limits', corner => {
    const original = { x: 40, y: -20, scaleX: 1.5, scaleY: 1.5 };
    const base = { w: 400, h: 200 };
    const sx = corner.endsWith('r') ? 1 : -1;
    const sy = corner.startsWith('b') ? 1 : -1;
    for (const locked of [true, false]) for (const delta of [40, -40, 10000, -10000]) {
      const next = resizeArtworkFromCorner(original, base, corner, sx * delta, sy * delta, locked);
      expect(next.x - sx * base.w * next.scaleX / 2).toBeCloseTo(original.x - sx * base.w * original.scaleX / 2);
      expect(next.y - sy * base.h * next.scaleY / 2).toBeCloseTo(original.y - sy * base.h * original.scaleY / 2);
      expect(next.scaleX).toBeGreaterThanOrEqual(0.2);
      expect(next.scaleX).toBeLessThanOrEqual(5);
      expect(next.scaleY).toBeGreaterThanOrEqual(0.2);
      expect(next.scaleY).toBeLessThanOrEqual(5);
      if (locked) expect(next.scaleX).toBeCloseTo(next.scaleY);
    }
  });

  it('does not jump when grabbing a proxy corner', () => {
    const original = { x: -800, y: 400, scaleX: 4, scaleY: 4 };
    expect(resizeArtworkFromCorner(original, { w: 400, h: 200 }, 'br', 0, 0, true)).toEqual(original);
  });
});
