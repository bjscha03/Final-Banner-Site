'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const fontkit = require('fontkit');
const repository = require('./company-mockup-repository.cjs');
const { fetchWebsitePage, fetchWebsiteAsset } = require('./ssrf.cjs');
const {
  extractBrandAssets, extractBrandProfile, extractLinks, priorityLinks, publicAssetUrl, pageAssetRole,
} = require('./research.cjs');
const { canonicalDomain } = require('./providers/contract.cjs');

const RENDER_VERSION = repository.COMPANY_MOCKUP_RENDER_VERSION;
const MOCKUP_CONTENT_ID = 'company-banner-mockup';
const MOCKUP_STORE_NAME = 'outbound-company-mockups';
const MOCKUP_FONT_FILE = 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf';
const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 675;
const PRODUCT_PANEL_WIDTH = 445;
const PRODUCT_PANEL_HEIGHT = 244;
const PRODUCT_SAFE_PADDING = 14;
const MIN_WHITE_TEXT_CONTRAST = repository.MIN_MOCKUP_WHITE_TEXT_CONTRAST;
const PRODUCT_RELEVANCE_PATTERN = /\b(?:product|service|collection|project|portfolio|case[ _-]?stud(?:y|ies)|featured|showcase|gallery|work|solution|installation|repair|construction|landscap|roof|plumb|footwear|shoe|boot|sneaker|sandal|loafer|bag|apparel|clothing|menu|dish|food|property|real[ _-]?estate|vehicle|equipment|furniture|jewelry|cosmetic|packag|merchandise)\w*\b/i;
const PRODUCT_IRRELEVANCE_PATTERN = /\b(?:team|staff|employee|founder|headshot|portrait|avatar|office|headquarters|about[ _-]?us|blog|news|press|testimonial|author|podcast)\b/i;
const PRECOMPOSED_ART_PATTERN = /\b(?:campaign|hero|masthead|cover|lookbook|editorial|advert|promo|social|banner|wordmark|brand[ _-]?lockup|typograph|text[ _-]?overlay|announcement|sale[ _-]?graphic|desktop[ _-]?hero|mobile[ _-]?hero)\b/i;
const CLEAN_PRODUCT_PATTERN = /\b(?:product(?:[ _-]?(?:image|photo|media|card|gallery|tile))?|pdp|sku|item[ _-]?(?:image|photo)|collection[ _-]?(?:item|product)|woocommerce[ _-]?(?:product|gallery)|footwear|shoe|boot|sneaker|sandal|loafer|bag|apparel)\b/i;
const CLEAN_SERVICE_PATTERN = /\b(?:project|portfolio|case[ _-]?stud(?:y|ies)|installation|before[ _-]?and[ _-]?after|service[ _-]?(?:image|photo)|gallery[ _-]?(?:image|photo)|property|vehicle|equipment|menu[ _-]?item|dish)\b/i;
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
const MOCKUP_LAYOUTS = Object.freeze({
  balanced_split: Object.freeze({ productRatio: PRODUCT_PANEL_WIDTH / 1000, productSide: 'right' }),
  portrait_feature: Object.freeze({ productRatio: 0.38, productSide: 'left' }),
  cutout_spotlight: Object.freeze({ productRatio: 0.41, productSide: 'right' }),
  lifestyle_split: Object.freeze({ productRatio: 0.49, productSide: 'right' }),
});

function selectMockupLayoutId(asset) {
  if (!asset) return 'balanced_split';
  if (asset.hasAlpha === true) return 'cutout_spotlight';
  if (asset?.selectionAudit?.assetRole === 'service_photo') return 'lifestyle_split';
  const width = Math.max(1, Number(asset.width) || 1);
  const height = Math.max(1, Number(asset.height) || 1);
  const aspect = width / height;
  if (aspect <= 0.86) return 'portrait_feature';
  if (aspect >= 1.48) return 'lifestyle_split';
  return 'balanced_split';
}

function mockupLayoutGeometry(asset, artworkWidth = 1000, artworkHeight = PRODUCT_PANEL_HEIGHT) {
  const layoutId = selectMockupLayoutId(asset);
  const layout = MOCKUP_LAYOUTS[layoutId];
  const horizontalScale = artworkWidth / 1000;
  const outerMargin = Math.max(44, Math.round(54 * horizontalScale));
  const productWidth = asset ? Math.round(artworkWidth * layout.productRatio) : 0;
  const productLeft = layout.productSide === 'left' ? 0 : artworkWidth - productWidth;
  const gap = asset ? Math.max(18, Math.round(24 * horizontalScale)) : 0;
  const textLeft = layout.productSide === 'left' && asset
    ? productWidth + gap + Math.max(24, Math.round(24 * horizontalScale))
    : outerMargin;
  const textRight = layout.productSide === 'right' && asset
    ? productLeft - gap
    : artworkWidth - outerMargin;
  const textWidth = Math.max(1, textRight - textLeft);
  const noOverlapGuaranteed = !asset || (layout.productSide === 'left'
    ? textLeft >= productLeft + productWidth
    : textLeft + textWidth <= productLeft);
  return {
    layoutId,
    productSide: layout.productSide,
    artworkWidth,
    artworkHeight,
    productLeft,
    productWidth,
    textLeft,
    textWidth,
    gap,
    passed: textWidth >= 360 && noOverlapGuaranteed,
    noOverlapGuaranteed,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
}

function normalizedLabel(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanLabel(value, maxLength = 76) {
  return normalizedLabel(value).slice(0, maxLength);
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
  const profile = candidate?.research?.extractedFacts?.brandProfile || {};
  return {
    logos: Array.isArray(assets.logoCandidates) ? assets.logoCandidates : [],
    images: Array.isArray(assets.imageCandidates) ? assets.imageCandidates : [],
    profile: {
      themeColors: Array.isArray(profile.themeColors) ? profile.themeColors : [],
      taglineCandidates: Array.isArray(profile.taglineCandidates) ? profile.taglineCandidates : [],
      offeringCandidates: Array.isArray(profile.offeringCandidates) ? profile.offeringCandidates : [],
    },
    pageUrls: Array.isArray(candidate?.research?.sourceUrls) ? candidate.research.sourceUrls : [],
    diagnostics: [],
  };
}

function normalizedBrandIdentity(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parentheticalBrandAliases(businessName) {
  return [...String(businessName || '').matchAll(/\(([^()]{2,80})\)/g)]
    .map((match) => normalizedBrandIdentity(match[1]))
    .filter((alias) => alias.length >= 4);
}

function htmlAttribute(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function anchorMarker(innerHtml) {
  const imageAlts = [...String(innerHtml || '').matchAll(/<img\b[^>]*>/gi)]
    .map((match) => htmlAttribute(match[0], 'alt'));
  return normalizedBrandIdentity(`${String(innerHtml || '').replace(/<[^>]+>/g, ' ')} ${imageAlts.join(' ')}`);
}

function officialAliasLinks(html, baseUrl, businessName) {
  const aliases = parentheticalBrandAliases(businessName);
  if (!aliases.length) return [];
  const baseDomain = canonicalDomain(baseUrl);
  const links = [];
  for (const match of String(html || '').matchAll(/<a\b([^>]*)>([\s\S]{0,2400}?)<\/a\s*>/gi)) {
    const href = htmlAttribute(match[1], 'href');
    const marker = anchorMarker(match[2]);
    if (!href || !aliases.some((alias) => marker.includes(alias))) continue;
    const url = publicAssetUrl(href, baseUrl);
    if (!url) continue;
    const domain = canonicalDomain(url);
    if (!domain || domain === baseDomain || /(?:facebook|instagram|linkedin|youtube|tiktok|pinterest|amazon)\./i.test(domain)) continue;
    links.push(url);
  }
  return [...new Set(links)].slice(0, 2);
}

function mergeBrandProfile(target, profile = {}) {
  for (const key of ['themeColors', 'taglineCandidates', 'offeringCandidates']) {
    const values = Array.isArray(profile[key]) ? profile[key] : [];
    const seen = new Set(target[key].map((value) => String(value).toLowerCase()));
    for (const value of values) {
      if (!value || seen.has(String(value).toLowerCase())) continue;
      seen.add(String(value).toLowerCase());
      target[key].push(value);
    }
  }
  target.themeColors = target.themeColors.slice(0, 8);
  target.taglineCandidates = target.taglineCandidates.slice(0, 20);
  target.offeringCandidates = target.offeringCandidates.slice(0, 20);
}

function mergeAssetPage(result, page, scoreBoost = 0) {
  const extracted = extractBrandAssets(page.body, page.finalUrl);
  const merge = (key, values) => {
    const byUrl = new Map(result[key].map((asset) => [asset.url, asset]));
    for (const asset of values) {
      const boosted = {
        ...asset,
        sourceUrl: asset.sourceUrl || page.finalUrl,
        score: Number(asset.score || 0) + scoreBoost,
        selectionScore: Number(asset.selectionScore ?? asset.score ?? 0) + scoreBoost,
      };
      const existing = byUrl.get(boosted.url);
      const existingRank = key === 'images'
        ? Number(existing?.selectionScore ?? existing?.score ?? -Infinity)
        : Number(existing?.score ?? -Infinity);
      const boostedRank = key === 'images' ? boosted.selectionScore : boosted.score;
      if (!existing || existingRank < boostedRank) byUrl.set(boosted.url, boosted);
    }
    result[key] = [...byUrl.values()].sort((left, right) => (
      key === 'images'
        ? Number(right.selectionScore ?? right.score ?? 0) - Number(left.selectionScore ?? left.score ?? 0)
        : Number(right.score || 0) - Number(left.score || 0)
    ) || String(left.url).localeCompare(String(right.url))).slice(0, key === 'logos' ? 12 : 30);
  };
  merge('logos', extracted.logoCandidates || []);
  merge('images', extracted.imageCandidates || []);
  mergeBrandProfile(result.profile, extractBrandProfile(page.body));
  if (!result.pageUrls.includes(page.finalUrl)) result.pageUrls.push(page.finalUrl);
}

function safeDiagnostic(error, stage, url) {
  let hostname = null;
  try { hostname = new URL(url).hostname; } catch { hostname = null; }
  return {
    stage,
    hostname,
    code: String(error?.code || 'BRAND_ASSET_FETCH_FAILED').replace(/[^A-Z0-9_]/gi, '').slice(0, 80),
  };
}

function mockupDeadlineError() {
  const error = new Error('Company mockup preparation exceeded its safe deadline.');
  error.code = 'COMPANY_MOCKUP_BUILD_TIMEOUT';
  return error;
}

function assertMockupNotAborted(dependencies = {}) {
  if (dependencies.signal?.aborted) throw mockupDeadlineError();
}

async function discoverAssetCandidates(candidate, dependencies = {}) {
  assertMockupNotAborted(dependencies);
  const result = storedAssetCandidates(candidate);
  const websiteUrl = candidate?.prospect?.websiteUrl;
  if (!websiteUrl) return result;
  const hasCurrentProductEvidence = result.images.some((asset) => productCandidateAudit(asset).passed);
  if (result.logos.length && result.images.length && result.profile.taglineCandidates.length
      && hasCurrentProductEvidence) return result;
  let home;
  try {
    home = await (dependencies.fetchPage || fetchWebsitePage)(websiteUrl, {
      maxBytes: 1024 * 1024,
      timeoutMs: 9000,
      signal: dependencies.signal,
    });
    assertMockupNotAborted(dependencies);
    mergeAssetPage(result, home, 20);
  } catch (error) {
    assertMockupNotAborted(dependencies);
    result.diagnostics.push(safeDiagnostic(error, 'homepage', websiteUrl));
    return result;
  }

  const aliasPages = officialAliasLinks(home.body, home.finalUrl, candidate.prospect.businessName).slice(0, 1);
  const internalPages = priorityLinks(extractLinks(home.body, home.finalUrl))
    .filter((url) => url !== home.finalUrl)
    .slice(0, aliasPages.length ? 0 : 3);
  const pages = [
    ...aliasPages.map((url) => ({ url, boost: 80, stage: 'official_alias' })),
    ...internalPages.map((url) => ({ url, boost: 24, stage: 'brand_detail' })),
  ].slice(0, 3);
  const fetchedPages = await Promise.all(pages.map(async (page) => {
    try {
      const response = await (dependencies.fetchPage || fetchWebsitePage)(page.url, {
        maxBytes: 1024 * 1024,
        timeoutMs: 8000,
        signal: dependencies.signal,
      });
      return { ...page, response };
    } catch (error) {
      assertMockupNotAborted(dependencies);
      result.diagnostics.push(safeDiagnostic(error, page.stage, page.url));
      return null;
    }
  }));
  assertMockupNotAborted(dependencies);
  for (const page of fetchedPages.filter(Boolean)) mergeAssetPage(result, page.response, page.boost);

  // Parent-company sites often link to a sub-brand homepage (for example,
  // Evolutions Brands -> BED|STU). Follow that verified page once more to its
  // strongest product/collection page so a clean product photo outranks the
  // sub-brand's precomposed homepage campaign art.
  const aliasPage = fetchedPages.find((page) => page?.stage === 'official_alias');
  if (aliasPage) {
    const detailUrl = priorityLinks(extractLinks(aliasPage.response.body, aliasPage.response.finalUrl))
      .find((url) => url !== aliasPage.response.finalUrl);
    if (detailUrl) {
      try {
        const detail = await (dependencies.fetchPage || fetchWebsitePage)(detailUrl, {
          maxBytes: 1024 * 1024,
          timeoutMs: 7000,
          signal: dependencies.signal,
        });
        assertMockupNotAborted(dependencies);
        mergeAssetPage(result, detail, 96);
      } catch (error) {
        assertMockupNotAborted(dependencies);
        result.diagnostics.push(safeDiagnostic(error, 'official_alias_product', detailUrl));
      }
    }
  }
  return result;
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
  const isVector = response.contentType === 'image/svg+xml';
  const metadata = await sharpImpl(source, { failOn: 'error', limitInputPixels: 24_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 24_000_000) {
    const error = new Error('Brand asset dimensions are invalid.');
    error.code = 'MOCKUP_ASSET_INVALID';
    throw error;
  }
  const rotated = Number(metadata.orientation) >= 5 && Number(metadata.orientation) <= 8;
  const displayWidth = rotated ? metadata.height : metadata.width;
  const displayHeight = rotated ? metadata.width : metadata.height;
  const aspect = Math.max(displayWidth / displayHeight, displayHeight / displayWidth);
  if ((kind === 'logo' && ((!isVector && (displayWidth < 140 || displayHeight < 40
        || displayWidth * displayHeight < 8_000)) || displayWidth < 80 || displayHeight < 24 || aspect > 12))
      || (kind === 'product' && (Math.min(displayWidth, displayHeight) < 280
        || displayWidth * displayHeight < 300_000 || aspect > 4.5))) {
    const error = new Error('Brand asset resolution or proportions are unsuitable for an outbound mockup.');
    error.code = 'MOCKUP_ASSET_LOW_QUALITY';
    throw error;
  }
  let entropy = null;
  let sharpness = null;
  if (kind === 'product') {
    const stats = await sharpImpl(source, { failOn: 'error', limitInputPixels: 24_000_000 })
      .rotate().resize(180, 180, { fit: 'inside' }).greyscale().stats();
    entropy = Number(stats.entropy);
    sharpness = Number(stats.sharpness);
    if (entropy < 1.35 || sharpness < 0.25) {
      const error = new Error('Brand image is too flat or blurry for a presentation-ready mockup.');
      error.code = 'MOCKUP_ASSET_LOW_QUALITY';
      throw error;
    }
  }
  return {
    buffer: source,
    contentType: response.contentType,
    width: displayWidth,
    height: displayHeight,
    hasAlpha: metadata.hasAlpha === true,
    isVector,
    finalUrl: response.finalUrl,
    qualityAudit: {
      passed: true,
      displayWidth,
      displayHeight,
      pixelArea: displayWidth * displayHeight,
      entropy,
      sharpness,
      noRasterUpscaleRequired: isVector || (kind === 'logo'
        ? displayWidth >= 140 && displayHeight >= 40
        : displayWidth >= 280 && displayHeight >= 280),
    },
  };
}

function productCompositionAudit(asset, {
  panelWidth = PRODUCT_PANEL_WIDTH,
  panelHeight = PRODUCT_PANEL_HEIGHT,
  padding = PRODUCT_SAFE_PADDING,
} = {}) {
  const sourceWidth = Math.max(1, Number(asset?.width) || 0);
  const sourceHeight = Math.max(1, Number(asset?.height) || 0);
  const innerWidth = Math.max(1, panelWidth - (padding * 2));
  const innerHeight = Math.max(1, panelHeight - (padding * 2));
  const scale = Math.min(1, innerWidth / sourceWidth, innerHeight / sourceHeight);
  const displayWidth = Math.max(1, Math.round(sourceWidth * scale));
  const displayHeight = Math.max(1, Math.round(sourceHeight * scale));
  const displayedAreaRatio = Number(((displayWidth * displayHeight) / (panelWidth * panelHeight)).toFixed(4));
  const minimumDisplayDimension = Math.min(displayWidth, displayHeight);
  const enlargementRatio = 1;
  const selectionPassed = asset?.selectionAudit?.passed;
  const passed = Boolean(asset)
    && minimumDisplayDimension >= 115
    && displayedAreaRatio >= 0.32
    && selectionPassed !== false;
  return {
    passed,
    mode: 'blurred_background_full_contain_foreground',
    sourceWidth,
    sourceHeight,
    panelWidth,
    panelHeight,
    padding,
    displayWidth,
    displayHeight,
    displayedAreaRatio,
    sourceVisibleFraction: 1,
    enlargementRatio,
    selectionPassed: selectionPassed ?? null,
    sourceClass: asset?.selectionAudit?.assetRole || null,
    noClipGuaranteed: true,
    noUpscaleGuaranteed: true,
  };
}

function logoCompositionAudit(asset, { maxWidth = 330, maxHeight = 86 } = {}) {
  const sourceWidth = Math.max(1, Number(asset?.width) || 0);
  const sourceHeight = Math.max(1, Number(asset?.height) || 0);
  const scale = asset?.isVector === true
    ? Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight)
    : Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const displayWidth = Math.max(1, Math.round(sourceWidth * scale));
  const displayHeight = Math.max(1, Math.round(sourceHeight * scale));
  return {
    passed: Boolean(asset) && displayWidth >= 120 && displayHeight >= 32
      && asset?.qualityAudit?.passed !== false,
    sourceWidth,
    sourceHeight,
    displayWidth,
    displayHeight,
    sourceVisibleFraction: 1,
    noClipGuaranteed: true,
    noRasterUpscaleGuaranteed: asset?.isVector === true || scale <= 1,
    scalableVector: asset?.isVector === true,
  };
}

function productCandidateAudit(asset) {
  const candidate = asset?.candidate || asset || {};
  const marker = `${candidate.marker || ''} ${candidate.alt || ''} ${candidate.url || ''} ${candidate.sourceUrl || ''}`;
  const sourceRole = candidate.pageRole || pageAssetRole(candidate.sourceUrl || '');
  const hasNegativeEvidence = PRODUCT_IRRELEVANCE_PATTERN.test(marker);
  const hasProductEvidence = candidate.cleanProductEvidence === true
    || ['product_photo', 'service_photo'].includes(candidate.assetRole)
    || CLEAN_PRODUCT_PATTERN.test(marker) || CLEAN_SERVICE_PATTERN.test(marker)
    || ['product_detail', 'product_collection', 'portfolio', 'service'].includes(sourceRole);
  const hasPositiveEvidence = PRODUCT_RELEVANCE_PATTERN.test(marker) || hasProductEvidence;
  const precomposedRisk = candidate.assetRole === 'campaign_art'
    || candidate.likelyPrecomposed === true
    || PRECOMPOSED_ART_PATTERN.test(`${candidate.marker || ''} ${candidate.alt || ''}`)
    || (candidate.origin === 'social_meta' && candidate.cleanProductEvidence !== true);
  const sourceVerified = /^https?:\/\//i.test(String(candidate.sourceUrl || ''));
  const assetRole = candidate.assetRole
    || (CLEAN_PRODUCT_PATTERN.test(marker) || ['product_detail', 'product_collection'].includes(sourceRole)
      ? 'product_photo'
      : CLEAN_SERVICE_PATTERN.test(marker) || ['portfolio', 'service'].includes(sourceRole)
      ? 'service_photo'
      : precomposedRisk ? 'campaign_art' : 'general_photo');
  const passed = hasPositiveEvidence && hasProductEvidence && !hasNegativeEvidence
    && !precomposedRisk && sourceVerified && ['product_photo', 'service_photo'].includes(assetRole);
  return {
    passed,
    assetRole,
    sourceRole,
    sourceVerified,
    hasProductEvidence,
    hasNegativeEvidence,
    precomposedRisk,
    reason: passed ? 'verified_clean_company_image'
      : precomposedRisk ? 'precomposed_campaign_art'
      : hasNegativeEvidence ? 'irrelevant_people_or_editorial_image'
      : !sourceVerified ? 'source_page_unverified'
      : 'product_or_service_evidence_unverified',
  };
}

function productPresentationScore(asset) {
  const audit = asset?.compositionAudit || productCompositionAudit(asset);
  const selection = asset?.selectionAudit || productCandidateAudit(asset);
  const candidate = asset?.candidate || {};
  const roleBonus = selection.sourceRole === 'product_detail' ? 150
    : selection.sourceRole === 'portfolio' ? 125
    : selection.sourceRole === 'product_collection' ? 110
    : selection.sourceRole === 'service' ? 100 : 35;
  return Number(candidate.selectionScore ?? candidate.score ?? 0)
    + (audit.displayedAreaRatio * 70)
    + roleBonus
    + (selection.assetRole === 'product_photo' ? 45 : 30)
    - (selection.precomposedRisk ? 500 : 0)
    - (selection.sourceVerified ? 0 : 300);
}

function productAssetIsRelevant(asset) {
  const selection = productCandidateAudit(asset);
  return selection.hasProductEvidence && !selection.hasNegativeEvidence;
}

async function fetchBestValid(candidates, dependencies, sharpImpl, kind, compositionOptions = {}) {
  assertMockupNotAborted(dependencies);
  const attempts = [];
  const nonPlaceholder = candidates.filter((candidate) => !/\b(?:placeholder|spacer|blank|no[-_ ]?image|loading|pixel|default[-_ ]?(?:image|photo))\b/i
    .test(`${candidate.url} ${candidate.alt || ''}`));
  const rankedCandidates = [...nonPlaceholder].sort((left, right) => {
    if (kind !== 'product') return Number(right.score || 0) - Number(left.score || 0);
    const leftAudit = productCandidateAudit(left);
    const rightAudit = productCandidateAudit(right);
    if (leftAudit.passed !== rightAudit.passed) return rightAudit.passed ? 1 : -1;
    return Number(right.selectionScore ?? right.score ?? 0) - Number(left.selectionScore ?? left.score ?? 0)
      || String(left.url).localeCompare(String(right.url));
  });
  const filtered = [];
  for (const candidate of rankedCandidates.slice(0, kind === 'logo' ? 8 : 12)) {
    if (kind === 'product') {
      const selectionAudit = productCandidateAudit(candidate);
      if (!selectionAudit.passed) {
        const error = new Error('The public image did not pass clean product or service image gates.');
        error.code = selectionAudit.precomposedRisk
          ? 'MOCKUP_ASSET_PRECOMPOSED_UNSAFE'
          : selectionAudit.sourceVerified ? 'MOCKUP_ASSET_RELEVANCE_UNVERIFIED' : 'MOCKUP_ASSET_SOURCE_UNVERIFIED';
        attempts.push(safeDiagnostic(error, 'product_selection', candidate.url));
        continue;
      }
    }
    filtered.push(candidate);
  }
  const valid = [];
  for (let index = 0; index < filtered.length; index += 4) {
    assertMockupNotAborted(dependencies);
    const batch = filtered.slice(index, index + 4);
    const results = await Promise.all(batch.map(async (candidate) => {
      try {
        const response = await (dependencies.fetchAsset || fetchWebsiteAsset)(candidate.url, {
          maxBytes: 6 * 1024 * 1024,
          timeoutMs: 8000,
          referer: candidate.sourceUrl,
          signal: dependencies.signal,
        });
        const asset = { ...(await validatedAsset(response, sharpImpl, kind)), candidate };
        if (kind === 'product') asset.selectionAudit = productCandidateAudit(candidate);
        return { asset };
      } catch (error) {
        return { error, candidate };
      }
    }));
    assertMockupNotAborted(dependencies);
    for (const result of results) {
      if (!result.asset) {
        attempts.push(safeDiagnostic(result.error, kind, result.candidate?.url));
        continue;
      }
      if (kind === 'product') {
        const layoutGeometry = compositionOptions.artworkWidth
          ? mockupLayoutGeometry(result.asset, compositionOptions.artworkWidth, compositionOptions.panelHeight || PRODUCT_PANEL_HEIGHT)
          : null;
        const layoutPadding = layoutGeometry
          ? Math.max(10, Math.round(Math.min(layoutGeometry.productWidth, layoutGeometry.artworkHeight) * 0.04375))
          : compositionOptions.padding;
        const baseCompositionAudit = productCompositionAudit(result.asset, layoutGeometry ? {
          panelWidth: layoutGeometry.productWidth,
          panelHeight: layoutGeometry.artworkHeight,
          padding: layoutPadding,
        } : compositionOptions);
        const compositionAudit = {
          ...baseCompositionAudit,
          passed: baseCompositionAudit.passed && (layoutGeometry?.passed ?? true),
          layoutId: layoutGeometry?.layoutId || selectMockupLayoutId(result.asset),
          layoutNoOverlapGuaranteed: layoutGeometry?.noOverlapGuaranteed ?? true,
        };
        if (!compositionAudit.passed) {
          const error = new Error('The complete company image would be too small to present clearly without cropping.');
          error.code = 'MOCKUP_ASSET_COMPOSITION_UNSUITABLE';
          attempts.push(safeDiagnostic(error, 'product_composition', result.candidate?.url));
          continue;
        }
        valid.push({
          ...result.asset,
          layoutId: compositionAudit.layoutId,
          layoutGeometry,
          compositionAudit,
        });
      } else {
        valid.push(result.asset);
      }
    }
    // Candidates are already ranked by verified product/service context. Once
    // a high-confidence batch yields a visually valid asset, avoid fetching
    // lower-ranked images. This keeps a 70-company morning run bounded while
    // still trying another batch when the best public files are broken.
    if (valid.length) break;
  }
  valid.sort((left, right) => kind === 'product'
    ? productPresentationScore(right) - productPresentationScore(left)
    : Number(right.candidate?.score || 0) - Number(left.candidate?.score || 0));
  return { asset: valid[0] || null, attempts };
}

function boothLabel(candidate) {
  const body = String(candidate?.message?.bodyText || '');
  const match = /\bbooths?\s*(?:#|no\.?\s*)?([a-z0-9][a-z0-9–—\-/, &;]*)(?=[.\n]|$)/i.exec(body);
  if (!match?.[1]) return null;
  return normalizedLabel(match[1].replace(/\s+(?:at|during|for|on|from|and\s+(?:a|the))\b.*$/i, '')) || null;
}

function marketingLine(value, maxLength = 94) {
  let line = cleanLabel(value, 180)
    .replace(/\s*[|–—-]\s*(?:official(?:\s+site)?|home)\s*$/i, '')
    .replace(/^(?:official\s+site\s*[|–—-]\s*)/i, '')
    .trim();
  if (line.length < 4 || /^(?:home|our company|our brands|frequently asked questions|shop now|about us)$/i.test(line)) return null;
  if (/cookie|privacy|sign in|log in|subscribe|customer service/i.test(line)) return null;
  if (line.length > maxLength) {
    const shortened = line.slice(0, maxLength + 1);
    line = `${shortened.slice(0, Math.max(1, shortened.lastIndexOf(' '))).replace(/[,:;\-–—]+$/, '').trim()}...`;
  }
  return line || null;
}

function brandLineScore(line, businessName, kind) {
  const value = marketingLine(line, kind === 'headline' ? 74 : 108);
  if (!value) return -1000;
  const words = value.split(/\s+/).length;
  const normalized = normalizedBrandIdentity(value);
  const name = normalizedBrandIdentity(businessName);
  let score = 0;
  if (kind === 'headline') {
    if (words >= 3 && words <= 9) score += 55;
    if (value.length <= 52) score += 25;
    if (/[.!?]$/.test(value)) score += 12;
    if (/official|homepage|about us/i.test(value)) score -= 60;
  } else {
    if (words >= 4 && words <= 16) score += 45;
    if (/product|service|footwear|shoe|boot|sneaker|sandal|bag|apparel|menu|dish|project|property|vehicle|equipment|printing|construction/i.test(value)) score += 30;
    if (value.length <= 92) score += 15;
  }
  if (normalized === name || normalized.startsWith(`${name} official`)) score -= 45;
  return score;
}

function stripLeadingBrandName(value, businessName) {
  let line = String(value || '').trim();
  const rawName = String(businessName || '').trim();
  const variants = [
    rawName,
    rawName.replace(/\s*\([^()]*\)\s*$/, '').trim(),
    ...[...rawName.matchAll(/\(([^()]{2,80})\)/g)].map((match) => match[1].trim()),
  ].filter(Boolean).sort((left, right) => right.length - left.length);
  for (const variant of variants) {
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripped = line.replace(new RegExp(`^${escaped}\\s*(?:[|:–—-]\\s*)+`, 'i'), '').trim();
    if (stripped.length >= 4) line = stripped;
  }
  return line;
}

function brandLinesOverlap(left, right) {
  const a = normalizedBrandIdentity(left);
  const b = normalizedBrandIdentity(right);
  if (!a || !b) return false;
  if (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true;
  const aWords = new Set(a.split(' ').filter((word) => word.length > 2));
  const bWords = new Set(b.split(' ').filter((word) => word.length > 2));
  const smaller = Math.min(aWords.size, bWords.size);
  if (!smaller) return false;
  const shared = [...aWords].filter((word) => bWords.has(word)).length;
  return shared / smaller >= 0.75;
}

function selectBrandCopy(candidate, profile = {}) {
  const businessName = candidate?.prospect?.businessName || '';
  const taglines = Array.isArray(profile.taglineCandidates) ? profile.taglineCandidates : [];
  const offerings = Array.isArray(profile.offeringCandidates) ? profile.offeringCandidates : [];
  const rankedHeadlineRaw = [...taglines]
    .map((line, index) => ({ line: marketingLine(line, 74), score: brandLineScore(line, businessName, 'headline') - index }))
    .filter((entry) => entry.line && entry.score > -500)
    .sort((left, right) => right.score - left.score)[0]?.line || null;
  const rankedHeadline = marketingLine(stripLeadingBrandName(rankedHeadlineRaw, businessName), 74);
  // Offering copy must describe the company, not a random product/category
  // caption from elsewhere on the page. Product imagery already carries the
  // specific visual; metadata-backed offering copy keeps the pairing honest.
  const rankedOfferingRaw = [...offerings]
    .map((line, index) => ({ line: marketingLine(line, 92), score: brandLineScore(line, businessName, 'offering') - index }))
    .filter((entry) => entry.line && entry.score > -500)
    .sort((left, right) => right.score - left.score)[0]?.line || null;
  const rankedOffering = marketingLine(stripLeadingBrandName(rankedOfferingRaw, businessName), 92);
  const distinctOffering = brandLinesOverlap(rankedHeadline, rankedOffering) ? null : rankedOffering;
  return {
    headline: rankedHeadline,
    offering: distinctOffering || (rankedHeadline ? null : marketingLine(candidate?.prospect?.industry || candidate?.prospect?.businessType, 78)),
    themeColors: Array.isArray(profile.themeColors) ? profile.themeColors.slice(0, 6) : [],
  };
}

function planFor(candidate, assets = {}) {
  const sceneId = selectSceneId(candidate);
  const layoutId = selectMockupLayoutId(assets.product);
  const event = eventLabel(candidate);
  const booth = boothLabel(candidate);
  const brandCopy = selectBrandCopy(candidate, assets.profile);
  const logoUrl = assets.logo?.finalUrl || assets.logo?.candidate?.url || null;
  const productImageUrl = assets.product?.finalUrl || assets.product?.candidate?.url || null;
  const sourceUrls = [...new Set([
    logoUrl, productImageUrl,
    ...(assets.pageUrls || []),
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
    messageContentHash: candidate.message?.contentHash || null,
    sceneId,
    layoutId,
    event,
    booth,
    brandCopy,
    logoUrl,
    productImageUrl,
    logoAssetHash: assets.logo?.buffer ? sha256(assets.logo.buffer) : null,
    productAssetHash: assets.product?.buffer ? sha256(assets.product.buffer) : null,
  }));
  return {
    sceneId,
    layoutId,
    eventLabel: event,
    boothLabel: booth,
    messageContentHash: candidate.message?.contentHash || null,
    brandCopy,
    logoUrl,
    productImageUrl,
    sourceUrls,
    contentHash,
  };
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
  if (!asset) return null;
  try {
    const { data, info } = await sharpImpl(asset.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .rotate().resize(64, 64, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const buckets = new Map();
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const r = data[offset]; const g = data[offset + 1]; const b = data[offset + 2];
      const alpha = info.channels >= 4 ? data[offset + 3] : 255;
      if (alpha < 96 || (r > 240 && g > 240 && b > 240)) continue;
      const quantized = { r: Math.min(255, (Math.floor(r / 32) * 32) + 16), g: Math.min(255, (Math.floor(g / 32) * 32) + 16), b: Math.min(255, (Math.floor(b / 32) * 32) + 16) };
      const key = `${quantized.r},${quantized.g},${quantized.b}`;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      buckets.set(key, (buckets.get(key) || 0) + 1 + (saturation / 255));
    }
    const winner = [...buckets.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    if (!winner) return null;
    const [r, g, b] = winner.split(',').map(Number);
    const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    if (luminance < 18) return '#1d1d1d';
    return hexColor({ r, g, b });
  } catch {
    return null;
  }
}

function validHexColor(value) {
  const match = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : null;
}

function rgbFromHex(value) {
  const hex = validHexColor(value);
  if (!hex) return null;
  return { r: Number.parseInt(hex.slice(1, 3), 16), g: Number.parseInt(hex.slice(3, 5), 16), b: Number.parseInt(hex.slice(5, 7), 16) };
}

function colorDistance(left, right) {
  const a = rgbFromHex(left); const b = rgbFromHex(right);
  if (!a || !b) return 0;
  return Math.sqrt(((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2));
}

function shiftColor(value, amount) {
  const rgb = rgbFromHex(value) || { r: 25, g: 35, b: 45 };
  return hexColor({ r: rgb.r + amount, g: rgb.g + amount, b: rgb.b + amount });
}

function srgbChannel(value) {
  const channel = Math.max(0, Math.min(255, Number(value) || 0)) / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(value) {
  const rgb = rgbFromHex(value);
  if (!rgb) return null;
  return (0.2126 * srgbChannel(rgb.r)) + (0.7152 * srgbChannel(rgb.g)) + (0.0722 * srgbChannel(rgb.b));
}

function whiteTextContrastRatio(value) {
  const luminance = relativeLuminance(value);
  return luminance === null ? 0 : 1.05 / (luminance + 0.05);
}

function ensureWhiteTextContrast(value, minimum = MIN_WHITE_TEXT_CONTRAST) {
  const color = validHexColor(value) || '#1f2937';
  const safeMinimum = Math.max(4.5, Math.min(12, Number(minimum) || MIN_WHITE_TEXT_CONTRAST));
  if (whiteTextContrastRatio(color) >= safeMinimum) return color;
  const rgb = rgbFromHex(color);
  let low = 0;
  let high = 1;
  let best = '#000000';
  // Scaling all three channels preserves the source hue while deterministically
  // finding the lightest version that still passes the white-copy contrast gate.
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const scale = (low + high) / 2;
    const candidate = hexColor({ r: rgb.r * scale, g: rgb.g * scale, b: rgb.b * scale });
    if (whiteTextContrastRatio(candidate) >= safeMinimum) {
      best = candidate;
      low = scale;
    } else {
      high = scale;
    }
  }
  return best;
}

function paletteContrastAudit(palette) {
  const primaryWhiteContrast = whiteTextContrastRatio(palette?.primary);
  const secondaryWhiteContrast = whiteTextContrastRatio(palette?.secondary);
  return {
    passed: primaryWhiteContrast >= MIN_WHITE_TEXT_CONTRAST
      && secondaryWhiteContrast >= MIN_WHITE_TEXT_CONTRAST,
    minimumWhiteTextContrast: MIN_WHITE_TEXT_CONTRAST,
    primaryWhiteContrast: Number(primaryWhiteContrast.toFixed(3)),
    secondaryWhiteContrast: Number(secondaryWhiteContrast.toFixed(3)),
  };
}

function colorChroma(value) {
  const rgb = rgbFromHex(value);
  if (!rgb) return 0;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
}

function pickPrimaryBrandColor(profileColors, logoColor, productColor) {
  const candidates = [
    ...profileColors.map((color, index) => ({ color, sourcePriority: 36 - index })),
    { color: logoColor, sourcePriority: 24 },
    { color: productColor, sourcePriority: 14 },
  ].filter((candidate) => validHexColor(candidate.color));
  if (!candidates.length) return '#1f2937';
  return candidates
    .map((candidate, index) => {
      const luminance = relativeLuminance(candidate.color) ?? 1;
      const nearWhite = luminance > 0.82 && colorChroma(candidate.color) < 28;
      const alreadyReadable = whiteTextContrastRatio(candidate.color) >= MIN_WHITE_TEXT_CONTRAST;
      return {
        ...candidate,
        index,
        score: candidate.sourcePriority + (alreadyReadable ? 90 : 0)
          + (colorChroma(candidate.color) * 0.18) - (nearWhite ? 220 : 0),
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)[0].color;
}

async function resolveBrandPalette(assets, sharpImpl) {
  const [logoColor, productColor] = await Promise.all([
    dominantColor(assets.logo, sharpImpl),
    dominantColor(assets.product, sharpImpl),
  ]);
  const profileColors = (assets.profile?.themeColors || []).map(validHexColor).filter(Boolean);
  const rawPrimary = pickPrimaryBrandColor(profileColors, logoColor, productColor);
  const primary = ensureWhiteTextContrast(rawPrimary);
  const rawSecondary = [...profileColors, productColor, logoColor]
    .filter((color) => color && color !== rawPrimary)
    .sort((left, right) => colorDistance(right, rawPrimary) - colorDistance(left, rawPrimary))[0] || null;
  let secondary = ensureWhiteTextContrast(rawSecondary || shiftColor(rawPrimary, -64));
  if (colorDistance(primary, secondary) < 28) {
    const rgb = rgbFromHex(primary) || { r: 31, g: 41, b: 55 };
    secondary = ensureWhiteTextContrast(hexColor({
      r: (rgb.r * 0.55) + 5,
      g: (rgb.g * 0.55) + 14,
      b: (rgb.b * 0.55) + 28,
    }));
  }
  const palette = { primary, secondary, accent: '#ff6b35' };
  return { ...palette, contrastAudit: paletteContrastAudit(palette) };
}

async function logoCardStyle(asset, sharpImpl) {
  if (!asset) return { fill: '#ffffff', stroke: '#ffffff' };
  try {
    const { data, info } = await sharpImpl(asset.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .rotate().resize(64, 32, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let luminanceTotal = 0;
    let weightTotal = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const alpha = info.channels >= 4 ? data[offset + 3] : 255;
      if (alpha < 32) continue;
      const weight = alpha / 255;
      luminanceTotal += ((0.2126 * data[offset]) + (0.7152 * data[offset + 1]) + (0.0722 * data[offset + 2])) * weight;
      weightTotal += weight;
    }
    const averageLuminance = weightTotal ? luminanceTotal / weightTotal : 0;
    return averageLuminance > 184
      ? { fill: '#111827', stroke: '#ffffff' }
      : { fill: '#ffffff', stroke: '#ffffff' };
  } catch {
    return { fill: '#ffffff', stroke: '#ffffff' };
  }
}

function wrapName(name, maxLineLength = 24) {
  const value = cleanLabel(name, 72) || 'YOUR BUSINESS';
  if (value.length <= maxLineLength) return [value];
  const words = value.split(' ');
  if (words.length === 1) {
    const midpoint = Math.ceil(value.length / 2);
    return [value.slice(0, midpoint), value.slice(midpoint)];
  }
  const lines = [''];
  for (const word of words) {
    const current = lines.at(-1);
    if (current && `${current} ${word}`.length > maxLineLength && lines.length < 2) lines.push(word);
    else lines[lines.length - 1] = current ? `${current} ${word}` : word;
  }
  return lines.slice(0, 2);
}

function wrapCopy(value, maxLineLength = 34, maxLines = 2) {
  const words = cleanLabel(value, 180).split(' ').filter(Boolean);
  if (!words.length) return [];
  const lines = [''];
  for (const word of words) {
    const current = lines.at(-1);
    if (current && `${current} ${word}`.length > maxLineLength && lines.length < maxLines) lines.push(word);
    else lines[lines.length - 1] = current ? `${current} ${word}` : word;
  }
  if (lines.length > maxLines) return lines.slice(0, maxLines);
  if (lines.at(-1).length > maxLineLength + 12) {
    const last = lines.at(-1).slice(0, maxLineLength + 1);
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, last.lastIndexOf(' '))).trim()}...`;
  }
  return lines;
}

let cachedMockupFont;

async function loadMockupFont(dependencies = {}) {
  if (dependencies.font) return dependencies.font;
  if (!cachedMockupFont) {
    const fontBuffer = dependencies.fontBuffer
      || await fs.readFile(path.resolve(process.cwd(), MOCKUP_FONT_FILE));
    cachedMockupFont = fontkit.create(fontBuffer);
  }
  return cachedMockupFont;
}

function fontRun(font, text) {
  const value = String(text || '');
  for (const character of value) {
    if (!font.hasGlyphForCodePoint(character.codePointAt(0))) {
      const error = new Error(`The bundled mockup font cannot safely render ${JSON.stringify(character)}.`);
      error.code = 'MOCKUP_FONT_GLYPH_UNAVAILABLE';
      throw error;
    }
  }
  return font.layout(value);
}

function fontSafeText(font, text, failOnUnsupported = false) {
  const replacements = new Map([['’', "'"], ['‘', "'"], ['“', '"'], ['”', '"'], ['—', '-'], ['–', '-'], ['…', '...']]);
  return [...String(text || '')].map((character) => {
    if (font.hasGlyphForCodePoint(character.codePointAt(0))) return character;
    const replacement = replacements.get(character) || '';
    if (replacement && [...replacement].every((value) => font.hasGlyphForCodePoint(value.codePointAt(0)))) return replacement;
    if (failOnUnsupported) {
      const error = new Error(`The bundled mockup font cannot safely render ${JSON.stringify(character)}.`);
      error.code = 'MOCKUP_FONT_GLYPH_UNAVAILABLE';
      throw error;
    }
    return '';
  }).join('');
}

function runWidth(run, font, fontSize, letterSpacing = 0) {
  const advance = run.positions.reduce((total, position) => total + position.xAdvance, 0);
  return (advance * (fontSize / font.unitsPerEm))
    + (Math.max(0, run.glyphs.length - 1) * letterSpacing);
}

function fitFontSize(font, lines, preferredSize, maxWidth, letterSpacing = 0, minimumSize = 14) {
  let fitted = preferredSize;
  for (const line of lines) {
    const run = fontRun(font, line);
    const width = runWidth(run, font, preferredSize, letterSpacing);
    if (width > maxWidth) fitted = Math.min(fitted, preferredSize * (maxWidth / width));
  }
  return Math.max(minimumSize, Math.floor(fitted));
}

function balancedMeasuredText(font, text, fontSize, maxWidth, letterSpacing = 0, maxLines = 2) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const segment = (start, end) => tokens.slice(start, end).join(' ');
  const widthOf = (value) => runWidth(fontRun(font, value), font, fontSize, letterSpacing);
  const segmentWidths = new Map();
  const widthBetween = (start, end) => {
    const key = `${start}:${end}`;
    if (!segmentWidths.has(key)) segmentWidths.set(key, widthOf(segment(start, end)));
    return segmentWidths.get(key);
  };

  for (let targetLines = 1; targetLines <= maxLines; targetLines += 1) {
    let best = null;
    const visit = (start, lines, widths) => {
      const remainingLines = targetLines - lines.length;
      if (remainingLines === 0) {
        if (start !== tokens.length) return;
        const average = widths.reduce((sum, width) => sum + width, 0) / widths.length;
        const raggedness = widths.reduce((sum, width) => sum + ((width - average) ** 2), 0);
        const boundaryPenalty = lines.slice(0, -1).some((line) => /(?:^|\s)·$/.test(line))
          || lines.slice(1).some((line) => /^·(?:\s|$)/.test(line)) ? 1_000_000 : 0;
        const score = raggedness + boundaryPenalty;
        if (!best || score < best.score) best = { lines, widths, score };
        return;
      }
      if (remainingLines === 1) {
        const width = widthBetween(start, tokens.length);
        if (width <= maxWidth) visit(tokens.length, [...lines, segment(start, tokens.length)], [...widths, width]);
        return;
      }
      const maximumEnd = tokens.length - (remainingLines - 1);
      for (let end = start + 1; end <= maximumEnd; end += 1) {
        const width = widthBetween(start, end);
        if (width > maxWidth) break;
        visit(end, [...lines, segment(start, end)], [...widths, width]);
      }
    };
    visit(0, [], []);
    if (best) return best.lines;
  }
  return [];
}

function footerTextLayout(font, text, maxWidth) {
  const value = String(text || '').trim();
  const safeMaxWidth = Math.max(240, Number(maxWidth) || 240);
  const separatorY = 247;
  const verticalTop = 254;
  const verticalBottom = 314;
  for (let fontSize = 22; fontSize >= 12; fontSize -= 1) {
    const letterSpacing = fontSize >= 18 ? 1.1 : 0.65;
    const lines = balancedMeasuredText(font, value, fontSize, safeMaxWidth, letterSpacing, 2);
    const measuredWidths = lines.map((line) => Number(
      runWidth(fontRun(font, line), font, fontSize, letterSpacing).toFixed(3),
    ));
    const unitsPerEm = Math.max(1, Number(font.unitsPerEm) || 1);
    const ascent = Math.max(0, Number(font.ascent) || (unitsPerEm * 0.8)) * (fontSize / unitsPerEm);
    const descent = Math.max(0, -(Number(font.descent) || -(unitsPerEm * 0.2))) * (fontSize / unitsPerEm);
    const lineHeight = fontSize + 6;
    const verticalExtent = ascent + descent + (Math.max(0, lines.length - 1) * lineHeight);
    const verticalRoom = verticalBottom - verticalTop;
    const firstBaseline = verticalTop + Math.max(0, (verticalRoom - verticalExtent) / 2) + ascent;
    const baselines = lines.map((_, index) => Number((firstBaseline + (index * lineHeight)).toFixed(3)));
    const inkTop = baselines.length ? Number((baselines[0] - ascent).toFixed(3)) : verticalTop;
    const inkBottom = baselines.length ? Number((baselines.at(-1) + descent).toFixed(3)) : verticalBottom;
    if (lines.length > 0 && lines.length <= 2
        && measuredWidths.every((width) => width <= safeMaxWidth)
        && verticalExtent <= verticalRoom
        && inkTop >= verticalTop && inkBottom <= verticalBottom) {
      return {
        lines, fontSize, letterSpacing, measuredWidths, maxWidth: safeMaxWidth,
        baselines, separatorY, inkTop, inkBottom, verticalTop, verticalBottom,
        passed: true, completeTextPreserved: lines.join(' ') === value,
      };
    }
  }
  return {
    lines: [], fontSize: 0, letterSpacing: 0, measuredWidths: [], maxWidth: safeMaxWidth,
    baselines: [], separatorY, inkTop: null, inkBottom: null, verticalTop, verticalBottom,
    passed: false, completeTextPreserved: false,
  };
}

function vectorTextPaths(font, text, {
  x = 0, baselineY = 0, fontSize = 24, fill = '#ffffff', letterSpacing = 0,
} = {}) {
  const run = fontRun(font, text);
  const scale = fontSize / font.unitsPerEm;
  let cursor = 0;
  return run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const glyphX = x + ((cursor + position.xOffset) * scale) + (index * letterSpacing);
    const glyphY = baselineY - (position.yOffset * scale);
    cursor += position.xAdvance;
    return `<path d="${glyph.path.toSVG()}" transform="translate(${glyphX.toFixed(3)} ${glyphY.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})" fill="${fill}"/>`;
  }).join('');
}

async function renderProductPanel(asset, width, height, palette, sharpImpl) {
  const padding = Math.max(10, Math.round(Math.min(width, height) * 0.04375));
  let background;
  if (asset.hasAlpha) {
    background = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.secondary}"/><stop offset="1" stop-color="${shiftColor(palette.secondary, 52)}"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#panel)"/>
    </svg>`);
  } else {
    background = await sharpImpl(asset.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .blur(20)
      .modulate({ brightness: 0.58, saturation: 0.82 })
      .jpeg({ quality: 86, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  const foregroundPipeline = sharpImpl(asset.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
    .rotate()
    .resize(width - (padding * 2), height - (padding * 2), {
      fit: 'inside',
      withoutEnlargement: true,
    });
  const foreground = asset.hasAlpha
    ? await foregroundPipeline.png().toBuffer({ resolveWithObject: true })
    : await foregroundPipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true });
  const left = Math.floor((width - foreground.info.width) / 2);
  const top = Math.floor((height - foreground.info.height) / 2);
  const layers = [];
  if (!asset.hasAlpha) {
    layers.push({
      input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${Math.max(0, left - 6)}" y="${Math.max(0, top - 6)}" width="${Math.min(width - Math.max(0, left - 6), foreground.info.width + 12)}" height="${Math.min(height - Math.max(0, top - 6), foreground.info.height + 12)}" rx="8" fill="#000000" fill-opacity=".24"/>
      </svg>`),
      left: 0,
      top: 0,
    });
  }
  layers.push({ input: foreground.data, left, top });
  layers.push({
    input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#ffffff" stroke-opacity=".24" stroke-width="2"/></svg>`),
    left: 0,
    top: 0,
  });
  const buffer = await sharpImpl(background, { failOn: 'none', limitInputPixels: 24_000_000 })
    .resize(width, height, { fit: 'fill' })
    .composite(layers)
    .png()
    .toBuffer();
  return {
    buffer,
    audit: productCompositionAudit(asset, { panelWidth: width, panelHeight: height, padding }),
  };
}

async function renderArtwork(candidate, assets, sharpImpl, dependencies = {}) {
  const width = Math.max(860, Math.min(1120, Math.round(Number(dependencies.artworkWidth) || 1000)));
  const height = 320;
  const footerTop = PRODUCT_PANEL_HEIGHT;
  const productPanelHeight = PRODUCT_PANEL_HEIGHT;
  const layoutGeometry = mockupLayoutGeometry(assets.product, width, productPanelHeight);
  const {
    productWidth, productLeft, productSide, textLeft, textWidth,
  } = layoutGeometry;
  const horizontalScale = width / 1000;
  const plan = planFor(candidate, assets);
  const [palette, font, logoCard] = await Promise.all([
    resolveBrandPalette(assets, sharpImpl),
    loadMockupFont(dependencies),
    logoCardStyle(assets.logo, sharpImpl),
  ]);
  const layers = [{
    input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${palette.primary}"/>
          <stop offset="0.62" stop-color="${palette.secondary}"/>
          <stop offset="1" stop-color="${palette.secondary}" stop-opacity=".92"/>
        </linearGradient>
        <linearGradient id="orangeFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${palette.accent}" stop-opacity=".24"/>
          <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#brand)"/>
      <rect width="${Math.round(width * 0.43)}" height="100%" fill="url(#orangeFade)"/>
      <rect width="100%" height="8" fill="${palette.accent}"/>
    </svg>`),
    left: 0,
    top: 0,
  }];

  let compositionAudit = productCompositionAudit(null, { panelWidth: productWidth, panelHeight: productPanelHeight });
  if (assets.product) {
    const productPanel = await renderProductPanel(assets.product, productWidth, productPanelHeight, palette, sharpImpl);
    compositionAudit = {
      ...productPanel.audit,
      passed: productPanel.audit.passed && layoutGeometry.passed,
      layoutId: layoutGeometry.layoutId,
      layoutNoOverlapGuaranteed: layoutGeometry.noOverlapGuaranteed,
    };
    layers.push({ input: productPanel.buffer, left: productLeft, top: 0 });
    layers.push({
      input: Buffer.from(`<svg width="4" height="${productPanelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${palette.accent}" fill-opacity=".72"/></svg>`),
      left: Math.max(0, (productSide === 'left' ? productLeft + productWidth : productLeft) - 2),
      top: 0,
    });
  }

  let logoCardHeight = 0;
  let logoCardBottom = 0;
  let logoAudit = logoCompositionAudit(null);
  let textContentBottom = 0;
  let logoHeadlineNoOverlapGuaranteed = true;
  let headlineInkTop = null;
  const textInkTop = (baseline, fontSize) => baseline
    - (Math.max(0, Number(font.ascent) || (Number(font.unitsPerEm) * 0.8))
      * (fontSize / Math.max(1, Number(font.unitsPerEm) || 1)));
  const textInkBottom = (baseline, fontSize) => baseline
    + (Math.max(0, -(Number(font.descent) || -(Number(font.unitsPerEm) * 0.2)))
      * (fontSize / Math.max(1, Number(font.unitsPerEm) || 1)));
  if (assets.logo) {
    const logoMaxWidth = Math.max(220, Math.min(Math.round(330 * horizontalScale), textWidth - 38));
    logoAudit = logoCompositionAudit(assets.logo, { maxWidth: logoMaxWidth, maxHeight: 86 });
    const logo = await sharpImpl(assets.logo.buffer, { failOn: 'none', limitInputPixels: 24_000_000 })
      .resize(logoMaxWidth, 86, { fit: 'inside', withoutEnlargement: assets.logo.isVector !== true }).png().toBuffer({ resolveWithObject: true });
    const cardWidth = Math.max(185, logo.info.width + 38);
    const cardHeight = Math.max(72, logo.info.height + 24);
    logoCardHeight = cardHeight;
    logoCardBottom = 25 + cardHeight;
    textContentBottom = Math.max(textContentBottom, logoCardBottom);
    layers.push({
      input: Buffer.from(`<svg width="${cardWidth}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="${cardWidth - 2}" height="${cardHeight - 2}" rx="13" fill="${logoCard.fill}" fill-opacity=".97" stroke="${logoCard.stroke}" stroke-opacity=".8"/></svg>`),
      left: textLeft,
      top: 25,
    });
    const logoLeft = textLeft;
    layers.push({ input: logo.data, left: logoLeft + Math.floor((cardWidth - logo.info.width) / 2), top: 25 + Math.floor((cardHeight - logo.info.height) / 2) });
  }

  const svgParts = [];
  if (assets.logo) {
    const headline = fontSafeText(font, plan.brandCopy.headline || plan.brandCopy.offering || candidate.prospect.businessName);
    const headlineLines = wrapCopy(headline, assets.product ? 28 : 42, 2);
    const headlineFont = fitFontSize(font, headlineLines, headlineLines.length === 1 ? 32 : 26, textWidth - 8, -0.6, 20);
    const headlineAscent = Math.max(0, Number(font.ascent) || (Number(font.unitsPerEm) * 0.8))
      * (headlineFont / Math.max(1, Number(font.unitsPerEm) || 1));
    const headlineStart = Math.max(142, logoCardBottom + 8 + headlineAscent);
    headlineInkTop = textInkTop(headlineStart, headlineFont);
    logoHeadlineNoOverlapGuaranteed = headlineInkTop >= logoCardBottom + 8;
    headlineLines.forEach((line, index) => svgParts.push(vectorTextPaths(font, line, {
      baselineY: headlineStart + (index * (headlineFont + 5)), fontSize: headlineFont, fill: '#ffffff', letterSpacing: -0.6,
    })));
    headlineLines.forEach((_, index) => {
      textContentBottom = Math.max(textContentBottom, textInkBottom(
        headlineStart + (index * (headlineFont + 5)), headlineFont,
      ));
    });
    const offering = fontSafeText(font, plan.brandCopy.offering || '');
    if (offering && normalizedBrandIdentity(offering) !== normalizedBrandIdentity(headline)) {
      const offeringLines = wrapCopy(offering, assets.product ? 48 : 70, headlineLines.length > 1 ? 1 : 2);
      const lastHeadlineBaseline = headlineStart + ((headlineLines.length - 1) * (headlineFont + 5));
      const offeringStart = lastHeadlineBaseline + Math.max(28, Math.round(headlineFont * 0.85));
      offeringLines.forEach((line, index) => {
        const offeringFont = fitFontSize(font, [line], 17, textWidth - 8, 0.2, 13);
        const baselineY = offeringStart + (index * 21);
        svgParts.push(vectorTextPaths(font, line, {
          baselineY, fontSize: offeringFont, fill: '#f3f4f6', letterSpacing: 0.2,
        }));
        textContentBottom = Math.max(textContentBottom, textInkBottom(baselineY, offeringFont));
      });
    }
  } else {
    const nameLines = wrapName(fontSafeText(font, candidate.prospect.businessName), assets.product ? 18 : 24);
    const nameFont = fitFontSize(font, nameLines, nameLines.length === 1 ? 50 : 42, textWidth - 8, -1, 24);
    const nameStart = nameLines.length === 1 ? 148 : 112;
    nameLines.forEach((line, index) => svgParts.push(vectorTextPaths(font, line, {
      baselineY: nameStart + (index * (nameFont + 6)), fontSize: nameFont, fill: '#ffffff', letterSpacing: -1,
    })));
    nameLines.forEach((_, index) => {
      textContentBottom = Math.max(textContentBottom, textInkBottom(
        nameStart + (index * (nameFont + 6)), nameFont,
      ));
    });
  }

  const footerNoOverlapGuaranteed = textContentBottom <= footerTop - 4;
  const renderedLayoutAudit = {
    ...layoutGeometry,
    textContentBottom: Number(textContentBottom.toFixed(3)),
    footerTop,
    footerNoOverlapGuaranteed,
    logoCardBottom: logoCardBottom || null,
    headlineInkTop: headlineInkTop === null ? null : Number(headlineInkTop.toFixed(3)),
    logoHeadlineNoOverlapGuaranteed,
    passed: layoutGeometry.passed && footerNoOverlapGuaranteed && logoHeadlineNoOverlapGuaranteed,
  };
  if (!renderedLayoutAudit.passed) {
    const error = new Error('The company copy cannot fit above the event footer safely.');
    error.code = 'MOCKUP_LAYOUT_OVERFLOW';
    throw error;
  }
  compositionAudit = {
    ...compositionAudit,
    passed: compositionAudit.passed && renderedLayoutAudit.passed,
    layoutNoOverlapGuaranteed: renderedLayoutAudit.noOverlapGuaranteed
      && renderedLayoutAudit.footerNoOverlapGuaranteed,
  };

  const eventTextSource = normalizedLabel([
    plan.eventLabel,
    plan.boothLabel ? `BOOTH ${plan.boothLabel}` : null,
  ].filter(Boolean).join(' · ') || candidate.prospect.industry || candidate.prospect.businessType || 'QUICK BANNER MOCKUP').toUpperCase();
  if (eventTextSource.length > 260) {
    const error = new Error('The complete event and booth label exceeds the safe banner limit.');
    error.code = 'MOCKUP_EVENT_TEXT_OVERFLOW';
    throw error;
  }
  const eventText = fontSafeText(font, eventTextSource, true);
  const eventTextAudit = footerTextLayout(font, eventText, width - 108);
  if (!eventTextAudit.passed || !eventTextAudit.completeTextPreserved) {
    const error = new Error('The complete event and booth label cannot be rendered safely.');
    error.code = 'MOCKUP_EVENT_TEXT_OVERFLOW';
    throw error;
  }
  layers.push({ input: Buffer.from(`<svg width="${textWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`), left: textLeft, top: 0 });

  const footerSvgParts = [
    `<rect x="0" y="${footerTop}" width="${width}" height="${height - footerTop}" fill="#06182f" fill-opacity=".94"/>`,
    `<rect x="0" y="${footerTop}" width="${width}" height="4" fill="${palette.accent}"/>`,
  ];
  eventTextAudit.lines.forEach((line, index) => footerSvgParts.push(vectorTextPaths(font, line, {
    x: (width - eventTextAudit.measuredWidths[index]) / 2,
    baselineY: eventTextAudit.baselines[index],
    fontSize: eventTextAudit.fontSize,
    fill: '#ffffff',
    letterSpacing: eventTextAudit.letterSpacing,
  })));
  layers.push({
    input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${footerSvgParts.join('')}</svg>`),
    left: 0,
    top: 0,
  });

  layers.push({
    input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#shine)"/></svg>`),
    left: 0,
    top: 0,
  });

  const buffer = await sharpImpl({ create: { width, height, channels: 3, background: '#0b2344' } })
    .composite(layers).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
  return {
    buffer,
    compositionAudit,
    logoCompositionAudit: logoAudit,
    layoutId: layoutGeometry.layoutId,
    layoutAudit: renderedLayoutAudit,
    paletteAudit: palette.contrastAudit,
    eventTextAudit,
  };
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
  const artworkWidth = Math.round(320 * (scene.frame.width / scene.frame.height));
  const [sceneBuffer, artwork] = await Promise.all([
    loadScene(plan.sceneId, dependencies),
    renderArtwork(candidate, assets, sharpImpl, { ...dependencies, artworkWidth }),
  ]);
  const fittedArtwork = await sharpImpl(artwork.buffer)
    .resize(scene.frame.width, scene.frame.height, { fit: 'fill', kernel: sharpImpl.kernel.lanczos3 })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer();
  const buffer = await sharpImpl(sceneBuffer, { failOn: 'none', limitInputPixels: 24_000_000 })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'fill' })
    .composite([{ input: fittedArtwork, left: scene.frame.left, top: scene.frame.top }])
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
  return {
    buffer,
    plan,
    mimeType: 'image/jpeg',
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    compositionAudit: artwork.compositionAudit,
    logoCompositionAudit: artwork.logoCompositionAudit,
    layoutId: artwork.layoutId,
    layoutAudit: artwork.layoutAudit,
    paletteAudit: artwork.paletteAudit,
    eventTextAudit: artwork.eventTextAudit,
  };
}

async function blobBuffer(store, key, signal) {
  if (!store || !key) return null;
  try {
    assertMockupNotAborted({ signal });
    const value = await store.get(key, { type: 'arrayBuffer' });
    assertMockupNotAborted({ signal });
    return value ? Buffer.from(value) : null;
  } catch (error) {
    if (signal?.aborted) throw mockupDeadlineError();
    return null;
  }
}

async function loadVerifiedStoredMockup(candidate, store, sharpImpl, signal) {
  const mockup = candidate?.mockup;
  const audit = mockup?.generationMetadata?.compositionAudit || null;
  const storedLogoAudit = mockup?.generationMetadata?.logoCompositionAudit || null;
  const storedLayoutId = mockup?.generationMetadata?.layoutId || null;
  const storedLayoutAudit = mockup?.generationMetadata?.layoutAudit || null;
  const storedPaletteAudit = mockup?.generationMetadata?.paletteAudit || null;
  const storedBlobAudit = mockup?.generationMetadata?.blobBindingAudit || null;
  if (!repository.strictCompanyMockupReady({
    prospectId: candidate?.prospect?.id,
    status: mockup?.status,
    renderVersion: mockup?.renderVersion,
    contentHash: mockup?.contentHash,
    blobKey: mockup?.blobKey,
    logoUrl: mockup?.logoUrl,
    productImageUrl: mockup?.productImageUrl,
    qualityLevel: mockup?.qualityLevel,
    messageId: mockup?.messageId,
    expectedMessageId: candidate?.message?.id,
    expectedMessageContentHash: candidate?.message?.contentHash,
    generationMetadata: mockup?.generationMetadata,
  }, RENDER_VERSION)) return null;
  const buffer = await blobBuffer(store, mockup.blobKey, signal);
  if (!buffer || typeof sharpImpl !== 'function') return null;
  try {
    const metadata = await sharpImpl(buffer, { failOn: 'error', limitInputPixels: 24_000_000 }).metadata();
    if (metadata.format !== 'jpeg' || metadata.width !== OUTPUT_WIDTH || metadata.height !== OUTPUT_HEIGHT
        || sha256(buffer) !== storedBlobAudit.expectedContentHash) return null;
  } catch {
    return null;
  }
  return {
    prospectId: candidate.prospect.id,
    buffer,
    plan: {
      sceneId: mockup.sceneId,
      layoutId: storedLayoutId,
      eventLabel: mockup.eventLabel,
      logoUrl: mockup.logoUrl,
      productImageUrl: mockup.productImageUrl,
      messageContentHash: mockup.generationMetadata.messageContentHash,
      sourceUrls: mockup.sourceUrls,
      contentHash: mockup.contentHash,
    },
    mimeType: 'image/jpeg',
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    qualityLevel: mockup.qualityLevel,
    compositionAudit: audit,
    logoCompositionAudit: storedLogoAudit,
    layoutId: storedLayoutId,
    layoutAudit: storedLayoutAudit,
    paletteAudit: storedPaletteAudit,
    blobBindingAudit: storedBlobAudit,
    sendReady: true,
    diagnostics: mockup.generationMetadata?.assetDiagnostics || [],
    cached: true,
    row: mockup,
  };
}

async function prepareCompanyMockup(options) {
  const dependencies = {
    ...repository,
    fetchPage: fetchWebsitePage,
    fetchAsset: fetchWebsiteAsset,
    ...options.dependencies,
  };
  assertMockupNotAborted(dependencies);
  const candidate = options.candidate || await dependencies.loadCompanyMockupCandidate(options.sql, options.prospectId);
  assertMockupNotAborted(dependencies);
  if (!candidate?.prospect?.id) {
    const error = new Error('Company mockup prospect was not found.');
    error.code = 'COMPANY_MOCKUP_NOT_FOUND';
    throw error;
  }
  if (options.preferCachedReady === true) {
    const stored = await loadVerifiedStoredMockup(candidate, options.store, options.sharp, dependencies.signal);
    if (stored) return stored;
  }
  const candidateAssets = await discoverAssetCandidates(candidate, dependencies);
  assertMockupNotAborted(dependencies);
  const selectedScene = SCENES[selectSceneId(candidate)] || SCENES.storefront;
  const selectedArtworkWidth = Math.max(860, Math.min(1120, Math.round(320 * (selectedScene.frame.width / selectedScene.frame.height))));
  const [logoResult, productResult] = await Promise.all([
    fetchBestValid(candidateAssets.logos, dependencies, options.sharp, 'logo'),
    fetchBestValid(
      candidateAssets.images.filter((asset) => !candidateAssets.logos.some((logoAsset) => logoAsset.url === asset.url)),
      dependencies,
      options.sharp,
      'product',
      { artworkWidth: selectedArtworkWidth, panelHeight: PRODUCT_PANEL_HEIGHT },
    ),
  ]);
  assertMockupNotAborted(dependencies);
  const logo = logoResult.asset;
  const product = productResult.asset;
  const assets = {
    logo,
    product,
    profile: candidateAssets.profile,
    pageUrls: candidateAssets.pageUrls,
  };
  const plan = planFor(candidate, assets);
  const expectedBlobKey = `company-banners/${candidate.prospect.id}/${plan.contentHash}.jpg`;
  if (!options.force && options.preferCachedReady !== true
      && candidate.mockup?.contentHash === plan.contentHash
      && candidate.mockup.blobKey === expectedBlobKey) {
    const verifiedCached = await loadVerifiedStoredMockup(
      candidate, options.store, options.sharp, dependencies.signal,
    );
    if (verifiedCached) return { ...verifiedCached, plan };
  }

  assertMockupNotAborted(dependencies);
  const rendered = await renderCompanyMockup(candidate, assets, { ...dependencies, sharp: options.sharp });
  assertMockupNotAborted(dependencies);
  const level = qualityLevel(logo, product);
  const compositionAudit = rendered.compositionAudit;
  const renderedLogoAudit = rendered.logoCompositionAudit;
  const renderedLayoutAudit = rendered.layoutAudit;
  const renderedPaletteAudit = rendered.paletteAudit;
  const renderedEventTextAudit = rendered.eventTextAudit;
  const presentationReady = level === 'logo_and_product'
    && compositionAudit?.passed === true
    && compositionAudit?.noClipGuaranteed === true
    && compositionAudit?.noUpscaleGuaranteed === true
    && renderedLogoAudit?.passed === true
    && renderedLogoAudit?.noClipGuaranteed === true
    && renderedLogoAudit?.noRasterUpscaleGuaranteed === true
    && Boolean(MOCKUP_LAYOUTS[rendered.layoutId])
    && renderedLayoutAudit?.passed === true
    && renderedLayoutAudit?.noOverlapGuaranteed === true
    && renderedPaletteAudit?.passed === true
    && Number(renderedPaletteAudit?.primaryWhiteContrast) >= MIN_WHITE_TEXT_CONTRAST
    && Number(renderedPaletteAudit?.secondaryWhiteContrast) >= MIN_WHITE_TEXT_CONTRAST
    && renderedEventTextAudit?.passed === true
    && renderedEventTextAudit?.completeTextPreserved === true
    && product?.selectionAudit?.passed === true
    && logo?.qualityAudit?.passed === true
    && product?.qualityAudit?.passed === true;
  const assetDiagnostics = [
    ...(candidateAssets.diagnostics || []),
    ...(logoResult.attempts || []),
    ...(productResult.attempts || []),
  ].slice(0, 30);
  const blobKey = `company-banners/${candidate.prospect.id}/${plan.contentHash}.jpg`;
  const expectedBlobHash = sha256(rendered.buffer);
  let persistedBlobHash = null;
  let blobBindingErrorCode = options.store ? null : 'MOCKUP_BLOB_STORE_UNAVAILABLE';
  let storedKey = null;
  if (options.store) {
    try {
      assertMockupNotAborted(dependencies);
      await options.store.set(blobKey, rendered.buffer, {
        metadata: {
          contentType: 'image/jpeg',
          prospectId: candidate.prospect.id,
          renderVersion: RENDER_VERSION,
          qualityLevel: level,
          contentHash: expectedBlobHash,
        },
      });
      assertMockupNotAborted(dependencies);
      const persisted = await blobBuffer(options.store, blobKey, dependencies.signal);
      persistedBlobHash = persisted ? sha256(persisted) : null;
      if (persistedBlobHash === expectedBlobHash) storedKey = blobKey;
      else blobBindingErrorCode = 'MOCKUP_BLOB_READBACK_MISMATCH';
    } catch (error) {
      if (dependencies.signal?.aborted) throw mockupDeadlineError();
      blobBindingErrorCode = 'MOCKUP_BLOB_PERSISTENCE_FAILED';
    }
  }
  const blobBindingAudit = {
    passed: storedKey === blobKey,
    blobKey: storedKey,
    expectedContentHash: expectedBlobHash,
    persistedContentHash: persistedBlobHash,
    strongReadBackVerified: storedKey === blobKey,
  };
  if (!blobBindingAudit.passed) {
    assetDiagnostics.push({ stage: 'blob_persistence', hostname: null, code: blobBindingErrorCode });
  }
  const sendReady = presentationReady && blobBindingAudit.passed;
  assertMockupNotAborted(dependencies);
  const row = await dependencies.saveCompanyMockup(options.sql, {
    prospectId: candidate.prospect.id,
    messageId: candidate.message?.id,
    status: sendReady ? 'ready' : 'fallback',
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
      sendReady,
      brandHeadline: plan.brandCopy.headline,
      brandOffering: plan.brandCopy.offering,
      brandThemeColors: plan.brandCopy.themeColors,
      boothLabel: plan.boothLabel,
      messageContentHash: candidate.message?.contentHash || null,
      compositionAudit,
      logoCompositionAudit: renderedLogoAudit,
      layoutId: rendered.layoutId,
      layoutAudit: renderedLayoutAudit,
      paletteAudit: renderedPaletteAudit,
      eventTextAudit: renderedEventTextAudit,
      blobBindingAudit,
      logoQualityAudit: logo?.qualityAudit || null,
      productQualityAudit: product?.qualityAudit || null,
      productSelectionAudit: product?.selectionAudit || null,
      assetCandidateCounts: {
        logos: candidateAssets.logos.length,
        images: candidateAssets.images.length,
        pages: candidateAssets.pageUrls.length,
      },
      assetDiagnostics,
      cidReady: true,
    },
    lastErrorCode: sendReady ? null : presentationReady && !blobBindingAudit.passed
      ? blobBindingErrorCode
      : logo && product
      ? 'MOCKUP_PRESENTATION_QUALITY_UNSAFE'
      : !logo && !product
      ? 'VERIFIED_BRAND_ASSETS_UNAVAILABLE'
      : !logo ? 'VERIFIED_LOGO_UNAVAILABLE' : 'VERIFIED_PRODUCT_IMAGE_UNAVAILABLE',
  });
  return {
    prospectId: candidate.prospect.id,
    ...rendered,
    qualityLevel: level,
    compositionAudit,
    blobBindingAudit,
    sendReady,
    diagnostics: assetDiagnostics,
    cached: false,
    row,
  };
}

function attachmentFromMockup(mockup, businessName) {
  if (!mockup?.buffer) return null;
  const filename = `${cleanLabel(businessName, 50).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company'}-quick-banner-mockup.jpg`;
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
  MOCKUP_FONT_FILE,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  PRODUCT_PANEL_WIDTH,
  PRODUCT_PANEL_HEIGHT,
  PRODUCT_SAFE_PADDING,
  MIN_WHITE_TEXT_CONTRAST,
  SCENES,
  MOCKUP_LAYOUTS,
  selectMockupLayoutId,
  mockupLayoutGeometry,
  sha256,
  cleanLabel,
  selectSceneId,
  eventLabel,
  boothLabel,
  eventIsGrounded,
  storedAssetCandidates,
  discoverAssetCandidates,
  safeSvg,
  validatedAsset,
  productCompositionAudit,
  logoCompositionAudit,
  productCandidateAudit,
  productPresentationScore,
  productAssetIsRelevant,
  fetchBestValid,
  officialAliasLinks,
  planFor,
  qualityLevel,
  selectBrandCopy,
  relativeLuminance,
  whiteTextContrastRatio,
  ensureWhiteTextContrast,
  paletteContrastAudit,
  resolveBrandPalette,
  logoCardStyle,
  loadMockupFont,
  footerTextLayout,
  vectorTextPaths,
  renderProductPanel,
  renderArtwork,
  renderCompanyMockup,
  loadVerifiedStoredMockup,
  prepareCompanyMockup,
  attachmentFromMockup,
};
