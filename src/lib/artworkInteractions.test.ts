import { describe, expect, it } from 'vitest';
import { artworkImageBox, artworkCropBox, resizeArtwork, resizeCroppedImage, repositionArtworkCrop, snapArtworkPosition, artworkCenterGuides, type ArtworkHandle } from './artworkInteractions';
import { captureNormalizedArtworkGeometry, restoreArtworkTransformFromGeometry } from './artworkTransformGeometry';
import { buildCompositionSignature, normalizedTransformFromPixels, validateCompositionSpec, PREVIEW_ARTIFACT_VERSION } from './previewLifecycle';

const canvas = { w: 600, h: 300 };
const natural = { w: 1200, h: 600 };
const value = { x: 10, y: -10, scaleX: 0.8, scaleY: 0.8 };
const frame = (v = value) => artworkCropBox(artworkImageBox(v, canvas, natural), v['crop']);
describe('artwork interactions', () => {
  it('keeps small landscape crop movements precise instead of jumping to center', () => {
    const smallCanvas = { w: 120, h: 60 };
    const placed = { x: -15, y: -7.5, scaleX: 0.75, scaleY: 0.75 };
    const before = artworkImageBox(placed, smallCanvas, natural);
    const next = resizeArtwork(placed, smallCanvas, natural, 't', 0, 3, 6);
    expect(artworkImageBox(next, smallCanvas, natural)).toEqual(before);
    const cropped = artworkCropBox(before, next.crop);
    expect(cropped.top).toBeCloseTo(3);
    expect(cropped.height).toBeCloseTo(42);
    expect(cropped.width).toBeCloseTo(90);
  });
  it('lets an already centered image resize immediately instead of snapping back to its starting size', () => {
    const centered = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const smaller = resizeArtwork(centered, canvas, natural, 'br', -10, -5, 6);
    expect(smaller.scaleX).toBeLessThan(1);
    const cropped = resizeArtwork(centered, canvas, natural, 'r', -8, 0, 6);
    expect(cropped.crop?.width).toBeLessThan(1);
  });
  it.each(['tl', 'tr', 'bl', 'br'] as ArtworkHandle[])('%s scales proportionally from the opposite corner', handle => {
    const before = frame();
    const next = resizeArtwork(value, canvas, natural, handle, handle.includes('r') ? 40 : -40, handle.includes('b') ? 20 : -20);
    const after = frame(next);
    expect(after.width / after.height).toBeCloseTo(2);
    expect(after.width).toBeCloseTo(before.width + 40);
    expect(after.left + (handle.includes('l') ? after.width : 0)).toBeCloseTo(before.left + (handle.includes('l') ? before.width : 0));
    expect(after.top + (handle.includes('t') ? after.height : 0)).toBeCloseTo(before.top + (handle.includes('t') ? before.height : 0));
  });
  it.each(['l', 'r', 't', 'b'] as ArtworkHandle[])('%s crops one axis without moving or distorting source pixels', handle => {
    const next = resizeArtwork(value, canvas, natural, handle, handle === 'l' ? 30 : -30, handle === 't' ? 30 : -30);
    expect(artworkImageBox(next, canvas, natural)).toEqual(artworkImageBox(value, canvas, natural));
    const result = frame(next);
    expect(result.width).toBeCloseTo(frame().width - (['l', 'r'].includes(handle) ? 30 : 0));
    expect(result.height).toBeCloseTo(frame().height - (['t', 'b'].includes(handle) ? 30 : 0));
  });
  it('reveals a crop and covers outward expansion without distortion', () => {
    const cropped = resizeArtwork(value, canvas, natural, 'r', -90, 0);
    const restored = resizeArtwork(cropped, canvas, natural, 'r', 90, 0);
    expect(frame(restored)).toEqual(frame(value));
    const expanded = resizeArtwork(value, canvas, natural, 'r', 150, 0);
    expect(expanded.scaleX).toBe(expanded.scaleY);
    expect(frame(expanded).width).toBeCloseTo(frame(value).width + 150);
  });
  it('moves hidden artwork inside a fixed crop, then scales it while keeping the crop fixed', () => {
    const cropped = resizeArtwork(value, canvas, natural, 'l', 100, 0);
    const moved = repositionArtworkCrop(cropped, canvas, natural, 30, 0);
    expect(frame(moved)).toEqual(frame(cropped));
    expect(moved.crop.x).toBeLessThan(cropped.crop.x);
    const resized = resizeCroppedImage(moved, canvas, natural, 'br', 100, 50);
    const a = frame(resized), b = frame(moved);
    for (const key of ['left', 'top', 'width', 'height']) expect(a[key]).toBeCloseTo(b[key]);
    expect(resized.scaleX / resized.scaleY).toBeCloseTo(1);
  });
  it('snaps the visible crop center, not the hidden original or the surrounding interface', () => {
    const v = { ...value, x: -57, y: 3, crop: { x: 0.25, y: 0, width: 0.75, height: 1 } };
    const snapped = snapArtworkPosition(v, canvas, natural, 6);
    expect(artworkCenterGuides(snapped, canvas, natural)).toEqual({ x: true, y: true });
    expect(snapArtworkPosition({ ...value, x: 20, y: 20 }, canvas, natural, 6)).toEqual({ ...value, x: 20, y: 20 });
  });
  it('preserves the crop and displayed width through a dimension or viewport change', () => {
    const cropped = resizeArtwork(value, canvas, natural, 'l', 80, 0);
    const saved = captureNormalizedArtworkGeometry(cropped, canvas, natural);
    const restored = restoreArtworkTransformFromGeometry(saved, { w: 300, h: 300 }, natural, true);
    expect(restored.crop).toEqual(cropped.crop);
    expect(artworkImageBox(restored, { w: 300, h: 300 }, natural).width).toBeCloseTo(240);
  });
  it('includes crop in composition identity and rejects out-of-source crops', () => {
    const base = { version: PREVIEW_ARTIFACT_VERSION, sourceIdentity: 'original', sourceUrl: 'https://example.com/art.png', productType: 'banner', widthIn: 48, heightIn: 24, fitMode: 'fit' as const, revision: 1, transform: normalizedTransformFromPixels(value, { width: 600, height: 300 }) };
    const crop = { x: 0.2, y: 0, width: 0.8, height: 1 };
    expect(buildCompositionSignature({ ...base, transform: { ...base.transform, crop } })).not.toBe(buildCompositionSignature(base));
    expect(() => validateCompositionSpec({ ...base, transform: { ...base.transform, crop: { ...crop, width: 0.9 } } })).toThrow('crop');
  });
});
