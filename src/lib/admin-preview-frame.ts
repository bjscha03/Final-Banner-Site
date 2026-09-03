import type { CSSProperties } from 'react';

export const ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH = 66;

function safeDimension(value: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function formatDvh(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}dvh`;
}

/**
 * Keeps the admin preview frame at the exact finished-product aspect ratio.
 *
 * The former large-preview frame was always full width and only capped by
 * height. Portrait artwork and its SVG overlay were then letterboxed inside a
 * wide rectangle, so correct four-corner coordinates appeared near the middle
 * of the visible frame. Deriving the width cap from the same viewport-height
 * cap keeps the frame, artwork, and inch-based grommet coordinate system
 * identical for portrait, landscape, and square products.
 */
export function getAdminPreviewFrameStyle(
  widthIn: number,
  heightIn: number,
  large: boolean,
): CSSProperties {
  const width = safeDimension(widthIn);
  const height = safeDimension(heightIn);
  const ratio = width / height;
  const aspectRatio = `${width} / ${height}`;

  if (large) {
    return {
      aspectRatio,
      width: '100%',
      height: 'auto',
      maxWidth: formatDvh(ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH * ratio),
      maxHeight: `${ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH}dvh`,
    };
  }

  return ratio >= 1
    ? {
        aspectRatio,
        width: '100%',
        height: 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
      }
    : {
        aspectRatio,
        width: 'auto',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
      };
}
