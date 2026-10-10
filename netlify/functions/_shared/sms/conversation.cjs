'use strict';

const { repriceStripeCart } = require('../stripe-server-pricing.cjs');
const { computeTotals, getFeatureFlags } = require('../checkoutTotals.cjs');

const SIZES = { '1': [72, 36], '2': [48, 24], '3': [96, 48] };
const MATERIALS = { '1': '13oz', '2': '15oz', '3': '18oz', '4': 'mesh', '13oz': '13oz', '15oz': '15oz', '18oz': '18oz', mesh: 'mesh' };
const GROMMETS = { '1': 'every-2-3ft', '2': '4-corners', '3': 'none', none: 'none', corners: '4-corners', '4 corners': '4-corners', every: 'every-2-3ft' };
const POCKETS = { '1': 'none', '2': 'top', '3': 'bottom', '4': 'top-bottom', none: 'none', top: 'top', bottom: 'bottom', 'top and bottom': 'top-bottom', 'top-bottom': 'top-bottom' };
const ROPE = { '1': null, '2': 'top', '3': 'bottom', '4': 'top-bottom', none: null, no: null, top: 'top', bottom: 'bottom', 'top-bottom': 'top-bottom' };
const PROMPTS = {
  SIZE: 'What banner size? Reply 1) 6 x 3 ft 2) 4 x 2 ft 3) 8 x 4 ft, or type a custom size with units, e.g. 5 x 3 ft or 60 x 36 in.',
  MATERIAL: 'Choose material: 1) Standard 13oz vinyl 2) Heavy 15oz vinyl 3) Extra-heavy 18oz vinyl 4) Mesh for windy areas. Reply 1-4.',
  GROMMETS: 'Choose grommets (included): 1) Every 2-3 ft 2) Four corners 3) None. Reply 1-3.',
  POCKETS: 'Pole pockets? 1) None 2) Top 3) Bottom 4) Top and bottom. Pockets add $15 setup + $2 per linear foot. Reply 1-4.',
  POCKET_SIZE: 'Pole-pocket opening: reply 1, 2, 3, or 4 for inches.',
  ROPE: 'Rope? 1) None 2) Top 3) Bottom 4) Top and bottom. Rope adds $2 per linear foot. Reply 1-4.',
  QUANTITY: 'How many identical banners? Reply with a whole number, e.g. 1.',
  ARTWORK: 'Send one JPG or PNG photo/artwork as an attachment. Please send the highest-quality original. We will text a preview for approval.',
};

function sizeOf(body) {
  if (SIZES[body]) return { width_in: SIZES[body][0], height_in: SIZES[body][1] };
  const normalized = body.toLowerCase().replaceAll('×', 'x').replace(/feet|foot/g, 'ft').replace(/inches|inch/g, 'in').replace(/[’']/g, 'ft').replace(/[”"]/g, 'in');
  const match = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*(ft|in)?\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(ft|in)?\s*$/);
  if (!match || (!match[2] && !match[4])) return null;
  const firstUnit = match[2] || match[4];
  const secondUnit = match[4] || match[2];
  const size = { width_in: Number(match[1]) * (firstUnit === 'ft' ? 12 : 1), height_in: Number(match[3]) * (secondUnit === 'ft' ? 12 : 1) };
  try { repriceStripeCart([{ ...size, quantity: 1, material: '13oz' }]); return size; } catch { return null; }
}
function itemFor(session) {
  const item = { id: session.id, ...session.config, product_type: 'banner', rope_feet: session.config.rope_placement ? 1 : 0 };
  if (session.artwork) {
    const art = session.artwork;
    Object.assign(item, {
      file_url: art.originalUrl, file_key: art.originalPublicId, file_name: art.originalFilename,
      thumbnail_url: art.previewUrl, web_preview_url: art.previewUrl,
      print_ready_url: art.printUrl, final_render_url: art.printUrl, final_render_file_key: art.printPublicId,
      final_render_width_px: art.widthPx, final_render_height_px: art.heightPx, final_render_dpi: art.dpi,
      artwork_manifest: art.manifest, placement_preview: art.placement,
      fit_mode: session.config.fit_mode || 'fill', image_scale: 1, image_position: { x: 0, y: 0 },
    });
  }
  return repriceStripeCart([item])[0];
}
function quoteFor(session) {
  const flags = getFeatureFlags();
  return computeTotals([itemFor(session)], 0.06, { freeShipping: true, minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0 });
}
function summary(session) {
  const quote = quoteFor(session);
  const config = session.config;
  return `${config.width_in} x ${config.height_in} in, ${config.material}, qty ${config.quantity}. Total $${(quote.total_cents / 100).toFixed(2)} including sales tax. U.S. shipping included.`;
}
function nextStep(session, message) {
  const body = String(message || '').trim().toLowerCase();
  const config = { ...session.config };
  let step;
  switch (session.step) {
    case 'SIZE': {
      const size = sizeOf(body);
      if (!size) return { reply: `Please choose a listed size or include ft/in for a custom size. ${PROMPTS.SIZE}` };
      Object.assign(config, size); step = 'MATERIAL'; break;
    }
    case 'MATERIAL':
      if (!MATERIALS[body]) return { reply: PROMPTS.MATERIAL };
      config.material = MATERIALS[body]; step = 'GROMMETS'; break;
    case 'GROMMETS':
      if (!GROMMETS[body]) return { reply: PROMPTS.GROMMETS };
      config.grommets = GROMMETS[body]; step = 'POCKETS'; break;
    case 'POCKETS':
      if (!Object.hasOwn(POCKETS, body)) return { reply: PROMPTS.POCKETS };
      config.pole_pocket_position = POCKETS[body]; config.pole_pockets = POCKETS[body];
      step = config.pole_pockets === 'none' ? 'ROPE' : 'POCKET_SIZE'; break;
    case 'POCKET_SIZE':
      if (!/^[1-4]$/.test(body)) return { reply: PROMPTS.POCKET_SIZE };
      config.pole_pocket_size = body; step = 'ROPE'; break;
    case 'ROPE':
      if (!Object.hasOwn(ROPE, body)) return { reply: PROMPTS.ROPE };
      config.rope_placement = ROPE[body]; step = 'QUANTITY'; break;
    case 'QUANTITY':
      if (!/^\d+$/.test(body) || Number(body) < 1 || Number(body) > 1000) return { reply: 'Reply with a whole number between 1 and 1000.' };
      config.quantity = Number(body);
      try { quoteFor({ ...session, config }); } catch { return { reply: 'This order needs a custom quote. Please visit https://bannersonthefly.com/custom-quote.' }; }
      step = 'ARTWORK'; break;
    default: return { reply: PROMPTS[session.step] || 'Reply APPROVE to approve your preview, FIT to show the full image, FILL to crop to the size, or RESTART to start again.' };
  }
  const next = { ...session, config, step };
  return { changes: { config, step }, reply: step === 'ARTWORK' ? `${summary(next)}\n${PROMPTS.ARTWORK}` : PROMPTS[step] };
}

module.exports = { PROMPTS, sizeOf, itemFor, quoteFor, summary, nextStep };
