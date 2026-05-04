/**
 * Email banner thumbnail with grommets overlay.
 *
 * Returns a PNG image where the user's banner artwork is fitted to the banner's
 * actual aspect ratio and grommet hardware is rendered on top at the correct
 * positions. Used by order emails (customer + admin) so recipients can preview
 * how grommets are placed on their banner.
 *
 * Query parameters:
 *   url  - Source artwork URL (must be HTTPS)
 *   w    - Banner width in inches
 *   h    - Banner height in inches
 *   g    - Grommets option (e.g. "every-2-3ft", "4-corners", ...)
 *
 * Output is a cacheable PNG. If anything goes wrong we redirect to the original
 * url so the email still shows a thumbnail.
 */

const sharp = require('sharp');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const MAX_OUTPUT_SIDE = 600;

function toGrommetOverlayOption(value) {
  const v = String(value || '').toLowerCase().trim();
  if (!v || v === 'none' || v === 'false') return 'none';
  if (v === '4-corners' || v === 'four-corners') return '4-corners';
  if (v === 'top-corners') return 'top-corners';
  if (v === 'bottom-corners') return 'bottom-corners';
  if (v === 'left-corners' || v === 'left-side') return 'left-corners';
  if (v === 'right-corners' || v === 'right-side') return 'right-corners';
  if (v === 'every-1-2ft' || v === 'every-1-2-feet' || v === 'every-1-foot') return 'every-1-foot';
  return 'every-2-feet';
}

function dedupePoints(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    const k = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function midpoints(length, inset, spacing) {
  const usable = Math.max(0, length - 2 * inset);
  if (spacing <= 0) return [];
  const n = Math.floor(usable / spacing);
  if (n <= 0) return [];
  const step = usable / (n + 1);
  return Array.from({ length: n }, (_, k) => inset + (k + 1) * step);
}

function getGrommetPositions(widthIn, heightIn, option) {
  if (option === 'none') return [];
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn)) return [];
  if (widthIn <= 0 || heightIn <= 0) return [];

  const m = Math.min(1, widthIn / 2, heightIn / 2);
  const tl = { x: m, y: m };
  const tr = { x: widthIn - m, y: m };
  const bl = { x: m, y: heightIn - m };
  const br = { x: widthIn - m, y: heightIn - m };
  const corners = [tl, tr, bl, br];

  if (option === '4-corners') return dedupePoints(corners);
  if (option === 'top-corners') return dedupePoints([tl, tr]);
  if (option === 'bottom-corners') return dedupePoints([bl, br]);
  if (option === 'left-corners') return dedupePoints([tl, bl]);
  if (option === 'right-corners') return dedupePoints([tr, br]);

  const spacing = option === 'every-1-foot' ? 18 : 24;
  const points = [...corners];
  for (const x of midpoints(widthIn, m, spacing)) {
    points.push({ x, y: m });
    points.push({ x, y: heightIn - m });
  }
  for (const y of midpoints(heightIn, m, spacing)) {
    points.push({ x: m, y });
    points.push({ x: widthIn - m, y });
  }
  return dedupePoints(points);
}

function computeOutputDimensions(widthIn, heightIn) {
  const aspect = widthIn / heightIn;
  let outW;
  let outH;
  if (aspect >= 1) {
    outW = MAX_OUTPUT_SIDE;
    outH = Math.round(MAX_OUTPUT_SIDE / aspect);
    if (outH > MAX_OUTPUT_SIDE) {
      outH = MAX_OUTPUT_SIDE;
      outW = Math.round(MAX_OUTPUT_SIDE * aspect);
    }
  } else {
    outH = MAX_OUTPUT_SIDE;
    outW = Math.round(MAX_OUTPUT_SIDE * aspect);
    if (outW > MAX_OUTPUT_SIDE) {
      outW = MAX_OUTPUT_SIDE;
      outH = Math.round(MAX_OUTPUT_SIDE / aspect);
    }
  }
  return { outW: Math.max(1, outW), outH: Math.max(1, outH) };
}

function buildGrommetSvg(positions, outW, outH, widthIn) {
  if (positions.length === 0) return null;
  const pxPerIn = outW / widthIn;
  // Match the on-screen preview's grommet sizing: ~1.8% of the smaller side.
  const r = Math.max(3, Math.min(outW, outH) * 0.018);
  const stroke1 = Math.max(0.5, r * 0.12);
  const stroke2 = Math.max(0.3, r * 0.06);

  let circles = '';
  for (const p of positions) {
    const cx = p.x * pxPerIn;
    const cy = p.y * pxPerIn;
    circles += [
      // Drop shadow
      `<circle cx="${(cx + 1).toFixed(2)}" cy="${(cy + 1).toFixed(2)}" r="${(r * 1.3).toFixed(2)}" fill="#000000" opacity="0.25"/>`,
      // Outer metallic ring
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r * 1.3).toFixed(2)}" fill="url(#grommetGradient)" stroke="#2d3748" stroke-width="${stroke1.toFixed(2)}"/>`,
      // Inner hole
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r * 0.7).toFixed(2)}" fill="#f7fafc" stroke="#cbd5e0" stroke-width="${stroke2.toFixed(2)}"/>`,
      // Subtle highlight
      `<circle cx="${(cx - r * 0.4).toFixed(2)}" cy="${(cy - r * 0.4).toFixed(2)}" r="${(r * 0.3).toFixed(2)}" fill="#ffffff" opacity="0.4"/>`,
    ].join('');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">
  <defs>
    <radialGradient id="grommetGradient" cx="30%" cy="30%">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="50%" stop-color="#a0aec0"/>
      <stop offset="100%" stop-color="#4a5568"/>
    </radialGradient>
  </defs>
  ${circles}
</svg>`;
}

function isAllowedSourceUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    // Only allow Cloudinary-hosted images (covers both /upload/ and /image/fetch/).
    return parsed.hostname === 'res.cloudinary.com';
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  const params = event.queryStringParameters || {};
  const sourceUrl = params.url;
  const widthIn = Number(params.w);
  const heightIn = Number(params.h);
  const grommetsOption = toGrommetOverlayOption(params.g);

  if (!sourceUrl || !isAllowedSourceUrl(sourceUrl)) {
    return { statusCode: 400, headers, body: 'Invalid or missing url' };
  }
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    return { statusCode: 400, headers, body: 'Invalid dimensions' };
  }

  try {
    const { outW, outH } = computeOutputDimensions(widthIn, heightIn);

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      console.warn('[email-banner-thumbnail] source fetch failed', response.status, sourceUrl);
      return {
        statusCode: 302,
        headers: { ...headers, Location: sourceUrl },
        body: '',
      };
    }
    const sourceBuffer = Buffer.from(await response.arrayBuffer());

    const baseImage = await sharp(sourceBuffer)
      .resize(outW, outH, { fit: 'cover', position: 'centre' })
      .toFormat('png')
      .toBuffer();

    const positions = getGrommetPositions(widthIn, heightIn, grommetsOption);
    const overlaySvg = buildGrommetSvg(positions, outW, outH, widthIn);

    let pipeline = sharp(baseImage);
    if (overlaySvg) {
      pipeline = pipeline.composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }]);
    }
    const out = await pipeline.png().toBuffer();

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: out.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('[email-banner-thumbnail] error:', error && error.message ? error.message : error);
    // Fall back to the source image so the email still has a thumbnail.
    return {
      statusCode: 302,
      headers: { ...headers, Location: sourceUrl },
      body: '',
    };
  }
};
