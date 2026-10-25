'use strict';

const { normalizeCartItemPlacement } = require('../preview-artifact.cjs');
const { getPermanentEmailPreviewSource } = require('../legacy/email-preview-source.cjs');
const { isRealisticBannerItem, normalizeRealisticBannerOrderItem } = require('./realisticBanner.cjs');

// Only our permanent uploaded images. No arbitrary fetch proxy, redirects, or
// original PDF/artwork substitution that could change the customer's crop.
function isAllowedSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com'
      && !url.username && !url.password && !url.port && !url.search && !url.hash
      && url.pathname.startsWith('/dtrxl120u/image/upload/')
      && !/\.(pdf|svg)(?:$|\/)/i.test(url.pathname);
  } catch { return false; }
}

function getRealisticPreviewUrl(rawItem, baseUrl = 'https://www.bannersonthefly.com') {
  try {
    const item = normalizeRealisticBannerOrderItem(normalizeCartItemPlacement(rawItem));
    if (!isRealisticBannerItem(item) || item.design_service_enabled) return null;
    const source = item.placement_preview
      ? getPermanentEmailPreviewSource(item)
      : item.final_render_url || item.web_preview_url;
    if (!isAllowedSource(source)) return null;
    const params = new URLSearchParams({
      v: '1', url: source, w: String(item.width_in), h: String(item.height_in),
      m: item.material, g: item.grommets || 'none',
      go: item.grommetOption || '', p: item.pole_pocket_position || item.pole_pockets || 'none',
      ps: String(item.pole_pocket_size || '2'), r: String(Number(item.rope_feet) || 0),
      rp: item.rope_placement || 'top', bg: item.canvas_background_color || '#ffffff',
    });
    return `${baseUrl.replace(/\/$/, '')}/.netlify/functions/order-realistic-preview?${params}`;
  } catch { return null; }
}

module.exports = { getRealisticPreviewUrl, isAllowedSource };
