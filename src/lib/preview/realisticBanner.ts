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

export function formatBannerDimensions(widthIn: number, heightIn: number) {
  const length = (inches: number) => {
    const feet = Math.floor(inches / 12);
    const remainder = Number((inches - feet * 12).toFixed(3));
    return `${feet} ft${remainder ? ` ${remainder} in` : ''}`;
  };
  return { feet: `${length(widthIn)} × ${length(heightIn)}`, inches: `(${widthIn}″ × ${heightIn}″)` };
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
  // Center the banner with breathing room; brickwork retains its physical scale.
  const sceneRatio = Math.max(0.9, Math.min(1.8, w / h));
  const sceneWidth = Math.max(w / 0.8, h * sceneRatio / 0.8);
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
function createSvgBannerSurfaceMask(geometry: RealisticBannerGeometry): string {
  const { w, h, isMesh, grommets, grommetRadius: radius, pocketEdges, pocketDepth } = geometry;
  // A fine mesh visual approximation, independent of artwork pixels. The
  // reinforced perimeter/pockets remain opaque. Never export this to production.
  // Paint the solid mesh strands over transparent gaps. Using real alpha
  // instead of nested luminance masks keeps Safari and Chromium consistent.
  const mesh = isMesh ? '<pattern id="mesh" width="0.09" height="0.09" patternUnits="userSpaceOnUse"><path d="M0 0H.09V.09H0Z M.025 .022H.065V.068H.025Z" fill="white" fill-rule="evenodd"/></pattern>' : '';
  const pockets = pocketEdges.map((edge) => {
    const vertical = edge === 'left' || edge === 'right';
    return `<rect x="${edge === 'right' ? w - pocketDepth : 0}" y="${edge === 'bottom' ? h - pocketDepth : 0}" width="${vertical ? pocketDepth : w}" height="${vertical ? h : pocketDepth}" fill="white"/>`;
  }).join('');
  const holes = grommets.map((point) => {
    const r = radius * 0.54;
    return `M${point.x + r} ${point.y}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0Z`;
  }).join(' ');
  const perimeter = isMesh ? `<path d="M0 0H${w}V${h}H0Z M.7 .7H${w - .7}V${h - .7}H.7Z" fill="white" fill-rule="evenodd"/>` : '';
  const maskScale = Math.min(20, 1600 / Math.max(w, h));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * maskScale}" height="${h * maskScale}" viewBox="0 0 ${w} ${h}"><defs>${mesh}<clipPath id="eyelets"><path d="M0 0H${w}V${h}H0Z ${holes}" clip-rule="evenodd"/></clipPath></defs><g clip-path="url(#eyelets)"><rect width="${w}" height="${h}" fill="${isMesh ? 'url(#mesh)' : 'white'}"/>${perimeter}${pockets}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const surfaceMaskCache = new Map<string, string>();

/**
 * Rasterize the physical mask once per finishing configuration. WebKit can
 * drop subpixel SVG patterns when they are used as CSS masks, even though the
 * same SVG decodes correctly as an image. A bounded PNG alpha mask preserves
 * perforations on Safari, Chrome and Firefox without touching the artwork.
 */
export function createBannerSurfaceMask(geometry: RealisticBannerGeometry): string {
  if (typeof document === 'undefined') return createSvgBannerSurfaceMask(geometry);
  const { w, h, isMesh, grommets, grommetRadius: radius, pocketEdges, pocketDepth } = geometry;
  const key = JSON.stringify([w, h, isMesh, grommets, radius, pocketEdges, pocketDepth]);
  const cached = surfaceMaskCache.get(key);
  if (cached) return cached;
  const scale = Math.min(20, 1600 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return createSvgBannerSurfaceMask(geometry);
  ctx.fillStyle = 'white';
  if (isMesh) {
    if (0.09 * scale < 1.5) {
      // At very large sizes individual perforations are subpixel. Render their
      // average coverage rather than inventing oversized visible mesh holes.
      ctx.globalAlpha = 0.77;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    } else {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 2;
      const tileCtx = tile.getContext('2d')!;
      tileCtx.fillStyle = 'white'; tileCtx.fillRect(0, 0, 2, 2);
      tileCtx.clearRect(1, 1, 1, 1);
      ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = 'white';
    const hem = Math.min(0.7, w / 2, h / 2) * scale;
    ctx.fillRect(0, 0, canvas.width, hem); ctx.fillRect(0, canvas.height - hem, canvas.width, hem);
    ctx.fillRect(0, 0, hem, canvas.height); ctx.fillRect(canvas.width - hem, 0, hem, canvas.height);
  } else {
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  pocketEdges.forEach(edge => {
    const vertical = edge === 'left' || edge === 'right';
    ctx.fillStyle = 'white';
    ctx.fillRect((edge === 'right' ? w - pocketDepth : 0) * scale, (edge === 'bottom' ? h - pocketDepth : 0) * scale, (vertical ? pocketDepth : w) * scale, (vertical ? h : pocketDepth) * scale);
  });
  ctx.globalCompositeOperation = 'destination-out';
  grommets.forEach(point => {
    ctx.beginPath(); ctx.arc(point.x * scale, point.y * scale, radius * 0.54 * scale, 0, Math.PI * 2); ctx.fill();
  });
  const result = `url("${canvas.toDataURL('image/png')}")`;
  if (surfaceMaskCache.size >= 24) surfaceMaskCache.delete(surfaceMaskCache.keys().next().value!);
  surfaceMaskCache.set(key, result);
  return result;
}
