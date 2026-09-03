from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text()
    if new in text and old not in text:
        print(f"{label}: already applied")
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1))
    print(f"{label}: applied")


orders = "src/pages/admin/Orders.tsx"

replace_once(
    orders,
    "import { getGrommetLabel } from '@/lib/grommets';\n",
    "import { getGrommetLabel } from '@/lib/grommets';\nimport { getAdminPreviewFrameStyle } from '@/lib/admin-preview-frame';\n",
    "admin preview geometry import",
)

replace_once(
    orders,
    "  const loading = candidates.length > 0 && !ready && !failed;\n\n  return (\n",
    "  const loading = candidates.length > 0 && !ready && !failed;\n  const frameStyle = useMemo(\n    () => getAdminPreviewFrameStyle(width, height, large),\n    [width, height, large],\n  );\n\n  return (\n",
    "admin preview frame style memo",
)

replace_once(
    orders,
    "      className={`relative w-full overflow-hidden rounded-lg border border-gray-200 bg-white ${large ? 'max-h-[66vh]' : 'h-full'}`}\n      style={{ aspectRatio: `${width} / ${height}` }}\n",
    "      className=\"relative mx-auto overflow-hidden rounded-lg border border-gray-200 bg-white\"\n      style={frameStyle}\n",
    "ratio-preserving admin preview frame",
)

replace_once(
    orders,
    "      <svg\n        viewBox={`0 0 ${width} ${height}`}\n        className=\"pointer-events-none absolute inset-0 z-[3] h-full w-full\"\n        aria-hidden=\"true\"\n      >\n        <GrommetOverlay",
    "      <svg\n        viewBox={`0 0 ${width} ${height}`}\n        className=\"pointer-events-none absolute inset-0 z-[3] h-full w-full\"\n        preserveAspectRatio=\"none\"\n        aria-hidden=\"true\"\n      >\n        <GrommetOverlay",
    "exact grommet SVG mapping",
)

Path("src/lib/admin-preview-frame.ts").write_text(
    """import type { CSSProperties } from 'react';

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
"""
)

Path("src/lib/admin-preview-frame.test.ts").write_text(
    """import { describe, expect, it } from 'vitest';
import {
  ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH,
  getAdminPreviewFrameStyle,
} from './admin-preview-frame';

describe('getAdminPreviewFrameStyle', () => {
  it('keeps the latest 36 × 60 portrait order at its exact ratio in the large admin modal', () => {
    expect(getAdminPreviewFrameStyle(36, 60, true)).toEqual({
      aspectRatio: '36 / 60',
      width: '100%',
      height: 'auto',
      maxWidth: '39.6dvh',
      maxHeight: '66dvh',
    });
  });

  it('caps a landscape preview by the same viewport-height-derived ratio', () => {
    expect(getAdminPreviewFrameStyle(60, 36, true)).toEqual({
      aspectRatio: '60 / 36',
      width: '100%',
      height: 'auto',
      maxWidth: '110dvh',
      maxHeight: `${ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH}dvh`,
    });
  });

  it('fits compact portrait and landscape previews inside the square admin thumbnail', () => {
    expect(getAdminPreviewFrameStyle(36, 60, false)).toMatchObject({
      width: 'auto',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
    });
    expect(getAdminPreviewFrameStyle(60, 36, false)).toMatchObject({
      width: '100%',
      height: 'auto',
      maxWidth: '100%',
      maxHeight: '100%',
    });
  });

  it('fails safely for invalid dimensions without emitting an invalid CSS ratio', () => {
    expect(getAdminPreviewFrameStyle(0, Number.NaN, true)).toMatchObject({
      aspectRatio: '1 / 1',
      maxWidth: '66dvh',
      maxHeight: '66dvh',
    });
  });
});
"""
)

grommet_test = Path("src/lib/preview/__tests__/grommetPositions.test.ts")
grommet_text = grommet_test.read_text()
grommet_marker = "describe('admin portrait-order corner regression'"
if grommet_marker not in grommet_text:
    grommet_text += """

describe('admin portrait-order corner regression', () => {
  it('places four-corner grommets one inch from every edge on a 36 × 60 banner', () => {
    const points = getGrommetPositions(36, 60, '4-corners');

    expect(points).toEqual([
      { x: 1, y: 1 },
      { x: 35, y: 1 },
      { x: 1, y: 59 },
      { x: 35, y: 59 },
    ]);
    expect((points[0].x / 36) * 100).toBeCloseTo(2.778, 3);
    expect((points[1].x / 36) * 100).toBeCloseTo(97.222, 3);
  });
});
"""
    grommet_test.write_text(grommet_text)
    print("portrait grommet regression test: added")
else:
    print("portrait grommet regression test: already present")

source_test = Path("netlify/functions/__tests__/sitewide-preview-surfaces.test.cjs")
source_text = source_test.read_text()
source_marker = "test('Admin preview frame and grommet overlay share one exact product rectangle'"
if source_marker not in source_text:
    source_text += r'''

test('Admin preview frame and grommet overlay share one exact product rectangle', () => {
  const orders = read('src/pages/admin/Orders.tsx');
  const geometry = read('src/lib/admin-preview-frame.ts');

  assert.match(orders, /getAdminPreviewFrameStyle\(width, height, large\)/);
  assert.match(orders, /preserveAspectRatio="none"/);
  assert.doesNotMatch(orders, /large \? 'max-h-\[66vh\]' : 'h-full'/);
  assert.match(geometry, /maxWidth: formatDvh\(ADMIN_LARGE_PREVIEW_MAX_HEIGHT_DVH \* ratio\)/);
  assert.match(geometry, /aspectRatio/);
});
'''
    source_test.write_text(source_text)
    print("admin preview integration regression test: added")
else:
    print("admin preview integration regression test: already present")
