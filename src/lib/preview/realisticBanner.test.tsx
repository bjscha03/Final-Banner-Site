import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CartItem } from '@/store/cart';
import { createBannerSurfaceMask, formatBannerDimensions, getRealisticBannerGeometry, isRealisticBannerItem } from './realisticBanner';
import { RealisticBannerScene } from '@/components/preview/RealisticBannerPreview';
import { rememberDecodedPreviewImage } from '@/lib/previewImageCache';
import sharp from 'sharp';

const item = { id: 'preview', product_type: 'banner', width_in: 72, height_in: 36, material: '13oz', grommets: 'none', pole_pockets: 'none', rope_feet: 0, final_render_url: 'https://example.test/exact-artwork.png' } as CartItem;

describe('realistic banner order geometry', () => {
  it('shows feet first and preserves exact inches, including non-whole feet', () => {
    expect(formatBannerDimensions(72, 36)).toEqual({ feet: '6 ft × 3 ft', inches: '(72″ × 36″)' });
    expect(formatBannerDimensions(75, 42)).toEqual({ feet: '6 ft 3 in × 3 ft 6 in', inches: '(75″ × 42″)' });
  });
  it('centers both small and large banners against the wall', () => {
    for (const [w, h] of [[72, 36], [240, 120], [600, 60]]) {
      const g = getRealisticBannerGeometry({ ...item, width_in: w, height_in: h });
      expect(g.x).toBeCloseTo((g.sceneWidth - w) / 2);
      expect(g.y).toBeCloseTo((g.sceneHeight - h) / 2);
    }
  });
  it.each([
    ['none', 0], ['4-corners', 4], ['top-corners', 2], ['bottom-corners', 2],
    ['left-corners', 2], ['right-corners', 2], ['every-2-3ft', 10], ['every-1-2ft', 12],
  ] as const)('respects %s without inventing grommets', (grommets, count) => {
    const result = getRealisticBannerGeometry({ ...item, grommets });
    expect(result.grommets).toHaveLength(count);
    expect(new Set(result.grommets.map(p => `${p.x},${p.y}`)).size).toBe(count);
    result.grommets.forEach(p => {
      expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(72);
      expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(36);
    });
  });
  it('keeps the selected side and AI option precedence', () => {
    expect(getRealisticBannerGeometry({ ...item, grommets: 'left-corners' }).grommets).toEqual([{ x: 1, y: 1 }, { x: 1, y: 35 }]);
    expect(getRealisticBannerGeometry({ ...item, grommets: '4-corners', grommetOption: 'none' } as CartItem).grommets).toEqual([]);
    expect(getRealisticBannerGeometry({ ...item, grommetOption: 'four_corners' } as CartItem).grommets).toHaveLength(4);
  });
  it.each([[72, 36], [36, 72], [48, 48], [600, 60], [12, 120]])('fits %s by %s without changing proportions', (w, h) => {
    const g = getRealisticBannerGeometry({ ...item, width_in: w, height_in: h });
    expect(g.w / g.h).toBe(w / h);
    expect(g.x).toBeGreaterThan(0); expect(g.y).toBeGreaterThan(0);
    expect(g.x + g.w).toBeLessThan(g.sceneWidth); expect(g.y + g.h).toBeLessThan(g.sceneHeight);
  });
  it('uses true mesh openings only for mesh and honors pocket and rope selections', () => {
    const plain = getRealisticBannerGeometry(item);
    expect(createBannerSurfaceMask(plain)).not.toContain('pattern');
    const mesh = getRealisticBannerGeometry({ ...item, material: 'mesh', pole_pockets: 'top-bottom', pole_pocket_size: '3', rope_feet: 12, rope_placement: 'bottom' });
    expect(createBannerSurfaceMask(mesh)).toContain('pattern');
    expect(mesh.pocketEdges).toEqual(['top', 'bottom']); expect(mesh.pocketDepth).toBe(3);
    expect(mesh.ropeEdges).toEqual(['bottom']);
    expect(plain.ropeEdges).toEqual([]); expect(plain.pocketEdges).toEqual([]);
  });
  it('excludes non-banner products and invalid sizes', () => {
    expect(isRealisticBannerItem(item)).toBe(true);
    expect(isRealisticBannerItem({ ...item, product_type: 'yard_sign' })).toBe(false);
    expect(isRealisticBannerItem({ ...item, material: 'magnetic', product_type: 'car_magnet' })).toBe(false);
    expect(isRealisticBannerItem({ ...item, width_in: 0 })).toBe(false);
  });
  it('preserves the exact saved print layout without cropping or repeating baked layers', () => {
    rememberDecodedPreviewImage({ url: item.final_render_url!, naturalWidth: 1440, naturalHeight: 720 });
    const html = renderToStaticMarkup(<RealisticBannerScene item={{ ...item, text_elements: [{ id: 'baked', content: 'DO NOT REPEAT BAKED TEXT', xPercent: 50, yPercent: 50 } as any], grommets: 'none' }} expanded/>);
    expect(html).toContain(item.final_render_url);
    expect(html).toContain('transform:none');
    expect(html).toContain('data-preview-bleed-compensated="false"');
    expect(html).not.toContain('DO NOT REPEAT BAKED TEXT');
    expect(html).not.toContain('data-realistic-grommet');
    expect(html).not.toContain('data-realistic-anchor');
  });

  it.each([[36, 60], [120, 48], [48, 48], [600, 60]])(
    'never adds light pixels or white edge strips to a solid %s by %s print',
    async (w, h) => {
      for (const pole_pockets of ['none', 'top-bottom', 'left', 'right']) {
        for (const limits of [[0, 0, 0], [16, 48, 64]]) {
          const html = renderToStaticMarkup(<RealisticBannerScene item={{ ...item,
            width_in: w, height_in: h, pole_pockets, grommets: '4-corners',
        } as CartItem} expanded />);
        const surface = html.match(/<svg class="realistic-banner-surface-light"[\s\S]*?<\/svg>/)![0];
        const width = 600;
        const height = Math.round(width * h / w);
        // Rasterize the actual production SVG over borderless artwork. This
        // fails for the old white rim/hem even when the saved proof is correct.
        const svg = surface.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `)
          .replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="rgb(${limits.join(',')})"/>`);
        const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let lightened = 0;
        for (let i = 0; i < data.length; i += info.channels) {
          if (limits.some((limit, channel) => data[i + channel] > limit + 1)) lightened++;
        }
        expect(lightened, `${w}×${h}, pockets: ${pole_pockets}`).toBe(0);
        }
      }
    },
  );
});
