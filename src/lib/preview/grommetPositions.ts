/**
 * Grommet position computation for the preview overlay.
 *
 * This is the canonical PR-2 helper for placing grommets on the design
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
 * Supported overlay options (per PR-2 spec):
 *   - 'none'         no grommets
 *   - '4-corners'    one grommet inset slightly at each corner
 *   - 'every-2-feet' corners + evenly spaced midpoints along all edges
 *
 * The store's `Grommets` type still includes other legacy values (e.g.
 * 'every-1-2ft', 'top-corners'); a small mapper is exported below so the
 * existing options keep rendering correctly without changes to the cart
 * or pricing layers.
 */

export type GrommetOverlayOption = 'none' | '4-corners' | 'every-2-feet';

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

/**
 * Compute grommet positions in inches.
 *
 * @param widthIn   banner width in inches
 * @param heightIn  banner height in inches
 * @param option    overlay option
 * @param spacingIn (optional) spacing between mid-edge grommets in inches.
 *                  Defaults to {@link GROMMET_EVERY_TWO_FEET_SPACING_IN}.
 */
export function getGrommetPositions(
  widthIn: number,
  heightIn: number,
  option: GrommetOverlayOption,
  spacingIn: number = GROMMET_EVERY_TWO_FEET_SPACING_IN
): GrommetPosition[] {
  if (option === 'none') return [];
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn)) return [];
  if (widthIn <= 0 || heightIn <= 0) return [];

  const m = GROMMET_EDGE_INSET_IN;
  // Guard for very small banners where the inset would invert.
  const safeM = Math.min(m, widthIn / 2, heightIn / 2);

  const corners: GrommetPosition[] = [
    { x: safeM, y: safeM },
    { x: widthIn - safeM, y: safeM },
    { x: safeM, y: heightIn - safeM },
    { x: widthIn - safeM, y: heightIn - safeM },
  ];

  if (option === '4-corners') return dedupe(corners);

  // 'every-2-feet': corners + evenly spaced midpoints along all 4 edges.
  const points: GrommetPosition[] = [...corners];
  for (const x of midpoints(widthIn, safeM, spacingIn)) {
    points.push({ x, y: safeM });
    points.push({ x, y: heightIn - safeM });
  }
  for (const y of midpoints(heightIn, safeM, spacingIn)) {
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
 * Map any legacy `Grommets` store value to the PR-2 overlay options.
 * Lets existing callers (BannerEditor, GrommetsCard, etc.) continue to
 * use their richer option set without forcing a data-model change.
 *
 * - 'none'          -> 'none'
 * - '4-corners'     -> '4-corners'
 * - 'top-corners' / 'left-corners' / 'right-corners' -> '4-corners'
 *   (preview-only approximation; the actual grommet count for the order
 *   is still driven by the stored value, not this overlay).
 * - anything else (e.g. 'every-2-3ft', 'every-1-2ft') -> 'every-2-feet'
 */
export function toGrommetOverlayOption(value: string | null | undefined): GrommetOverlayOption {
  if (!value || value === 'none') return 'none';
  if (value === '4-corners' || value === 'top-corners' || value === 'left-corners' || value === 'right-corners') {
    return '4-corners';
  }
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
