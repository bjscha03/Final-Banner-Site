/**
 * Grommet position computation for the preview overlay.
 *
 * This is the canonical helper for placing grommets on the design
 * preview canvas. It returns positions in INCHES along the banner axis
 * so callers (e.g. <GrommetOverlay/>) can render them directly into the
 * existing inch-based SVG coordinate space used by <PreviewCanvas/>.
 *
 * IMPORTANT: Grommets rendered via this helper are PREVIEW-ONLY. They
 * must never be included in:
 *   - print-ready PDF exports (server reads canvas_state_json, which
 *     does not contain grommet positions)
 *   - thumbnails
 *   - admin file downloads
 *
 * Supported overlay options:
 *   - 'none'             no grommets
 *   - '4-corners'        one grommet inset slightly at each corner
 *   - 'top-corners'      top-left and top-right only
 *   - 'bottom-corners'   bottom-left and bottom-right only
 *   - 'left-corners'     left edge only (top-left + bottom-left)
 *   - 'right-corners'    right edge only (top-right + bottom-right)
 *   - 'every-2-feet'     corners + midpoints along all edges (~24" spacing)
 *   - 'every-1-foot'     corners + midpoints along all edges (~18" spacing)
 *
 * The store's `Grommets` type uses slightly different string values
 * (e.g. 'every-1-2ft', 'every-2-3ft'); a small mapper is exported below
 * so existing callers keep working without changes to the cart or
 * pricing layers.
 */

export type GrommetOverlayOption =
  | 'none'
  | '4-corners'
  | 'top-corners'
  | 'bottom-corners'
  | 'left-corners'
  | 'right-corners'
  | 'every-2-feet'
  | 'every-1-foot';

export interface GrommetPosition {
  /** Horizontal position in INCHES from the banner's left edge. */
  x: number;
  /** Vertical position in INCHES from the banner's top edge. */
  y: number;
}

/** Inset (inches) from each banner edge — keeps grommets off the very edge. */
export const GROMMET_EDGE_INSET_IN = 1;

/** Default mid-edge spacing in inches for the 'every-2-feet' option. */
export const GROMMET_EVERY_TWO_FEET_SPACING_IN = 24;

/** Default mid-edge spacing in inches for the 'every-1-foot' option (tighter spacing). */
export const GROMMET_EVERY_ONE_FOOT_SPACING_IN = 18;

/**
 * Compute grommet positions in inches.
 *
 * @param widthIn   banner width in inches
 * @param heightIn  banner height in inches
 * @param option    overlay option
 * @param spacingIn (optional) spacing between mid-edge grommets in inches.
 *                  When omitted, defaults are derived from the option:
 *                  'every-2-feet' → {@link GROMMET_EVERY_TWO_FEET_SPACING_IN},
 *                  'every-1-foot' → {@link GROMMET_EVERY_ONE_FOOT_SPACING_IN}.
 */
export function getGrommetPositions(
  widthIn: number,
  heightIn: number,
  option: GrommetOverlayOption,
  spacingIn?: number
): GrommetPosition[] {
  if (option === 'none') return [];
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn)) return [];
  if (widthIn <= 0 || heightIn <= 0) return [];

  const m = GROMMET_EDGE_INSET_IN;
  // Guard for very small banners where the inset would invert.
  const safeM = Math.min(m, widthIn / 2, heightIn / 2);

  const topLeft: GrommetPosition = { x: safeM, y: safeM };
  const topRight: GrommetPosition = { x: widthIn - safeM, y: safeM };
  const bottomLeft: GrommetPosition = { x: safeM, y: heightIn - safeM };
  const bottomRight: GrommetPosition = { x: widthIn - safeM, y: heightIn - safeM };
  const corners: GrommetPosition[] = [topLeft, topRight, bottomLeft, bottomRight];

  if (option === '4-corners') return dedupe(corners);
  if (option === 'top-corners') return dedupe([topLeft, topRight]);
  if (option === 'bottom-corners') return dedupe([bottomLeft, bottomRight]);
  if (option === 'left-corners') return dedupe([topLeft, bottomLeft]);
  if (option === 'right-corners') return dedupe([topRight, bottomRight]);

  // 'every-2-feet' / 'every-1-foot': corners + evenly spaced midpoints
  // along all 4 edges. Default spacing is option-driven but can be
  // overridden by the optional argument.
  const defaultSpacing =
    option === 'every-1-foot'
      ? GROMMET_EVERY_ONE_FOOT_SPACING_IN
      : GROMMET_EVERY_TWO_FEET_SPACING_IN;
  const spacing = spacingIn ?? defaultSpacing;

  const points: GrommetPosition[] = [...corners];
  for (const x of midpoints(widthIn, safeM, spacing)) {
    points.push({ x, y: safeM });
    points.push({ x, y: heightIn - safeM });
  }
  for (const y of midpoints(heightIn, safeM, spacing)) {
    points.push({ x: safeM, y });
    points.push({ x: widthIn - safeM, y });
  }
  return dedupe(points);
}

function midpoints(length: number, inset: number, spacing: number): number[] {
  const usable = Math.max(0, length - 2 * inset);
  if (spacing <= 0) return [];
  const n = Math.floor(usable / spacing);
  if (n <= 0) return [];
  const step = usable / (n + 1);
  return Array.from({ length: n }, (_, k) => inset + (k + 1) * step);
}

function dedupe(points: GrommetPosition[]): GrommetPosition[] {
  const seen = new Set<string>();
  const out: GrommetPosition[] = [];
  for (const p of points) {
    const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Map any legacy `Grommets` store value to the overlay options.
 * Lets existing callers (BannerEditor, GrommetsCard, etc.) continue to
 * use their richer option set without forcing a data-model change.
 *
 * - 'none'                                        -> 'none'
 * - '4-corners'                                   -> '4-corners'
 * - 'top-corners'                                 -> 'top-corners'
 * - 'bottom-corners'                              -> 'bottom-corners'
 * - 'left-corners'                                -> 'left-corners'   (Left Side Only)
 * - 'right-corners'                               -> 'right-corners'  (Right Side Only)
 * - 'every-1-2ft'                                 -> 'every-1-foot'   (tighter spacing)
 * - 'every-2-3ft' (or any other value)            -> 'every-2-feet'   (default spacing)
 */
export function toGrommetOverlayOption(value: string | null | undefined): GrommetOverlayOption {
  if (!value || value === 'none') return 'none';
  if (value === '4-corners') return '4-corners';
  if (value === 'top-corners') return 'top-corners';
  if (value === 'bottom-corners') return 'bottom-corners';
  if (value === 'left-corners') return 'left-corners';
  if (value === 'right-corners') return 'right-corners';
  if (value === 'every-1-2ft') return 'every-1-foot';
  return 'every-2-feet';
}

/**
 * Recommended grommet ring radius (in INCHES) for a given banner size.
 * Scales gently so grommets remain visible without dominating the
 * preview at very large or very small sizes.
 */
export function getGrommetRadius(widthIn: number, heightIn: number): number {
  const minDim = Math.max(1, Math.min(widthIn, heightIn));
  return Math.max(0.25, Math.min(minDim * 0.015, 0.6));
}
