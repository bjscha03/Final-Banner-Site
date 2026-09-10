'use strict';

// One geometry definition drives both AI art direction and the real logo layer.
function logoPlacement(brief, width, height, aspectRatio = 1) {
  const change = brief.layers?.logo || {};
  const scale = Math.max(0.25, Math.min(3, Number(change.scale) || 1));
  const boxWidth = width * Math.min(0.6, 0.24 * scale);
  const boxHeight = height * Math.min(0.7, 0.34 * scale);
  const ratio = Math.max(0.02, Math.min(50, Number(aspectRatio) || 1));
  const logoWidth = Math.max(1, Math.round(Math.min(boxWidth, boxHeight * ratio)));
  const logoHeight = Math.max(1, Math.round(logoWidth / ratio));
  const mx = Math.round(width * 0.05), my = Math.round(height * 0.06);
  const position = brief.logoPosition || 'upper-right';
  const areaLeft = position.includes('right') ? width - mx - boxWidth : mx;
  const areaTop = position.includes('lower') ? height - my - boxHeight : my;
  const left = Math.round(Math.max(mx, Math.min(width - logoWidth - mx, change.x !== undefined ? width * change.x : areaLeft + (boxWidth - logoWidth) / 2)));
  const top = Math.round(Math.max(my, Math.min(height - logoHeight - my, change.y !== undefined ? height * change.y : areaTop + (boxHeight - logoHeight) / 2)));
  return { left, top, width: logoWidth, height: logoHeight, position };
}

function logoPlate(placement, width, height) {
  const padX = Math.max(8, Math.round(placement.width * 0.08));
  const padY = Math.max(6, Math.round(placement.height * 0.14));
  const left = Math.max(0, placement.left - padX);
  const top = Math.max(0, placement.top - padY);
  return { left, top, width: Math.min(width - left, placement.width + padX * 2), height: Math.min(height - top, placement.height + padY * 2) };
}

// Historical drafts carry the application's navy/orange preset as if the
// customer chose it. A request to use the uploaded logo must take precedence.
function requestsLogoColors(brief) {
  return /(?:colou?rs?|palette).{0,90}(?:logo|brand mark)|(?:logo|brand mark).{0,90}(?:colou?rs?|palette)/i.test(brief.description || '');
}

function logoPaletteDirection(brief, resetInferred = false) {
  const legacyDefault = /^Navy, white, and (?:restrained orange accents|orange)$/i.test(brief.colorPalette || '');
  return (resetInferred && requestsLogoColors(brief)) || legacyDefault ? 'Use the uploaded logo’s actual colors as the brand palette' : brief.colorPalette;
}

async function prepareLogo(image) {
  if (!image?.buffer) return null;
  if (image.prepared === true && image.width > 0 && image.height > 0) return image;
  const sharp = require('sharp');
  const { data, info } = await sharp(image.buffer).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  let visiblePixels = 0, weightedLuminance = 0, alphaWeight = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * 4;
    const alpha = data[offset + 3] / 255;
    if (alpha === 0) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
    visiblePixels += 1;
    alphaWeight += alpha;
    weightedLuminance += alpha * (0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) / 255;
  }
  if (right < left || bottom < top) {
    const error = new Error('This logo is completely transparent. Choose a visible logo file.');
    error.code = 'INVALID_IMAGE'; throw error;
  }
  const width = right - left + 1, height = bottom - top + 1;
  // Only fully transparent outer pixels are removed. White backgrounds and
  // every visible mark remain exactly as supplied; no AI redraw or stretching.
  const buffer = await sharp(data, { raw: info }).extract({ left, top, width, height }).png().toBuffer();
  const visibleCoverage = visiblePixels / (width * height);
  const averageLuminance = alphaWeight ? weightedLuminance / alphaWeight : 0.5;
  return {
    buffer, mimeType: 'image/png', width, height, prepared: true,
    // Transparent wordmarks need a quiet fitted backing so generated lettering
    // can never show through them. Opaque rectangular logos already provide it.
    needsContrastPlate: visibleCoverage < 0.9,
    contrastPlate: averageLuminance >= 0.52 ? '#0b1f3a' : '#ffffff',
  };
}

function logoPrompt(brief) {
  if (brief.logoRendering === 'integrated') {
    return `Integrate the supplied customer logo ONCE into the finished artwork as a natural part of the composition. Preserve its recognizable identity, shapes, brand colors and lettering faithfully: ${JSON.stringify(brief.logoWording || [])}. Keep all visible logo wording accurate; do not invent extra taglines or brand claims. Treat plain surrounding upload background as source-image background, not a white rectangle that must be pasted onto the banner. Give the logo natural space and visual balance with the headline and illustration; choose its best position as the designer. Do not add a second version, repeated brand mark, extra logo badge, or duplicate lettering. No original-logo overlay will be added afterward, so there is no reserved corner or placeholder to leave. If an approved copy value repeats the same business name already inside the logo, the logo can satisfy that wording once; do not repeat it separately. Keep the logo and all lettering legible and clear of overlapping objects.`;
  }
  const w = brief.outputWidthPx || 1000;
  const h = brief.outputHeightPx || w / brief.aspectRatio;
  const placement = logoPlacement(brief, w, h, brief.logoAspectRatio || 1);
  const footprint = brief.logoNeedsContrastPlate ? logoPlate(placement, w, h) : placement;
  const pct = (value, total) => `${(value / total * 100).toFixed(1)}%`;
  return `The supplied customer logo is a BRAND REFERENCE ONLY. Do not draw, copy, recreate, or render that logo anywhere in the generated artwork; the exact original is composited once afterward. Do not copy its lettering into the artwork unless separately included in the approved copy. The original customer logo${brief.logoNeedsContrastPlate ? ' and its fitted backing' : ', including any opaque background in the upload,'} will be placed afterward at ${brief.logoPosition}: left ${pct(footprint.left, w)}, top ${pct(footprint.top, h)}, width ${pct(footprint.width, w)}, height ${pct(footprint.height, h)} of the final canvas. Compose around this exact footprint so the logo reads as an intentional brand element. Keep ALL lettering, headline strokes, outlines, shadows and important illustration completely outside this rectangle with at least 3% canvas breathing room. Never run a headline behind or underneath the logo. Place the headline in the remaining space; reduce or reflow it as needed. Continue a quiet, low-detail version of the surrounding background through this area. Do not draw a placeholder, empty white badge, cloud, frame, circle, label, extra panel, or a replacement logo.`;
}
module.exports = { logoPlacement, logoPlate, prepareLogo, logoPrompt, logoPaletteDirection, requestsLogoColors };
