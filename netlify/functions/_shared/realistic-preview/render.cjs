'use strict';

const sharp = require('sharp');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { getRealisticBannerGeometry, createBannerSurfaceMask } = require('./realisticBanner.cjs');

const svgBuffer = (body, w, h, view = `0 0 ${w} ${h}`) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${view}">${body}</svg>`);
const pngUrl = buffer => `data:image/png;base64,${buffer.toString('base64')}`;
let assets;
function loadAssets() {
  if (!assets) assets = Promise.all(['brick-wall', 'vinyl-surface'].map(async name => {
    const file = await readFile(path.join(process.cwd(), 'public/images/preview', `${name}.webp`));
    return sharp(file).png().toBuffer();
  })).catch(error => { assets = null; throw error; });
  return assets;
}

function attachment(point, geometry) {
  const { w, h } = geometry;
  const inset = Math.min(1, w / 2, h / 2) + 0.01;
  const length = Math.min(2.4, Math.min(w, h) * 0.08);
  return {
    x: point.x <= inset ? -length : point.x >= w - inset ? w + length : point.x,
    y: point.y <= inset ? -length : point.y >= h - inset ? h + length : point.y,
  };
}

/** Display-only PNG. Never persisted into any production-artwork field. */
async function renderRealisticPreview(item, sourceBuffer) {
  const geometry = getRealisticBannerGeometry(item);
  const { w, h, x, y, sceneWidth, sceneHeight, sceneRatio, grommets, grommetRadius: radius, isMesh, pocketEdges, pocketDepth, ropeEdges } = geometry;
  const outW = Math.round(1000 * Math.min(1, sceneRatio));
  const outH = Math.round(outW / sceneRatio);
  const scale = outW / sceneWidth;
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const [wall, texture] = await loadAssets();
  const background = /^#[\da-f]{6}$/i.test(item.canvas_background_color || '') ? item.canvas_background_color : '#ffffff';
  // The source is already the saved composition. Preserve every edge and never
  // apply the customer's transforms again or crop it with a cover resize.
  const print = await sharp(sourceBuffer, { limitInputPixels: 40_000_000 })
    .rotate().resize(sw, sh, { fit: 'fill' }).flatten({ background }).png().toBuffer();
  const textureOpacity = isMesh ? .4 : grommets.length ? .94 : .5;
  const fabric = await sharp(texture).resize(sw, sh).ensureAlpha(textureOpacity).png().toBuffer();
  const pockets = pocketEdges.map(edge => {
    const vertical = edge === 'left' || edge === 'right';
    const px = edge === 'right' ? w - pocketDepth : 0;
    const py = edge === 'bottom' ? h - pocketDepth : 0;
    return `<rect x="${px}" y="${py}" width="${vertical ? pocketDepth : w}" height="${vertical ? h : pocketDepth}" fill="url(#hem)"/><path d="${vertical ? `M${edge === 'left' ? pocketDepth : px} 0 V${h}` : `M0 ${edge === 'top' ? pocketDepth : py} H${w}`}" stroke="black" stroke-width=".075" stroke-opacity=".27"/>`;
  }).join('');
  const shading = svgBuffer(`<defs>
    <linearGradient id="satin" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="black" stop-opacity="0"/><stop offset=".16" stop-color="black" stop-opacity="0"/><stop offset=".35" stop-color="black" stop-opacity=".045"/><stop offset=".44" stop-color="black" stop-opacity="0"/><stop offset=".58" stop-color="black" stop-opacity="0"/><stop offset=".84" stop-color="black" stop-opacity=".05"/><stop offset="1" stop-color="black" stop-opacity="0"/></linearGradient>
    <linearGradient id="hem" x1="0" y1="0" x2="0" y2="1"><stop stop-color="black" stop-opacity=".04"/><stop offset=".45" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity=".12"/></linearGradient>
    </defs><rect width="${w}" height="${h}" fill="url(#satin)" opacity="${isMesh ? .35 : 1}"/>
    <rect x=".7" y=".7" width="${Math.max(0, w - 1.4)}" height="${Math.max(0, h - 1.4)}" fill="none" stroke="black" stroke-opacity=".12" stroke-width=".065"/>
    <rect x=".12" y=".12" width="${Math.max(0, w - .24)}" height=".58" fill="url(#hem)"/>
    <rect x=".12" y="${h - .7}" width="${Math.max(0, w - .24)}" height=".58" fill="url(#hem)"/>${pockets}`, sw, sh, `0 0 ${w} ${h}`);
  const maskUrl = createBannerSurfaceMask(geometry);
  const maskSvg = decodeURIComponent(maskUrl.slice('url("data:image/svg+xml,'.length, -2));
  const mask = await sharp(Buffer.from(maskSvg)).resize(sw, sh).png().toBuffer();
  const surface = await sharp(print).composite([
    { input: fabric, blend: 'multiply' }, { input: shading }, { input: mask, blend: 'dest-in' },
  ]).png().toBuffer();

  const anchors = grommets.map(point => {
    const end = attachment(point, geometry);
    return `<path d="M${point.x + .13} ${point.y + .28} L${end.x + .13} ${end.y + .28}" stroke="#211c18" stroke-opacity=".24" stroke-width=".25"/>
      <circle cx="${end.x}" cy="${end.y}" r=".33" fill="url(#anchor)"/><circle cx="${end.x}" cy="${end.y}" r=".10" fill="#3f4244"/>
      <path d="M${point.x} ${point.y} L${end.x} ${end.y}" stroke="#252b2d" stroke-width=".18" stroke-linecap="round"/>
      <path d="M${point.x - .03} ${point.y - .03} L${end.x - .03} ${end.y - .03}" stroke="#7a7e7f" stroke-width=".035" stroke-linecap="round"/>`;
  }).join('');
  const ropes = ropeEdges.map(edge => {
    const ry = edge === 'bottom' ? h - .3 : .3;
    const d = `M-2.5 ${ry + 2} Q-2.5 ${ry} 0 ${ry} L${w} ${ry} Q${w + 2.5} ${ry} ${w + 2.5} ${ry + 2}`;
    return `<path d="${d}" fill="none" stroke="#55483b" stroke-width=".25"/><path d="${d}" fill="none" stroke="#f0e7cf" stroke-width=".16" stroke-dasharray=".07 .025"/>`;
  }).join('');
  const rings = grommets.map(point => {
    const end = attachment(point, geometry);
    const dx = end.x - point.x, dy = end.y - point.y, distance = Math.hypot(dx, dy) || 1;
    return `<circle cx="${point.x}" cy="${point.y}" r="${radius * .78}" fill="none" stroke="#383830" stroke-width="${radius * .6}" stroke-opacity=".45"/>
      <circle cx="${point.x}" cy="${point.y}" r="${radius * .76}" fill="none" stroke="url(#metal)" stroke-width="${radius * .46}"/>
      <circle cx="${point.x}" cy="${point.y}" r="${radius * .52}" fill="none" stroke="#4c4941" stroke-width=".045"/>
      <path d="M${point.x} ${point.y} L${point.x + dx / distance * radius * 1.5} ${point.y + dy / distance * radius * 1.5}" stroke="#2d3232" stroke-width=".16" stroke-linecap="round"/>`;
  }).join('');
  const scene = svgBuffer(`<defs>
    <pattern id="wall" width="60" height="40" x="${sceneWidth / 2 - 30}" y="${sceneHeight / 2 - 20}" patternUnits="userSpaceOnUse"><image width="60" height="40" preserveAspectRatio="none" xlink:href="${pngUrl(wall)}"/></pattern>
    <linearGradient id="ambient" x1="0" y1="0" x2="1" y2=".6"><stop stop-color="white" stop-opacity=".03"/><stop offset=".55" stop-opacity="0"/><stop offset="1" stop-color="#21190e" stop-opacity=".1"/></linearGradient>
    <radialGradient id="anchor" cx="32%" cy="25%"><stop stop-color="#fafafa"/><stop offset=".5" stop-color="#a6abb0"/><stop offset=".8" stop-color="#51565a"/><stop offset="1" stop-color="#d8dadd"/></radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#e7e4d9"/><stop offset=".25" stop-color="#aca28b"/><stop offset=".46" stop-color="#faf6e9"/><stop offset=".62" stop-color="#77746b"/><stop offset=".85" stop-color="#d2c6a8"/><stop offset="1" stop-color="#f0e8d3"/></linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${(grommets.length ? 4 : 2) / scale}"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#wall)"/><rect width="100%" height="100%" fill="url(#ambient)"/>
    <rect x="${x + (grommets.length ? 5 : 1) / scale}" y="${y + (grommets.length ? 8 : 2) / scale}" width="${w}" height="${h}" fill="#241b13" opacity="${grommets.length ? .35 : .25}" filter="url(#shadow)"/>
    <g transform="translate(${x} ${y})">${anchors}${ropes}</g>
    <image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" xlink:href="${pngUrl(surface)}"/>
    <g transform="translate(${x} ${y})">${rings}</g>`, outW, outH, `0 0 ${sceneWidth} ${sceneHeight}`);
  return sharp(scene).png().toBuffer();
}

async function unavailablePreview() {
  return sharp(svgBuffer('<rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="48%" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#475569">Realistic preview unavailable</text><text x="50%" y="62%" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#64748b">See the print layout or view your order.</text>', 600, 240)).png().toBuffer();
}

module.exports = { renderRealisticPreview, unavailablePreview };
