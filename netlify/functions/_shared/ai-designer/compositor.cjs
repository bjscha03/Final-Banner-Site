'use strict';

const sharp = require('sharp');
const { validateInputImage } = require('./image-utils.cjs');
const { normalizeLayers } = require('./layers.cjs');
const { measureText, textPaths } = require('./typography.cjs');

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]));
}

function wrapText(value, maxChars) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textAnchor(position) {
  return position === 'center' ? 'middle' : position === 'right' ? 'end' : 'start';
}

function xFor(position, width) {
  return position === 'center' ? width / 2 : position === 'right' ? width * 0.94 : width * 0.06;
}

function zoneWidth(position, width) {
  return width * (position === 'center' ? 0.76 : 0.47);
}

function renderTextBlock({ value, x, y, fontSize, width, weight = 700, color = '#ffffff', anchor, maxLines = 2, lineHeight = 1.08, role, font = 'DejaVu Sans' }) {
  if (!value) return { svg: '', height: 0, layer: null };
  let fittedFontSize = fontSize;
  const words = String(value).split(/\s+/).filter(Boolean);
  const longestToken = Math.max(...words.map(word => measureText(word, 1, font)), 1);
  fittedFontSize = Math.min(fittedFontSize, width / longestToken);
  const wrap = (size) => {
    const result = []; let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (!line || measureText(next, size, font) <= width) line = next;
      else { result.push(line); line = word; }
    }
    if (line) result.push(line);
    return result;
  };
  let lines = wrap(fittedFontSize);

  // Exact customer copy must never be ellipsized or silently discarded. Reduce
  // the type size until the complete value fits the intended line budget.
  const minimumFontSize = Math.max(11, fontSize * 0.32);
  while (lines.length > maxLines && fittedFontSize > minimumFontSize) {
    fittedFontSize = Math.max(minimumFontSize, fittedFontSize * 0.9);
    lines = wrap(fittedFontSize);
  }

  return {
    svg: textPaths(lines, { x, y, fontSize: fittedFontSize, font, color, anchor, lineHeight }),
    height: fittedFontSize * (1.2 + (lines.length - 1) * lineHeight),
    layer: { role, value, x, y, fontSize: fittedFontSize, color, weight, anchor, lines, font, width },
  };
}

async function compositeArtwork({ background, brief, logo, photos = [] }) {
  const width = Math.round(brief.outputWidthPx);
  const height = Math.round(brief.outputHeightPx);
  const position = brief.textPosition;
  const anchor = textAnchor(position);
  const x = xFor(position, width);
  const maxWidth = zoneWidth(position, width);
  const textColor = /^#[0-9a-f]{6}$/i.test(brief.textColor || '') ? brief.textColor : '#ffffff';
  const accentColor = /^#[0-9a-f]{6}$/i.test(brief.accentColor || '') ? brief.accentColor : '#f97316';
  // AI lettering is already part of the artwork. Never overlay fallback type.
  const copy = brief.typographyMode === 'ai' ? {} : brief.copy;
  const overrides = normalizeLayers(brief.layers);
  const specs = [
    [copy.businessName, 0.045, 'businessName', { color: accentColor, weight: 700, maxLines: 1, gapPct: 0.035 }],
    [copy.headline, 0.105, 'headline', { weight: 900, maxLines: 2, gapPct: 0.04 }],
    [copy.supportingText, 0.047, 'supportingText', { weight: 600, maxLines: 2, gapPct: 0.03 }],
    [copy.offer, 0.07, 'offer', { color: accentColor, weight: 900, maxLines: 1, gapPct: 0.035 }],
    [copy.callToAction, 0.052, 'callToAction', { weight: 800, maxLines: 1, gapPct: 0.03 }],
    ...['phone', 'website', 'address', 'date', 'other']
      .map((role) => [copy[role], 0.034, role, { weight: 650, maxLines: 1, gapPct: 0.018 }]),
  ];

  const layoutAtScale = (scale) => {
    const laidOut = [];
    let top = height * 0.06;
    for (const [value, sizePct, role, options] of specs) {
      let block = renderTextBlock({
        value,
        x,
        y: 0,
        fontSize: height * sizePct * scale,
        width: maxWidth,
        anchor,
        color: options.color || textColor,
        weight: options.weight || 700,
        maxLines: options.maxLines || 2,
        role,
      });
      if (block.layer) {
        block = renderTextBlock({ ...block.layer, y: top + block.layer.fontSize, maxLines: block.layer.lines.length });
        laidOut.push(block);
        top += block.height + height * (options.gapPct || 0.035) * scale;
      }
    }
    return { blocks: laidOut, bottom: top };
  };

  let scale = 1.5;
  let layout = layoutAtScale(scale);
  while (layout.bottom > height * 0.94 && scale > 0.25) {
    scale *= 0.88;
    layout = layoutAtScale(scale);
  }
  if (layout.bottom > height * 0.96) {
    const error = new Error('The supplied exact copy does not fit safely in the selected text zone. Shorten the wording or choose a wider text zone.');
    error.code = 'VALIDATION_FAILED';
    throw error;
  }
  const offset = Math.max(0, (height * 0.88 - layout.bottom) / 2);
  const blocks = layout.blocks.map(block => offset ? renderTextBlock({ ...block.layer, y: block.layer.y + offset, maxLines: block.layer.lines.length }) : block);

  // Recompose only the requested layers; the existing background remains intact.
  for (let index = 0; index < blocks.length; index += 1) {
    const original = blocks[index].layer;
    const change = overrides[original.role];
    if (!change) continue;
    const zone = Math.min(width * 0.9, change.width ? width * change.width : original.width);
    const wantedX = change.x !== undefined ? width * change.x : original.x;
    const minX = width * 0.05 + (anchor === 'end' ? zone : anchor === 'middle' ? zone / 2 : 0);
    const maxX = width * 0.95 - (anchor === 'start' ? zone : anchor === 'middle' ? zone / 2 : 0);
    const options = { ...original, x: Math.max(minX, Math.min(maxX, wantedX)), width: zone, fontSize: original.fontSize * (change.scale || 1), font: change.font || original.font, color: change.color || original.color, maxLines: 4 };
    let block = renderTextBlock(options);
    if (block.height > height * 0.85) {
      options.fontSize *= height * 0.85 / block.height;
      block = renderTextBlock(options);
    }
    options.y = Math.max(height * 0.05 + block.layer.fontSize, Math.min(height * 0.95 - block.height + block.layer.fontSize, change.y !== undefined ? height * change.y : original.y));
    blocks[index] = renderTextBlock(options);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g>${blocks.map((block) => block.svg).join('')}</g></svg>`;
  const composites = [];
  let logoLayer = null;
  const photoLayers = [];
  for (let index = 0; index < Math.min(3, photos.length); index += 1) {
    const source = await validateInputImage(photos[index], 12_000_000);
    const role = `photo${index}`;
    const change = overrides[role] || {};
    const scale = change.scale || 1;
    const image = await sharp(source.buffer).rotate().resize(Math.round(width * Math.min(0.8, 0.38 * scale)), Math.round(height * Math.min(0.8, 0.52 / photos.length * scale)), { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    const left = Math.round(Math.max(width * 0.05, Math.min(width * 0.95 - image.info.width, width * (change.x ?? (position === 'right' ? 0.05 : 0.57)))));
    const top = Math.round(Math.max(height * 0.05, Math.min(height * 0.95 - image.info.height, height * (change.y ?? (0.35 + index * 0.55 / photos.length)))));
    composites.push({ input: image.data, left, top });
    photoLayers.push({ role, left, top, width: image.info.width, height: image.info.height });
  }
  // Keep typography readable above customer photos.
  composites.push({ input: Buffer.from(svg), top: 0, left: 0 });
  if (logo?.buffer && brief.logoRendering !== 'integrated') {
    const { prepareLogo, logoPlacement, logoPlate } = require('./logo.cjs');
    const validLogo = await prepareLogo(await validateInputImage(logo, 12_000_000));
    const placement = logoPlacement(brief, width, height, validLogo.width / validLogo.height);
    const resized = await sharp(validLogo.buffer).resize(placement.width, placement.height, { fit: 'fill' }).png().toBuffer();
    if (validLogo.needsContrastPlate) {
      const { left: plateLeft, top: plateTop, width: plateWidth, height: plateHeight } = logoPlate(placement, width, height);
      const radius = Math.max(8, Math.round(Math.min(plateWidth, plateHeight) * 0.12));
      const plate = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${plateWidth}" height="${plateHeight}"><rect width="100%" height="100%" rx="${radius}" fill="${validLogo.contrastPlate}" fill-opacity="0.96"/></svg>`);
      composites.push({ input: plate, left: plateLeft, top: plateTop });
      logoLayer = { ...placement, plate: { left: plateLeft, top: plateTop, width: plateWidth, height: plateHeight, color: validLogo.contrastPlate } };
    }
    composites.push({ input: resized, left: placement.left, top: placement.top });
    logoLayer = { ...logoLayer, ...placement, sourceWidth: validLogo.width, sourceHeight: validLogo.height };

  }

  const buffer = await sharp(background)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .composite(composites)
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
  // The production JPEG is stored intact. Only the UI preview travels in JSON.
  const preview = await sharp(buffer).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { buffer, preview, textLayers: blocks.map((block) => block.layer), logoLayer, photoLayers };
}

module.exports = { compositeArtwork, wrapText, escapeXml };
