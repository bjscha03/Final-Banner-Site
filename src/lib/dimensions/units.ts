/**
 * Unit conversion utilities for the design custom-size inputs.
 *
 * The pricing, cart, checkout, upload, admin, and print pipelines all
 * operate in INCHES. These helpers exist purely so the UI can offer a
 * Feet / Inches toggle on the custom-size inputs while continuing to
 * normalize values to inches before they reach any of those pipelines.
 *
 * IMPORTANT: Do not change the units used by callers downstream — these
 * helpers are intended to be used only at the UI input boundary.
 */

export type DimensionUnit = 'in' | 'ft';

export const INCHES_PER_FOOT = 12;

/** Convert a value in inches to feet. */
export function inchesToFeet(inches: number): number {
  if (!Number.isFinite(inches)) return 0;
  return inches / INCHES_PER_FOOT;
}

/** Convert a value in feet to inches. */
export function feetToInches(feet: number): number {
  if (!Number.isFinite(feet)) return 0;
  return feet * INCHES_PER_FOOT;
}

/**
 * Normalize a width/height pair entered in either unit to inches.
 *
 * Returns the canonical inches representation that downstream pricing,
 * cart, and print code expects.
 *
 * @param width  user-entered width
 * @param height user-entered height
 * @param unit   unit the values were entered in
 */
export function normalizeDimensions(
  width: number,
  height: number,
  unit: DimensionUnit
): { widthIn: number; heightIn: number } {
  const w = Number.isFinite(width) ? width : 0;
  const h = Number.isFinite(height) ? height : 0;

  if (unit === 'ft') {
    return { widthIn: feetToInches(w), heightIn: feetToInches(h) };
  }
  return { widthIn: w, heightIn: h };
}

/**
 * Format an inch value for display in a given unit. Used by the
 * "Equivalent" line shown beneath the size inputs.
 *
 * Examples:
 *   formatDimensionInUnit(48, 'in') -> "48 in"
 *   formatDimensionInUnit(48, 'ft') -> "4 ft"
 *   formatDimensionInUnit(30, 'ft') -> "2.5 ft"
 */
export function formatDimensionInUnit(inches: number, unit: DimensionUnit): string {
  if (!Number.isFinite(inches) || inches <= 0) return unit === 'ft' ? '0 ft' : '0 in';
  if (unit === 'ft') {
    const ft = inchesToFeet(inches);
    // Two decimals max, trim trailing zeros.
    const s = Number(ft.toFixed(2)).toString();
    return `${s} ft`;
  }
  const s = Number(inches.toFixed(2)).toString();
  return `${s} in`;
}
