import type { CartItem } from '@/store/cart';
import { getGrommetModeForPreview } from '@/lib/cartGrommet';
import { getGrommetPositions, toGrommetOverlayOption } from './grommetPositions';
import { grommetRadius } from './grommets';

export type BannerEdge = 'top' | 'bottom' | 'left' | 'right';
const SUPPORTED_MATERIALS = new Set(['13oz', '15oz', '18oz', '18oz_double', 'mesh']);
const SUPPORTED_GROMMETS = new Set(['none', '4-corners', 'top-corners', 'bottom-corners', 'left-corners', 'right-corners', 'every-1-2ft', 'every-2-3ft']);

export function isRealisticBannerItem(item: CartItem): boolean {
  return (!item.product_type || item.product_type === 'banner')
    && SUPPORTED_MATERIALS.has(item.material)
    && Number.isFinite(item.width_in) && item.width_in > 0
    && Number.isFinite(item.height_in) && item.height_in > 0;
}

function selectedEdges(value?: string | null): BannerEdge[] {
  switch (value) {
    case 'top': return ['top'];
    case 'bottom': return ['bottom'];
    case 'left': return ['left'];
    case 'right': return ['right'];
    case 'top-bottom': return ['top', 'bottom'];
    default: return [];
  }
}

/** All geometry is in order inches; changing orientation never stretches artwork. */
export function getRealisticBannerGeometry(item: CartItem) {
  const w = item.width_in;
  const h = item.height_in;
  const sceneRatio = Math.max(0.9, Math.min(1.8, w / h));
  const sceneWidth = Math.max(w / 0.80, h * sceneRatio / 0.80);
  const sceneHeight = sceneWidth / sceneRatio;
  const x = (sceneWidth - w) / 2;
  const y = (sceneHeight - h) / 2;
  const mode = getGrommetModeForPreview(item);
  // Unknown legacy options must not invent hardware.
  const grommets = SUPPORTED_GROMMETS.has(mode)
    ? getGrommetPositions(w, h, toGrommetOverlayOption(mode))
    : [];
  const pocketEdges = selectedEdges(item.pole_pocket_position || item.pole_pockets);
  const pocketDepth = Math.min(Number(item.pole_pocket_size) || 2, Math.min(w, h) / 3);
  // Legacy rope orders with no placement retain the pricing engine's top default.
  const ropeEdges = item.rope_feet > 0 ? selectedEdges(item.rope_placement || 'top') : [];
  return {
    w, h, x, y, sceneWidth, sceneHeight, sceneRatio, grommets,
    grommetRadius: grommetRadius(w, h) * 1.25,
    pocketEdges, pocketDepth, ropeEdges,
    isMesh: item.material === 'mesh',
  };
}

export type RealisticBannerGeometry = ReturnType<typeof getRealisticBannerGeometry>;

/** A physical surface mask: perforations and eyelet openings reveal the wall. */
export function createBannerSurfaceMask(geometry: RealisticBannerGeometry): string {
  const { w, h, isMesh, grommets, grommetRadius: radius, pocketEdges, pocketDepth } = geometry;
  // A fine mesh visual approximation, independent of artwork pixels. The
  // reinforced perimeter/pockets remain opaque. Never export this to production.
  const mesh = isMesh ? `<defs><pattern id="mesh" width="0.09" height="0.09" patternUnits="userSpaceOnUse"><rect width="0.09" height="0.09" fill="white"/><rect x="0.025" y="0.022" width="0.04" height="0.046" fill="black"/></pattern></defs><rect x="0.7" y="0.7" width="${Math.max(0, w - 1.4)}" height="${Math.max(0, h - 1.4)}" fill="url(#mesh)"/>` : '';
  const pockets = pocketEdges.map((edge) => {
    const vertical = edge === 'left' || edge === 'right';
    return `<rect x="${edge === 'right' ? w - pocketDepth : 0}" y="${edge === 'bottom' ? h - pocketDepth : 0}" width="${vertical ? pocketDepth : w}" height="${vertical ? h : pocketDepth}" fill="white"/>`;
  }).join('');
  const holes = grommets.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="${radius * 0.54}" fill="black"/>`).join('');
  // SVG mask converts black to transparent before CSS consumes its alpha.
  const maskScale = Math.min(20, 1600 / Math.max(w, h));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * maskScale}" height="${h * maskScale}" viewBox="0 0 ${w} ${h}"><defs><mask id="surface" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="white"/>${mesh}${pockets}${holes}</mask></defs><rect width="${w}" height="${h}" fill="white" mask="url(#surface)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
