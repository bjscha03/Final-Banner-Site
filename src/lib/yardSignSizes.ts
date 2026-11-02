import sizes from '../../shared/yard-sign-sizes.json' with { type: 'json' };

export const YARD_SIGN_SIZES = sizes;
export type YardSignSize = (typeof sizes)[number];
export const DEFAULT_YARD_SIGN_SIZE = sizes[0];

// Stored dimensions are the printable canvas. The label is the supplier's size name.
export function findYardSignSize(item: { width_in?: number; height_in?: number }) {
  if (item.width_in == null && item.height_in == null) return DEFAULT_YARD_SIGN_SIZE;
  return sizes.find(size => size.widthIn === Number(item.width_in) && size.heightIn === Number(item.height_in));
}

export function yardSignSizeLabel(item: { width_in?: number; height_in?: number }) {
  return findYardSignSize(item)?.label || `${item.width_in}" × ${item.height_in}"`;
}

export function yardSignOrientation(size: YardSignSize) {
  if (size.widthIn === size.heightIn) return 'square';
  return size.widthIn > size.heightIn ? 'landscape' : 'portrait';
}

// The original size allows mixed copies on a sheet. New sizes are ordered by artwork.
export function yardSignArtworkStep(size: YardSignSize) {
  return size.id === DEFAULT_YARD_SIGN_SIZE.id ? 1 : size.perSheet;
}
