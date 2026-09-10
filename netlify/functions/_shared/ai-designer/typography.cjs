'use strict';
const fontkit = require('fontkit');
const path = require('node:path');
const fs = require('node:fs');
const fonts = new Map();
function getFont(name) {
  const filename = name === 'DejaVu Serif' || name === 'Georgia' ? 'DejaVuSerif-Bold.ttf'
    : 'DejaVuSans-Bold.ttf';
  if (!fonts.has(filename)) {
    const local = path.join(__dirname, 'fonts', filename);
    const location = fs.existsSync(local) ? local : path.join(process.cwd(), 'netlify/functions/_shared/ai-designer/fonts', filename);
    fonts.set(filename, fontkit.openSync(location));
  }
  return fonts.get(filename);
}
function measureText(value, size, name) {
  const font = getFont(name);
  return font.layout(value).positions.reduce((sum, position) => sum + position.xAdvance, 0) * size / font.unitsPerEm;
}
function textPaths(lines, { x, y, fontSize, font: name, color, anchor, lineHeight }) {
  const font = getFont(name);
  const scale = fontSize / font.unitsPerEm;
  return lines.map((line, lineIndex) => {
    const run = font.layout(line);
    if (run.glyphs.some(glyph => glyph.id === 0)) {
      const error = new Error('A character in the wording is not supported by this font. Use plain text or another font.');
      error.code = 'VALIDATION_FAILED'; throw error;
    }
    const width = run.positions.reduce((sum, position) => sum + position.xAdvance, 0) * scale;
    const left = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
    let cursor = 0;
    return run.glyphs.map((glyph, index) => {
      const position = run.positions[index];
      const gx = left + (cursor + position.xOffset) * scale;
      const gy = y + lineIndex * fontSize * lineHeight - position.yOffset * scale;
      cursor += position.xAdvance;
      return `<path d="${glyph.path.toSVG()}" transform="translate(${gx} ${gy}) scale(${scale} ${-scale})" fill="${color}"/>`;
    }).join('');
  }).join('');
}
module.exports = { measureText, textPaths };
