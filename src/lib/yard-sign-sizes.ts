import catalog from '../../shared/yard-sign-sizes.json' with { type: 'json' };

/** Supplier size labels are independent of artwork orientation. Do not sort
 * dimensions: the legacy landscape 24x18 and new portrait 18x24 are different SKUs. */
export type YardSignSizeId = '24x18' | '12x18' | '18x24' | '24x24' | '24x36';
export interface YardSignSize {
  id: YardSignSizeId;
  label: string;
  widthIn: number;
  heightIn: number;
  orientation: 'landscape' | 'portrait' | 'square';
  perSheet: number;
  minQuantity: number;
  increment: number;
  maxQuantity: number;
  singleCents: number;
  doubleCents: number;
}
export const YARD_SIGN_SIZES = catalog.sizes as YardSignSize[];
export const DEFAULT_YARD_SIGN_SIZE = YARD_SIGN_SIZES[0];
export const YARD_SIGN_SHEET_SINGLE_CENTS = catalog.sheetSingleCents;
export const YARD_SIGN_SHEET_DOUBLE_CENTS = catalog.sheetDoubleCents;
export function getYardSignSize(id: string = DEFAULT_YARD_SIGN_SIZE.id): YardSignSize {
  const size = YARD_SIGN_SIZES.find(size => size.id === id);
  if (!size) throw new Error('Choose a supported yard sign size.');
  return size;
}
export function findYardSignSize(width: number | null | undefined, height: number | null | undefined): YardSignSize | undefined {
  return YARD_SIGN_SIZES.find(size => size.widthIn === Number(width) && size.heightIn === Number(height));
}
export function yardSignSizeLabel(item: { width_in?: number; height_in?: number }): string {
  // Old records without dimensions belonged to the sole legacy SKU.
  if (item.width_in == null && item.height_in == null) return DEFAULT_YARD_SIGN_SIZE.label;
  return findYardSignSize(item.width_in, item.height_in)?.label || `${item.width_in}" × ${item.height_in}"`;
}
export function yardSignQuantityRule(size: YardSignSize): string {
  return `Yard signs must be ordered in increments of ${size.increment} (${size.increment}, ${size.increment * 2}, ${size.increment * 3}, etc.).`;
}
export function normalizeYardSignQuantity(quantity: number, size: YardSignSize, designCount = 0): number {
  const requested = Number.isFinite(quantity) ? quantity : size.minQuantity;
  return Math.min(size.maxQuantity, Math.max(size.minQuantity, Math.ceil(Math.max(requested, designCount) / size.increment) * size.increment));
}
