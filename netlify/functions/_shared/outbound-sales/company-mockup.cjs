'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const repository = require('./company-mockup-repository.cjs');
const { fetchWebsitePage, fetchWebsiteAsset } = require('./ssrf.cjs');
const { extractBrandAssets } = require('./research.cjs');

const RENDER_VERSION = 'company-banner-v2';
const MOCKUP_CONTENT_ID = 'company-banner-mockup';
const MOCKUP_STORE_NAME = 'outbound-company-mockups';
const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 675;
const SCENES = Object.freeze({
  trade_show: Object.freeze({
    file: 'public/images/email/mockup-scenes/trade-show.webp',
    frame: Object.freeze({ left: 218, top: 254, width: 759, height: 258 }),
  }),
  storefront: Object.freeze({
    file: 'public/images/email/mockup-scenes/storefront.webp',
    frame: Object.freeze({ left: 324, top: 268, width: 619, height: 184 }),
  }),
  community_event: Object.freeze({
    file: 'public/images/email/mockup-scenes/community-event.webp',
    frame: Object.freeze({ left: 201, top: 237, width: 806, height: 245 }),
  }),
});

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function escapeXml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function cleanLabel(value, maxLength = 76) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function combinedEvidence(candidate) {
  return [
    ...(candidate?.prospect?.qualificationEvidence || []),
    ...(candidate?.research?.evidence || []),
    ...(candidate?.research?.bannerNeedSignals || []),
  ];
}

function selectSceneId(candidate) {
  const evidence = JSON.stringify(combinedEvidence(candidate));
  if (/trade[ _-]?show|conference|expo|exhibit|exhibitor|booth/i.test(evidence)) return 'trade_show';
  if (/school|church|ministry|nonprofit|community|sports|athletic|tournament|festival|fundraiser|gala|charity/i.test(evidence)) return 'community_event';
  return 'storefront';
}

function eventLabel(candidate) {
  const body = String(candidate?.message?.bodyText || '');
  let messageContainedUngroundedEvent = false;
  const patterns = [
    /(?:exhibiting|showing|appearing|attending)\s+at\s+(?:the\s+)?(.{3,74}?)(?=\s+(?:on|from)\s+|[.\n])/i,
    /(?:for|at)\s+(?:the\s+)?([A-Z][^\n.]{2,72}?(?:Show|Market|Expo|Conference|Convention|Festival|Tournament|Gala))(?=[,.\n]|\s+(?:on|from)\s+)/,
  ];
  for (const pattern of patterns) {
    const value = cleanLabel(pattern.exec(body)?.[1]);
    if (value && eventIsGrounded(value, candidate)) return value;
    if (value) messageContainedUngroundedEvent = true;
  }
  if (messageContainedUngroundedEvent) return null;
  for (const item of combinedEvidence(candidate)) {
    const text = cleanLabel(item?.label || item?.detail || item?.evidence, 120);
    const match = /(?:the\s+)?([A-Z][A-Za-z0-9&'’ -]{2,64}(?:Show|Market|Expo|Conference|Convention|Festival|Tournament|Gala))/i.exec(text);
    if (match?.[1]) return cleanLabel(match[1]);
  }
  return null;
}

function normalizedEvidenceText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function eventIsGrounded(value, candidate) {
  const label = normalizedEvidenceText(value);
  if (!label || label.length < 4) return false;
  const evidence = normalizedEvidenceText(JSON.stringify(combinedEvidence(candidate)));
  return evidence.includes(label);
}

function storedAssetCandidates(candidate) {
  const assets = candidate?.research?.extractedFacts?.brandAssets || {};
  return {
    logos: Array.isArray(assets.logoCandidates) ? assets.logoCandidates : [],
    images: Array.isArray(assets.imageCandidates) ? assets.imageCandidates : [],
  };
}

async function discoverAssetCandidates(candidate, dependencies = {}) {
  const stored = storedAssetCandidates(candidate);
  if (stored.logos.length || stored.images.length || !candidate?.prospect?.websiteUrl) return stored;
  try {
    const page = await (dependencies.fetchPage || fetchWebsitePage)(candidate.prospect.websiteUrl, {
      maxBytes: 1024 * 1024,
      timeoutMs: 8000,
    });
    const extracted = extractBrandAssets(page.body, page.finalUrl);
    return { logos: extracted.logoCandidates, images: extracted.imageCandidates };
  } catch {
    return stored;
  }
}

function safeSvg(buffer) {
  const source = buffer.toString('utf8');
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source)
      || /<!DOCTYPE|<!ENTITY|@import|<(?:script|foreignObject|iframe|object|embed|image)\b|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|file:|\/\/)|url\s*\(\s*["']?\s*(?:https?:|file:|\/\/)/i.test(source)) {
    const error = new Error('Unsafe SVG brand asset.');
    error.code = 'MOCKUP_ASSET_INVALID';
    throw error;
  }
  return buffer;
}

async function validatedAsset(response, sharpImpl, kind) {
  const source = response.contentType === 'image/svg+xml' ? safeSvg(response.body) : response.body;
  const metadata = await sharpImpl(source, { failOn: 'error', limitInputPixels: 24_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 24_000_000) {
    const error = new Error('Brand asset dimensions are invalid.');
    error.code = 'MOCKUP_ASSET_INVALID';
    throw error;
  }
  const aspect = Math.max(metadata.width / metadata.height, metadata.height / metadata.width);
  if ((kind === 'logo' && (metadata.width < 80 || metadata.height < 24 || aspect > 12))
      || (kind === 'product' && (Math.min(metadata.width, metadata.height) < 240
        || metadata.width * metadata.height < 240_000 || aspect > 4.5))) {
    const error = new Error('Brand asset resolution or proportions are unsuitable for an outbound mockup.');
    error.code = 'MOCKUP_ASSET_LOW_QUALITY';
    throw error;
  }
  if (kind === 'product') {
    const stats = await sharpImpl(source, { failOn: 'error', limitInputPixels: 24_000_000 })
      .rotate().resize(180, 180, { fit: 'inside' }).greyscale().stats();
    if (Number(stats.entropy) < 1.35 || Number(stats.sharpness) < 0.25) {
      const error = new Error('Brand image is too flat or blurry for a presentation-ready mockup.');
      error.code = 'MOCKUP_ASSET_LOW_QUALITY';
      throw error;
    }
  }
  return { buffer: source, contentType: response.contentType, width: metadata.width, height: metadata.height, finalUrl: response.finalUrl };
}

async function fetchFirstValid(candidates, dependencies, sharpImpl, kind) {
  for (const candidate of candidates.slice(0, 4)) {
    try {
      if (/\b(?:placeholder|spacer|blank|no[-_ ]?image|loading|pixel|default[-_ ]?(?:image|photo))\b/i.test(`${candidate.url} ${candidate.alt || ''}`)) continue;
      const response = await (dependencies.fetchAsset || fetchWebsiteAsset)(candidate.url, { maxBytes: 6 * 1024 * 1024, timeoutMs: 8000 });
      return { ...(await validatedAsset(response, sharpImpl, kind)), candidate };
    } catch {
      // Try the next ranked exact public asset. Missing assets never block the fallback.
    }
  }
  return null;
}

function planFor(candidate, assets = {}) {
  const sceneId = selectSceneId(candidate);
  const event = eventLabel(candidate);
  const logoUrl = assets.logo?.finalUrl || assets.logo?.candidate?.url || null;
  const productImageUrl = assets.product?.finalUrl || assets.product?.candidate?.url || null;
  const sourceUrls = [...new Set([
    logoUrl, productImageUrl,
    ...(candidate?.research?.sourceUrls || []),
  ].filter(Boolean))].slice(0, 20);
  const contentHash = sha256(JSON.stringify({
    version: RENDER_VERSION,
    prospectId: candidate.prospect.id,
    businessName: candidate.prospect.businessName,
    industry: candidate.prospect.industry,
    businessType: candidate.prospect.businessType,
    researchHash: candidate.research?.contentHash || null,
    messageId: candidate.message?.id || null,
    sceneId,
    event,
    logoUrl,
    productImageUrl,
  }));
  return { sceneId, eventLabel: event, logoUrl, productImageUrl, sourceUrls, contentHash };
}

function qualityLevel(logo, product) {
  if (logo && product) return 'logo_and_product';
  if (logo) return 'logo';
  if (product) return 'product';
  return 'name_only';
}

function hexColor({ r = 24, g = 68, b = 141 } = {}) {
  const bounded = (value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  return `#${[bounded(r), bounded(g), bounded(b)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

async function dominantColor(asset, sharpImpl) {
  if (!asset) return '#18448d';
  try {
    const stats = await sharpImpl(asset.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .resize(80, 80, { fit: 'inside' }).flatten({ background: '#ffffff' }).stats();
    const dominant = stats.dominant || { r: 24, g: 68, b: 141 };
    const luminance = (0.2126 * dominant.r) + (0.7152 * dominant.g) + (0.0722 * dominant.b);
    if (luminance > 205 || luminance < 28) return '#18448d';
    return hexColor(dominant);
  } catch {
    return '#18448d';
  }
}

function wrapName(name, maxLineLength = 24) {
  const value = cleanLabel(name, 72) || 'YOUR BUSINESS';
  if (value.length <= maxLineLength) return [value];
  const words = value.split(' ');
  const lines = [''];
  for (const word of words) {
    const current = lines.at(-1);
    if (current && `${current} ${word}`.length > maxLineLength && lines.length < 2) lines.push(word);
    else lines[lines.length - 1] = current ? `${current} ${word}` : word;
  }
  return lines.slice(0, 2);
}

async function renderArtwork(candidate, assets, sharpImpl) {
  const width = 1000;
  const height = 320;
  const productWidth = assets.product ? 450 : 0;
  const brandColor = await dominantColor(assets.logo || assets.product, sharpImpl);
  const layers = [{
    input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#0b2344"/>
          <stop offset="0.46" stop-color="${brandColor}"/>
          <stop offset="0.74" stop-color="#ff6b35" stop-opacity=".92"/>
          <stop offset="1" stop-color="#ff6b35" stop-opacity="${assets.product ? '0.24' : '0.78'}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#brand)"/>
      <rect width="100%" height="8" fill="#ff6b35"/>
    </svg>`),
    left: 0,
    top: 0,
  }];

  if (assets.product) {
    const productBackground = await sharpImpl(assets.product.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .rotate().resize(productWidth, height, { fit: 'cover', position: 'attention' }).blur(14).modulate({ brightness: 0.72, saturation: 0.85 }).jpeg({ quality: 82 }).toBuffer();
    const productForeground = await sharpImpl(assets.product.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .rotate().resize(productWidth - 32, height - 28, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    layers.push({ input: productBackground, left: width - productWidth, top: 0 });
    layers.push({ input: productForeground, left: width - productWidth + 16, top: 14 });
    layers.push({
      input: Buffer.from(`<svg width="300" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="imageFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff6b35" stop-opacity=".86"/><stop offset=".42" stop-color="#0b2344" stop-opacity=".44"/><stop offset="1" stop-color="#0b2344" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#imageFade)"/></svg>`),
      left: width - productWidth - 50,
      top: 0,
    });
  }

  if (assets.logo) {
    const logo = await sharpImpl(assets.logo.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .resize(360, 112, { fit: 'inside', withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true });
    const cardWidth = Math.max(190, logo.info.width + 42);
    const cardHeight = Math.max(82, logo.info.height + 30);
    layers.push({
      input: Buffer.from(`<svg width="${cardWidth}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="${cardWidth - 2}" height="${cardHeight - 2}" rx="16" fill="#fff" fill-opacity=".96" stroke="#fff" stroke-opacity=".75"/></svg>`),
      left: 54,
      top: 40,
    });
    layers.push({ input: logo.data, left: 54 + Math.floor((cardWidth - logo.info.width) / 2), top: 40 + Math.floor((cardHeight - logo.info.height) / 2) });
  }

  const textWidth = assets.product ? 490 : 880;
  const lines = wrapName(candidate.prospect.businessName, assets.logo ? 27 : assets.product ? 17 : 20);
  const longestLine = Math.max(...lines.map((line) => line.length));
  const nameFont = assets.logo
    ? (longestLine > 22 ? 25 : lines.length === 1 ? 31 : 28)
    : (longestLine > 17 ? 42 : longestLine > 12 ? 48 : 56);
  const startY = assets.logo ? 218 : (lines.length === 1 ? 166 : 128);
  const subtitle = cleanLabel(
    eventLabel(candidate) || candidate.prospect.industry || candidate.prospect.businessType || 'CUSTOM BANNER CONCEPT',
    assets.product ? 34 : 58,
  ).toUpperCase();
  const nameSvg = `<svg width="${textWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>.name{font-family:Arial,Helvetica,sans-serif;font-weight:900;fill:#fff;letter-spacing:-1px}.sub{font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;fill:#ffcab2;letter-spacing:2px}</style>
    ${lines.map((line, index) => `<text class="name" x="0" y="${startY + (index * (nameFont + 6))}" font-size="${nameFont}">${escapeXml(line)}</text>`).join('')}
    <text class="sub" x="0" y="${Math.min(298, startY + (lines.length * (nameFont + 6)) + 22)}">${escapeXml(subtitle)}</text>
  </svg>`;
  layers.push({ input: Buffer.from(nameSvg), left: 56, top: 0 });

  layers.push({
    input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#shine)"/></svg>`),
    left: 0,
    top: 0,
  });

  return sharpImpl({ create: { width, height, channels: 3, background: '#0b2344' } })
    .composite(layers).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}

async function loadScene(sceneId, dependencies = {}) {
  if (dependencies.sceneBuffers?.[sceneId]) return dependencies.sceneBuffers[sceneId];
  const scene = SCENES[sceneId] || SCENES.storefront;
  return fs.readFile(path.resolve(process.cwd(), scene.file));
}

async function renderCompanyMockup(candidate, assets, dependencies = {}) {
  const sharpImpl = dependencies.sharp;
  if (typeof sharpImpl !== 'function') throw new TypeError('Sharp is required to render company mockups.');
  const plan = planFor(candidate, assets);
  const scene = SCENES[plan.sceneId] || SCENES.storefront;
  const [sceneBuffer, artwork] = await Promise.all([
    loadScene(plan.sceneId, dependencies),
    renderArtwork(candidate, assets, sharpImpl),
  ]);
  const fittedArtwork = await sharpImpl(artwork)
    .resize(scene.frame.width, scene.frame.height, { fit: 'fill', kernel: sharpImpl.kernel.lanczos3 })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
  const buffer = await sharpImpl(sceneBuffer, { failOn: 'none', limitInputPixels: 24_000_000 })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'fill' })
    .composite([{ input: fittedArtwork, left: scene.frame.left, top: scene.frame.top }])
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
  return { buffer, plan, mimeType: 'image/jpeg', width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT };
}

async function blobBuffer(store, key) {
  if (!store || !key) return null;
  try {
    const value = await store.get(key, { type: 'arrayBuffer' });
    return value ? Buffer.from(value) : null;
  } catch {
    return null;
  }
}

async function prepareCompanyMockup(options) {
  const dependencies = {
    ...repository,
    fetchPage: fetchWebsitePage,
    fetchAsset: fetchWebsiteAsset,
    ...options.dependencies,
  };
  const candidate = options.candidate || await dependencies.loadCompanyMockupCandidate(options.sql, options.prospectId);
  if (!candidate?.prospect?.id) {
    const error = new Error('Company mockup prospect was not found.');
    error.code = 'COMPANY_MOCKUP_NOT_FOUND';
    throw error;
  }
  const candidateAssets = await discoverAssetCandidates(candidate, dependencies);
  const [logo, product] = await Promise.all([
    fetchFirstValid(candidateAssets.logos, dependencies, options.sharp, 'logo'),
    fetchFirstValid(candidateAssets.images.filter((asset) => !candidateAssets.logos.some((logoAsset) => logoAsset.url === asset.url)), dependencies, options.sharp, 'product'),
  ]);
  const assets = { logo, product };
  const plan = planFor(candidate, assets);
  if (!options.force && candidate.mockup?.contentHash === plan.contentHash && candidate.mockup.blobKey) {
    const cached = await blobBuffer(options.store, candidate.mockup.blobKey);
    if (cached) return { prospectId: candidate.prospect.id, buffer: cached, plan, qualityLevel: candidate.mockup.qualityLevel, cached: true, row: candidate.mockup };
  }

  const rendered = await renderCompanyMockup(candidate, assets, { ...dependencies, sharp: options.sharp });
  const level = qualityLevel(logo, product);
  const blobKey = `company-banners/${candidate.prospect.id}/${plan.contentHash}.jpg`;
  let storedKey = null;
  if (options.store) {
    try {
      await options.store.set(blobKey, rendered.buffer, {
        metadata: {
          contentType: 'image/jpeg',
          prospectId: candidate.prospect.id,
          renderVersion: RENDER_VERSION,
          qualityLevel: level,
        },
      });
      storedKey = blobKey;
    } catch {
      // The in-memory image still goes into the email. Blob storage only powers cache and admin preview.
    }
  }
  const row = await dependencies.saveCompanyMockup(options.sql, {
    prospectId: candidate.prospect.id,
    messageId: candidate.message?.id,
    status: level === 'name_only' ? 'fallback' : 'ready',
    sceneId: plan.sceneId,
    renderVersion: RENDER_VERSION,
    contentHash: plan.contentHash,
    blobKey: storedKey,
    logoUrl: plan.logoUrl,
    productImageUrl: plan.productImageUrl,
    eventLabel: plan.eventLabel,
    qualityLevel: level,
    sourceUrls: plan.sourceUrls,
    generationMetadata: {
      exactPublicAssets: Boolean(logo || product),
      logoIncluded: Boolean(logo),
      productImageIncluded: Boolean(product),
      cidReady: true,
    },
  });
  return { prospectId: candidate.prospect.id, ...rendered, qualityLevel: level, cached: false, row };
}

function attachmentFromMockup(mockup, businessName) {
  if (!mockup?.buffer) return null;
  const filename = `${cleanLabel(businessName, 50).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company'}-banner-concept.jpg`;
  return {
    content: mockup.buffer.toString('base64'),
    filename,
    contentId: MOCKUP_CONTENT_ID,
    contentType: 'image/jpeg',
  };
}

module.exports = {
  RENDER_VERSION,
  MOCKUP_CONTENT_ID,
  MOCKUP_STORE_NAME,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  SCENES,
  sha256,
  cleanLabel,
  selectSceneId,
  eventLabel,
  eventIsGrounded,
  storedAssetCandidates,
  discoverAssetCandidates,
  safeSvg,
  planFor,
  qualityLevel,
  renderArtwork,
  renderCompanyMockup,
  prepareCompanyMockup,
  attachmentFromMockup,
};
