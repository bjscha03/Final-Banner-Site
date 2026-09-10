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
  const placement = logoPlacement(brief, 1000, 1000 / brief.aspectRatio, brief.logoAspectRatio || 1);
  const h = 1000 / brief.aspectRatio;
  const pct = (value, total) => `${(value / total * 100).toFixed(1)}%`;
  return `The original customer logo will be placed afterward at ${brief.logoPosition}: left ${pct(placement.left, 1000)}, top ${pct(placement.top, h)}, width ${pct(placement.width, 1000)}, height ${pct(placement.height, h)} of the final canvas. Compose around this exact footprint so the logo reads as an intentional brand element. Keep important wording and illustration outside it. Continue a quiet, low-detail version of the surrounding background through this area. Do not draw a placeholder, empty white badge, cloud, frame, circle, label, extra panel, or a replacement logo.`;
}
module.exports = { logoPlacement, prepareLogo, logoPrompt };
