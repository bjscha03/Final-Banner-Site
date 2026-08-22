import { describe, expect, it } from 'vitest';
import {
  captureNormalizedArtworkGeometry,
  restoreArtworkTransformFromGeometry,
} from './artworkTransformGeometry';

describe('artwork transform geometry', () => {
  it('preserves the complete transform when the banner keeps its aspect ratio', () => {
    const geometry = captureNormalizedArtworkGeometry(
      { x: 40, y: -20, scaleX: 1.25, scaleY: 1.25 },
      { w: 400, h: 200 },
      { w: 1600, h: 800 },
    );

    expect(restoreArtworkTransformFromGeometry(
      geometry,
      { w: 600, h: 300 },
      { w: 1600, h: 800 },
      true,
    )).toEqual({ x: 60, y: -30, scaleX: 1.25, scaleY: 1.25 });
  });

  it('preserves artwork width and proportions when the banner aspect ratio changes', () => {
    const geometry = captureNormalizedArtworkGeometry(
      { x: 40, y: -20, scaleX: 1.25, scaleY: 1.25 },
      { w: 400, h: 200 },
      { w: 1600, h: 800 },
    );
    const restored = restoreArtworkTransformFromGeometry(
      geometry,
      { w: 600, h: 200 },
      { w: 1600, h: 800 },
      true,
    );

    expect(restored).toEqual({ x: 60, y: -20, scaleX: 1.875, scaleY: 1.875 });
    expect((400 * restored.scaleX) / 600).toBeCloseTo(geometry.widthPct);
  });

  it('preserves independent width and height in free-resize mode', () => {
    const geometry = captureNormalizedArtworkGeometry(
      { x: 20, y: 10, scaleX: 1.2, scaleY: 0.8 },
      { w: 400, h: 200 },
      { w: 1600, h: 800 },
    );
    const restored = restoreArtworkTransformFromGeometry(
      geometry,
      { w: 600, h: 200 },
      { w: 1600, h: 800 },
      false,
    );

    expect(restored).toEqual({ x: 30, y: 10, scaleX: 1.8, scaleY: 0.8 });
  });
});
