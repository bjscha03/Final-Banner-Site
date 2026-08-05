'use strict';

const sharp = require('sharp');
const { validateInputImage } = require('./image-utils.cjs');

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

function renderTextBlock({ value, x, y, fontSize, width, weight = 700, color = '#ffffff', anchor, maxLines = 2, lineHeight = 1.08, role }) {
  if (!value) return { svg: '', height: 0, layer: null };
  let fittedFontSize = fontSize;
  const longestToken = String(value).split(/\s+/).reduce((longest, token) => Math.max(longest, token.length), 1);
  fittedFontSize = Math.min(fittedFontSize, width / (longestToken * 0.56));
  let maxChars = Math.max(8, Math.floor(width / (fittedFontSize * 0.56)));
  let lines = wrapText(value, maxChars);

  // Exact customer copy must never be ellipsized or silently discarded. Reduce
  // the type size until the complete value fits the intended line budget.
  const minimumFontSize = Math.max(11, fontSize * 0.32);
  while (lines.length > maxLines && fittedFontSize > minimumFontSize) {
    fittedFontSize = Math.max(minimumFontSize, fittedFontSize * 0.9);
    maxChars = Math.max(8, Math.floor(width / (fittedFontSize * 0.56)));
    lines = wrapText(value, maxChars);
  }

  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : fittedFontSize * lineHeight}">${escapeXml(line)}</tspan>`).join('');
  return {
    svg: `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${fittedFontSize}" font-weight="${weight}" fill="${color}" stroke="rgba(0,0,0,0.28)" stroke-width="${Math.max(1, fittedFontSize * 0.018)}" paint-order="stroke" letter-spacing="${role === 'headline' ? -fittedFontSize * 0.02 : 0}">${tspans}</text>`,
    height: fittedFontSize * (1 + (lines.length - 1) * lineHeight),
    layer: { role, value, x, y, fontSize: fittedFontSize, color, weight, anchor, lines },
  };
}

async function compositeArtwork({ background, brief, logo }) {
  const width = Math.round(brief.outputWidthPx);
  const height = Math.round(brief.outputHeightPx);
  const position = brief.textPosition;
  const anchor = textAnchor(position);
  const x = xFor(position, width);
  const maxWidth = zoneWidth(position, width);
  const textColor = /^#[0-9a-f]{6}$/i.test(brief.textColor || '') ? brief.textColor : '#ffffff';
  const accentColor = /^#[0-9a-f]{6}$/i.test(brief.accentColor || '') ? brief.accentColor : '#f97316';
  const copy = brief.copy;
  const specs = [
    [copy.businessName, 0.045, 'businessName', { color: accentColor, weight: 700, maxLines: 1, gapPct: 0.035 }],
    [copy.headline, 0.105, 'headline', { weight: 900, maxLines: 2, gapPct: 0.04 }],
    [copy.supportingText, 0.047, 'supportingText', { weight: 600, maxLines: 2, gapPct: 0.03 }],
    [copy.offer, 0.07, 'offer', { color: accentColor, weight: 900, maxLines: 1, gapPct: 0.035 }],
    [copy.callToAction, 0.052, 'callToAction', { weight: 800, maxLines: 1, gapPct: 0.03 }],
    ...[copy.phone, copy.website, copy.address, copy.date, copy.other]
      .map((value) => [value, 0.034, 'detail', { weight: 650, maxLines: 1, gapPct: 0.018 }]),
  ];

  const layoutAtScale = (scale) => {
    const laidOut = [];
    let y = height * 0.12;
    for (const [value, sizePct, role, options] of specs) {
      const block = renderTextBlock({
        value,
        x,
        y,
        fontSize: height * sizePct * scale,
        width: maxWidth,
        anchor,
        color: options.color || textColor,
        weight: options.weight || 700,
        maxLines: options.maxLines || 2,
        role,
      });
      if (block.layer) {
        laidOut.push(block);
        y += block.height + height * (options.gapPct || 0.035) * scale;
      }
    }
    return { blocks: laidOut, bottom: y };
  };

  let scale = 1;
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
  const blocks = layout.blocks;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g>${blocks.map((block) => block.svg).join('')}</g></svg>`;
  const composites = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  let logoLayer = null;
  if (logo?.buffer) {
    const validLogo = await validateInputImage(logo, 12_000_000);
    const maxLogoW = Math.round(width * 0.2);
    const maxLogoH = Math.round(height * 0.22);
    const resized = await sharp(validLogo.buffer).resize(maxLogoW, maxLogoH, { fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    const marginX = Math.round(width * 0.05);
    const marginY = Math.round(height * 0.06);
    const right = brief.logoPosition.includes('right');
    const lower = brief.logoPosition.includes('lower');
    const left = right ? width - resized.info.width - marginX : marginX;
    const top = lower ? height - resized.info.height - marginY : marginY;
    composites.push({ input: resized.data, left, top });
    logoLayer = { left, top, width: resized.info.width, height: resized.info.height, position: brief.logoPosition };
  }

  let buffer = await sharp(background)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .composite(composites)
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
  const responseMaster = buffer;
  // Keep the single flattened artifact below buffered serverless response
  // limits without changing its dimensions or aspect ratio.
  for (const quality of [84, 78, 72, 66, 60, 54, 48]) {
    if (buffer.length <= 3_250_000) break;
    buffer = await sharp(responseMaster).jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
  }
  if (buffer.length > 3_500_000) {
    const error = new Error('The flattened artwork exceeds the safe response limit.');
    error.code = 'VALIDATION_FAILED';
    throw error;
  }
  return { buffer, textLayers: blocks.map((block) => block.layer), logoLayer };
}

module.exports = { compositeArtwork, wrapText, escapeXml };
