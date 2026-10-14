import type { ArtworkCrop } from '@/types/artwork';
import { getContainedArtworkRect, type ArtworkCanvasSize, type PixelArtworkTransform } from './artworkTransformGeometry';

export type ArtworkHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';
export type ArtworkBox = { left: number; top: number; width: number; height: number };
export const FULL_ARTWORK_CROP: ArtworkCrop = { x: 0, y: 0, width: 1, height: 1 };
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function artworkImageBox(value: PixelArtworkTransform, canvas: ArtworkCanvasSize, natural: ArtworkCanvasSize): ArtworkBox {
  const base = getContainedArtworkRect(canvas, natural);
  const width = base.w * value.scaleX;
  const height = base.h * value.scaleY;
  return { left: (canvas.w - width) / 2 + value.x, top: (canvas.h - height) / 2 + value.y, width, height };
}

export function artworkCropBox(image: ArtworkBox, crop: ArtworkCrop = FULL_ARTWORK_CROP): ArtworkBox {
  return { left: image.left + crop.x * image.width, top: image.top + crop.y * image.height, width: image.width * crop.width, height: image.height * crop.height };
}

function transformForBox(image: ArtworkBox, canvas: ArtworkCanvasSize, natural: ArtworkCanvasSize, crop?: ArtworkCrop): PixelArtworkTransform {
  const base = getContainedArtworkRect(canvas, natural);
  return { x: image.left + image.width / 2 - canvas.w / 2, y: image.top + image.height / 2 - canvas.h / 2, scaleX: image.width / base.w, scaleY: image.height / base.h, ...(crop ? { crop } : {}) };
}

function cropForBox(image: ArtworkBox, frame: ArtworkBox): ArtworkCrop {
  return { x: clamp((frame.left - image.left) / image.width, 0, 1), y: clamp((frame.top - image.top) / image.height, 0, 1), width: Math.min(1, frame.width / image.width), height: Math.min(1, frame.height / image.height) };
}

/** Crop is a non-destructive window in original-image coordinates, never a raster rewrite. */
export function repositionArtworkCrop(value: PixelArtworkTransform, canvas: ArtworkCanvasSize, natural: ArtworkCanvasSize, dx: number, dy: number): PixelArtworkTransform {
  const image = artworkImageBox(value, canvas, natural);
  const frame = artworkCropBox(image, value.crop);
  const moved = { ...image, left: clamp(image.left + dx, frame.left + frame.width - image.width, frame.left), top: clamp(image.top + dy, frame.top + frame.height - image.height, frame.top) };
  return transformForBox(moved, canvas, natural, cropForBox(moved, frame));
}

export function resizeCroppedImage(value: PixelArtworkTransform, canvas: ArtworkCanvasSize, natural: ArtworkCanvasSize, handle: ArtworkHandle, dx: number, dy: number): PixelArtworkTransform {
  const image = artworkImageBox(value, canvas, natural);
  const frame = artworkCropBox(image, value.crop);
  const scaled = artworkImageBox(resizeArtwork({ ...value, crop: undefined }, canvas, natural, handle, dx, dy), canvas, natural);
  const factor = Math.max(scaled.width / image.width, frame.width / image.width, frame.height / image.height);
  const width = image.width * factor;
  const height = image.height * factor;
  const grown = { width, height, left: clamp(scaled.left, frame.left + frame.width - width, frame.left), top: clamp(scaled.top, frame.top + frame.height - height, frame.top) };
  return transformForBox(grown, canvas, natural, cropForBox(grown, frame));
}

export function artworkCenterGuides(value: PixelArtworkTransform, canvas: ArtworkCanvasSize, natural: ArtworkCanvasSize) {
  const frame = artworkCropBox(artworkImageBox(value, canvas, natural), value.crop);
  return { x: Math.abs(frame.left + frame.width / 2 - canvas.w / 2) < 0.1, y: Math.abs(frame.top + frame.height / 2 - canvas.h / 2) < 0.1 };
}

export function snapArtworkPosition(value: PixelArtworkTransform, canvas: ArtworkCanvasSize, natural: ArtworkCanvasSize, threshold: number): PixelArtworkTransform {
  const frame = artworkCropBox(artworkImageBox(value, canvas, natural), value.crop);
  const dx = canvas.w / 2 - frame.left - frame.width / 2;
  const dy = canvas.h / 2 - frame.top - frame.height / 2;
  return { ...value, x: value.x + (Math.abs(dx) <= threshold ? dx : 0), y: value.y + (Math.abs(dy) <= threshold ? dy : 0) };
}

/** Corners scale around the opposite corner; side pills change only the crop window. */
export function resizeArtwork(value: PixelArtworkTransform, canvas: ArtworkCanvasSize, natural: ArtworkCanvasSize, handle: ArtworkHandle, dx: number, dy: number, threshold = 0): PixelArtworkTransform {
  const image = artworkImageBox(value, canvas, natural);
  const frame = artworkCropBox(image, value.crop);
  // On a short phone canvas, a fixed pixel snap zone can consume a large
  // fraction of the artwork and turn a small crop into an unexpected jump.
  threshold = Math.min(threshold, Math.min(frame.width, frame.height) * 0.05);
  if (handle.length === 2) {
    const sx = handle.includes('r') ? 1 : -1;
    const sy = handle.includes('b') ? 1 : -1;
    const ax = frame.left + (sx < 0 ? frame.width : 0);
    const ay = frame.top + (sy < 0 ? frame.height : 0);
    let factor = 1 + (sx * dx * frame.width + sy * dy * frame.height) / (frame.width ** 2 + frame.height ** 2);
    const min = Math.max(12 / frame.width, 12 / frame.height, 0.02 / value.scaleX, 0.02 / value.scaleY);
    const max = Math.min(20 / value.scaleX, 20 / value.scaleY);
    factor = clamp(factor, min, max);
    // Solve the single proportional scale for the nearest page-center guide.
    const candidates = [
      { distance: Math.abs(ax + sx * frame.width * factor / 2 - canvas.w / 2), factor: (canvas.w / 2 - ax) * 2 / (sx * frame.width) },
      { distance: Math.abs(ay + sy * frame.height * factor / 2 - canvas.h / 2), factor: (canvas.h / 2 - ay) * 2 / (sy * frame.height) },
    ].filter(c => c.distance <= threshold && Math.abs(c.factor - 1) > 0.0001 && c.factor >= min && c.factor <= max).sort((a, b) => a.distance - b.distance);
    if (candidates.length) factor = candidates[0].factor;
    return transformForBox({ left: ax + (image.left - ax) * factor, top: ay + (image.top - ay) * factor, width: image.width * factor, height: image.height * factor }, canvas, natural, value.crop);
  }
  const next = { ...frame };
  if (handle === 'l' || handle === 'r') {
    const opposite = handle === 'l' ? frame.left + frame.width : frame.left;
    let edge = (handle === 'l' ? frame.left : frame.left + frame.width) + dx;
    if (Math.abs(frame.left + frame.width / 2 - canvas.w / 2) > 0.1 && Math.abs((edge + opposite) / 2 - canvas.w / 2) <= threshold) edge = canvas.w - opposite;
    edge = handle === 'l' ? Math.min(edge, opposite - 12) : Math.max(edge, opposite + 12);
    next.left = Math.min(edge, opposite);
    next.width = Math.abs(edge - opposite);
  } else {
    const opposite = handle === 't' ? frame.top + frame.height : frame.top;
    let edge = (handle === 't' ? frame.top : frame.top + frame.height) + dy;
    if (Math.abs(frame.top + frame.height / 2 - canvas.h / 2) > 0.1 && Math.abs((edge + opposite) / 2 - canvas.h / 2) <= threshold) edge = canvas.h - opposite;
    edge = handle === 't' ? Math.min(edge, opposite - 12) : Math.max(edge, opposite + 12);
    next.top = Math.min(edge, opposite);
    next.height = Math.abs(edge - opposite);
  }
  // Reveal hidden pixels first. Beyond the source bounds, grow proportionally
  // to cover the requested window instead of introducing distortion or gaps.
  const cover = Math.max(1, next.width / image.width, next.height / image.height);
  const covered = { ...image, width: image.width * cover, height: image.height * cover };
  covered.left = clamp(image.left - (covered.width - image.width) / 2, next.left + next.width - covered.width, next.left);
  covered.top = clamp(image.top - (covered.height - image.height) / 2, next.top + next.height - covered.height, next.top);
  return transformForBox(covered, canvas, natural, cropForBox(covered, next));
}
