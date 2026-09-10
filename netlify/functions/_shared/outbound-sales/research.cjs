'use strict';

const crypto = require('node:crypto');
const { canonicalDomain } = require('./providers/contract.cjs');
const { extractPublicEmails } = require('./email.cjs');
const { fetchWebsitePage } = require('./ssrf.cjs');

const EXTRACTION_VERSION = 'deterministic-html-v5-brand-product-evidence';
const MAX_RESEARCH_PAGES = 5;
const SIGNAL_DEFINITIONS = Object.freeze([
  { code: 'upcoming_events', label: 'Upcoming event activity', pattern: /\b(upcoming event|event calendar|register now|save the date|festival|conference|tournament|fundraiser|gala)\b/i },
  { code: 'hiring_or_expansion', label: 'Hiring or expansion activity', pattern: /\b(now hiring|join our team|career opportunities|we(?:'|’)re hiring|new location|expanding|expansion|coming soon)\b/i },
  { code: 'promotions_or_grand_openings', label: 'Promotion or grand-opening activity', pattern: /\b(grand opening|reopening|special offer|limited time|promotion|anniversary sale|open house)\b/i },
  { code: 'real_estate_activity', label: 'Real-estate activity', pattern: /\b(open house|property listing|homes? for sale|commercial real estate|realtor|realty|leasing|new development)\b/i },
  { code: 'construction_activity', label: 'Construction activity', pattern: /\b(construction|general contractor|groundbreaking|jobsite|building project|renovation|remodeling|development project)\b/i },
  { code: 'community_or_event_activity', label: 'School, church, nonprofit, sports, or community activity', pattern: /\b(school|academy|church|ministry|nonprofit|foundation|community center|sports club|athletics|little league|booster club|charity)\b/i },
  { code: 'visible_print_marketing_need', label: 'Visible sign, banner, display, or print need', pattern: /\b(banner|signage|signs|trade show|exhibit|display|sponsor(?:ship)?|step and repeat|printed marketing|wayfinding|yard signs?)\b/i },
]);
const LINK_PRIORITY = Object.freeze([
  ['products', /\b(product|shop|collection|catalog|menu|portfolio|gallery)s?\b/i],
  ['events', /\b(event|calendar|festival|conference|tournament|fundraiser|gala)s?\b/i],
  ['news', /\b(news|blog|press|updates?)\b/i],
  ['growth', /\b(careers?|jobs?|locations?|coming-soon|grand-opening)\b/i],
  ['services', /\b(services?|programs?|projects?|portfolio)\b/i],
  ['contact', /\b(contact|about)\b/i],
]);

const CAMPAIGN_ART_PATTERN = /\b(?:campaign|hero|masthead|cover|lookbook|editorial|advert|promo|social|banner|wordmark|brand[-_ ]?lockup|typograph|text[-_ ]?overlay|announcement|sale[-_ ]?graphic|desktop[-_ ]?hero|mobile[-_ ]?hero)\b/i;
const PRODUCT_PHOTO_PATTERN = /\b(?:product(?:[-_ ]?(?:image|photo|media|card|gallery|tile))?|pdp|sku|item[-_ ]?(?:image|photo)|collection[-_ ]?(?:item|product)|woocommerce[-_ ]?(?:product|gallery)|footwear|shoe|boot|sneaker|sandal|loafer|bag|apparel)\b/i;
const SERVICE_PHOTO_PATTERN = /\b(?:project|portfolio|case[-_ ]?stud(?:y|ies)|installation|before[-_ ]?and[-_ ]?after|service[-_ ]?(?:image|photo)|gallery[-_ ]?(?:image|photo)|property|vehicle|equipment|menu[-_ ]?item|dish)\b/i;

function pageAssetRole(value) {
  let pathname = '';
  try { pathname = new URL(value).pathname.toLowerCase(); } catch { pathname = String(value || '').toLowerCase(); }
  const normalized = pathname.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ');
  if (/\/(?:products?|items?|p)\/[^/]+\/?$/i.test(pathname)
      && !/\/(?:products?|items?)\/(?:all|new|featured|collections?)\/?$/i.test(pathname)) return 'product_detail';
  if (/\/(?:collections?|catalog|shop|store|products?|menu)(?:\/|$)/i.test(pathname)) return 'product_collection';
  if (/\/(?:projects?|portfolio|work|case[-_ ]?stud(?:y|ies)|gallery)(?:\/|$)/i.test(pathname)) return 'portfolio';
  if (/\/(?:services?|solutions?|programs?)(?:\/|$)/i.test(pathname)) return 'service';
  if (!normalized.replace(/\//g, '').trim()) return 'homepage';
  return 'other';
}

function imageEvidence(candidate, baseUrl) {
  const pageRole = pageAssetRole(baseUrl);
  const marker = `${candidate.alt || ''} ${candidate.marker || ''} ${candidate.url || ''}`;
  const productEvidence = PRODUCT_PHOTO_PATTERN.test(marker)
    || pageRole === 'product_detail' || pageRole === 'product_collection';
  const serviceEvidence = SERVICE_PHOTO_PATTERN.test(marker)
    || pageRole === 'portfolio' || pageRole === 'service';
  const campaignEvidence = candidate.origin === 'social_meta'
    || candidate.likelyPrecomposed === true || CAMPAIGN_ART_PATTERN.test(marker);
  let assetRole = 'general_photo';
  if (campaignEvidence && !((productEvidence || serviceEvidence) && candidate.origin === 'html_image'
      && !CAMPAIGN_ART_PATTERN.test(`${candidate.alt || ''} ${candidate.marker || ''}`))) assetRole = 'campaign_art';
  else if (productEvidence) assetRole = 'product_photo';
  else if (serviceEvidence) assetRole = 'service_photo';
  const roleBonus = {
    product_detail: 96,
    product_collection: 72,
    portfolio: 76,
    service: 62,
    homepage: 0,
    other: 8,
  }[pageRole] || 0;
  const assetBonus = { product_photo: 92, service_photo: 82, general_photo: 0, campaign_art: -135 }[assetRole] || 0;
  return {
    pageRole,
    assetRole,
    selectionScore: Number(candidate.score || 0) + roleBonus + assetBonus,
    cleanProductEvidence: ['product_photo', 'service_photo'].includes(assetRole),
    likelyPrecomposed: assetRole === 'campaign_art',
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'" };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10;
      const number = Number.parseInt(entity.slice(radix === 16 ? 2 : 1), radix);
      return Number.isInteger(number) && number >= 9 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
    }
    return named[entity.toLowerCase()] ?? ' ';
  });
}

function normalizeText(value) {
  return decodeEntities(value)
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 250000);
}

function textFromHtml(html) {
  return normalizeText(String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|canvas|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/section|\/article|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

function attribute(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function titleFromHtml(html) {
  const match = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  return normalizeText(match?.[1] || '').slice(0, 300) || null;
}

function descriptionFromHtml(html) {
  for (const tag of String(html || '').match(/<meta\b[^>]*>/gi) || []) {
    const name = (attribute(tag, 'name') || attribute(tag, 'property')).toLowerCase();
    if (['description', 'og:description', 'twitter:description'].includes(name)) {
      const content = normalizeText(attribute(tag, 'content')).slice(0, 600);
      if (content) return content;
    }
  }
  return null;
}

function publicAssetUrl(value, baseUrl) {
  try {
    const url = new URL(decodeEntities(value), baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function imageSource(tag) {
  const srcset = attribute(tag, 'srcset') || attribute(tag, 'data-srcset');
  if (srcset) {
    const candidates = srcset.split(',').map((entry, index) => {
      const [url, descriptor = ''] = entry.trim().split(/\s+/);
      const width = /^(\d+)w$/i.exec(descriptor);
      const density = /^(\d+(?:\.\d+)?)x$/i.exec(descriptor);
      return {
        url,
        score: width ? Number(width[1]) : density ? Number(density[1]) * 1000 : index,
      };
    }).filter((entry) => entry.url && !entry.url.startsWith('data:'));
    const strongest = candidates.sort((left, right) => right.score - left.score)[0];
    if (strongest?.url) return strongest.url;
  }
  const direct = attribute(tag, 'src') || attribute(tag, 'data-src') || attribute(tag, 'data-lazy-src');
  return direct && !direct.startsWith('data:') ? direct : '';
}

function validBrandColor(value) {
  const match = String(value || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  if (match[1].length === 3) return `#${match[1].split('').map((character) => character.repeat(2)).join('')}`.toLowerCase();
  return `#${match[1].toLowerCase()}`;
}

function brandLine(value, maxLength = 160) {
  const line = normalizeText(String(value || '').replace(/<[^>]+>/g, ' ')).slice(0, maxLength);
  if (line.length < 4 || /^(?:home|welcome|shop|menu|search|learn more|read more)$/i.test(line)) return null;
  if (/cookie|privacy preference|javascript|sign in|log in|subscribe/i.test(line)) return null;
  return line;
}

function extractBrandProfile(html) {
  const source = String(html || '');
  const themeColors = [];
  const taglineCandidates = [];
  const offeringCandidates = [];
  const addUnique = (collection, value) => {
    if (value && !collection.some((existing) => existing.toLowerCase() === value.toLowerCase())) collection.push(value);
  };

  addUnique(taglineCandidates, brandLine(titleFromHtml(source), 120));

  for (const tag of source.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attribute(tag, 'property') || attribute(tag, 'name')).toLowerCase();
    const content = attribute(tag, 'content');
    if (key === 'theme-color') addUnique(themeColors, validBrandColor(content));
    if (['description', 'og:description', 'twitter:description'].includes(key)) {
      const line = brandLine(content);
      addUnique(taglineCandidates, line);
      addUnique(offeringCandidates, line);
    }
  }
  for (const match of source.matchAll(/"(?:slogan|tagline)"\s*:\s*"([^"\\]{4,180})"/gi)) {
    addUnique(taglineCandidates, brandLine(decodeEntities(match[1])));
  }
  for (const match of source.matchAll(/<h([12])\b[^>]*>([\s\S]{0,500}?)<\/h\1\s*>/gi)) {
    addUnique(taglineCandidates, brandLine(match[2], 120));
  }
  for (const match of source.matchAll(/<(?:p|div)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:tagline|slogan|hero[_ -]?(?:copy|text|title|subtitle))[^"']*["'][^>]*>([\s\S]{0,700}?)<\/(?:p|div)\s*>/gi)) {
    addUnique(taglineCandidates, brandLine(match[1], 120));
  }
  return {
    themeColors: themeColors.slice(0, 6),
    taglineCandidates: taglineCandidates.slice(0, 12),
    offeringCandidates: offeringCandidates.slice(0, 12),
  };
}

function extractBrandAssets(html, baseUrl) {
  const logoCandidates = [];
  const imageCandidates = [];
  const seen = new Map();
  const add = (collection, candidate) => {
    const url = publicAssetUrl(candidate.url, baseUrl);
    if (!url) return;
    const evidence = candidate.kind === 'product' ? imageEvidence({ ...candidate, url }, baseUrl) : {
      pageRole: pageAssetRole(baseUrl),
    };
    const next = {
      url,
      kind: candidate.kind,
      score: candidate.score,
      alt: normalizeText(candidate.alt || '').slice(0, 180) || null,
      sourceUrl: baseUrl,
      origin: candidate.origin || 'unknown',
      marker: normalizeText(candidate.marker || '').slice(0, 260) || null,
      declaredWidth: Math.max(0, Number(candidate.declaredWidth) || 0),
      declaredHeight: Math.max(0, Number(candidate.declaredHeight) || 0),
      likelyPrecomposed: candidate.likelyPrecomposed === true,
      ...evidence,
    };
    const key = `${candidate.kind}:${url}`;
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, collection.length);
      collection.push(next);
      return;
    }
    const existing = collection[existingIndex];
    const preferred = Number(next.selectionScore ?? next.score ?? 0) > Number(existing.selectionScore ?? existing.score ?? 0)
      ? next : existing;
    collection[existingIndex] = {
      ...existing,
      ...preferred,
      score: Math.max(Number(existing.score || 0), Number(next.score || 0)),
      selectionScore: Math.max(Number(existing.selectionScore ?? existing.score ?? 0), Number(next.selectionScore ?? next.score ?? 0)),
      alt: [existing.alt, next.alt].filter(Boolean).sort((left, right) => right.length - left.length)[0] || null,
      marker: normalizeText([existing.marker, next.marker].filter(Boolean).join(' ')).slice(0, 260) || null,
      declaredWidth: Math.max(existing.declaredWidth || 0, next.declaredWidth || 0),
      declaredHeight: Math.max(existing.declaredHeight || 0, next.declaredHeight || 0),
      cleanProductEvidence: existing.cleanProductEvidence === true || next.cleanProductEvidence === true,
      // A product image seen both in social metadata and in clean product markup
      // is not treated as campaign artwork merely because the metadata appeared first.
      likelyPrecomposed: existing.likelyPrecomposed === true && next.likelyPrecomposed === true,
      assetRole: existing.cleanProductEvidence === true || next.cleanProductEvidence === true
        ? (next.assetRole === 'product_photo' || existing.assetRole === 'product_photo' ? 'product_photo' : 'service_photo')
        : preferred.assetRole,
    };
  };

  for (const tag of String(html || '').match(/<meta\b[^>]*>/gi) || []) {
    const property = (attribute(tag, 'property') || attribute(tag, 'name')).toLowerCase();
    const content = attribute(tag, 'content');
    if (!content) continue;
    if (['og:logo', 'logo'].includes(property)) add(logoCandidates, {
      url: content, kind: 'logo', score: 120, origin: 'social_meta', marker: property,
    });
    if (['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(property)) {
      if (/\b(?:logo|brandmark|wordmark)\b/i.test(content)) {
        add(logoCandidates, {
          url: content, kind: 'logo', score: property.startsWith('og:') ? 125 : 115,
          origin: 'social_meta', marker: property,
        });
      } else {
        add(imageCandidates, {
          url: content, kind: 'product', score: property.startsWith('og:') ? 115 : 105,
          origin: 'social_meta', marker: property, likelyPrecomposed: true,
        });
      }
    }
  }

  for (const tag of String(html || '').match(/<link\b[^>]*>/gi) || []) {
    const rel = attribute(tag, 'rel').toLowerCase();
    const href = attribute(tag, 'href');
    if (href && /(?:apple-touch-icon|mask-icon)/i.test(rel)) {
      add(logoCandidates, {
        url: href, kind: 'logo', score: /apple-touch-icon/i.test(rel) ? 64 : 58,
        alt: rel, origin: 'link_icon', marker: rel,
      });
    }
  }

  for (const match of String(html || '').matchAll(/"logo"\s*:\s*(?:\{[^{}]{0,600}?"url"\s*:\s*)?"([^"]+)"/gi)) {
    add(logoCandidates, {
      url: match[1], kind: 'logo', score: 130, origin: 'structured_data', marker: 'logo',
    });
  }
  for (const match of String(html || '').matchAll(/"image"\s*:\s*(?:\{[^{}]{0,600}?"url"\s*:\s*)?"([^"]+)"/gi)) {
    add(imageCandidates, {
      url: match[1], kind: 'product', score: 105, origin: 'structured_data', marker: 'image',
    });
  }

  for (const tag of String(html || '').match(/<img\b[^>]*>/gi) || []) {
    const src = imageSource(tag);
    if (!src) continue;
    const alt = attribute(tag, 'alt');
    const marker = `${alt} ${attribute(tag, 'class')} ${attribute(tag, 'id')} ${src}`;
    const width = Number(attribute(tag, 'width')) || 0;
    const height = Number(attribute(tag, 'height')) || 0;
    if (/\b(?:logo|brandmark|site-logo|header-logo)\b/i.test(marker)) {
      add(logoCandidates, {
        url: src, kind: 'logo', score: 100 + (/\blogo\b/i.test(alt) ? 10 : 0), alt,
        origin: 'html_image', marker, declaredWidth: width, declaredHeight: height,
      });
      continue;
    }
    const tiny = width > 0 && height > 0 && (width < 240 || height < 140);
    const decorative = /\b(?:icon|avatar|badge|sprite|pixel|tracking|spacer|flag|language|payment|newsletter|footer|placeholder|loading|blank)\b/i.test(marker);
    if (!tiny && !decorative) {
      const hero = /\b(?:hero|masthead|cover|campaign|banner)\b/i.test(marker);
      const product = /\b(?:product|service|collection|project|portfolio|featured|showcase|footwear|shoe|boot|sneaker|sandal|loafer|bag|apparel|menu|dish|property|home|vehicle|equipment)\b/i.test(marker);
      const large = width >= 700 || height >= 500;
      const score = 50 + (hero ? 48 : 0) + (product ? 34 : 0) + (large ? 10 : 0);
      add(imageCandidates, {
        url: src, kind: 'product', score, alt, origin: 'html_image', marker,
        declaredWidth: width, declaredHeight: height, likelyPrecomposed: hero,
      });
    }
  }

  const byScore = (left, right) => Number(right.selectionScore ?? right.score ?? 0) - Number(left.selectionScore ?? left.score ?? 0)
    || right.score - left.score || left.url.localeCompare(right.url);
  return {
    logoCandidates: logoCandidates.sort(byScore).slice(0, 8),
    imageCandidates: imageCandidates.sort(byScore).slice(0, 16),
  };
}

function dateValues(html) {
  const values = [];
  for (const tag of String(html || '').match(/<time\b[^>]*>/gi) || []) {
    const value = attribute(tag, 'datetime');
    if (value) values.push(value);
  }
  for (const match of String(html || '').matchAll(/"(?:datePublished|dateModified|startDate|endDate)"\s*:\s*"([^"]{4,80})"/gi)) {
    values.push(match[1]);
  }
  return values.slice(0, 50);
}

function freshnessScore(html, now = new Date()) {
  const dates = dateValues(html)
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()) && value <= new Date(now.getTime() + (370 * 24 * 60 * 60 * 1000)))
    .sort((left, right) => right.getTime() - left.getTime());
  if (!dates.length) return 20;
  const days = Math.max(0, (now.getTime() - dates[0].getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 90) return 100;
  if (days <= 180) return 80;
  if (days <= 365) return 60;
  if (days <= 730) return 35;
  return 15;
}

function evidenceSnippet(text, match) {
  const start = Math.max(0, match.index - 70);
  return text.slice(start, Math.min(text.length, match.index + match[0].length + 110)).trim().slice(0, 240);
}

function detectSignals(text, sourceUrl) {
  const result = [];
  for (const definition of SIGNAL_DEFINITIONS) {
    const match = definition.pattern.exec(text);
    if (match) {
      result.push({
        code: definition.code,
        label: definition.label,
        sourceUrl,
        evidence: evidenceSnippet(text, match),
      });
    }
  }
  return result;
}

function extractLinks(html, baseUrl) {
  const baseDomain = canonicalDomain(baseUrl);
  const results = [];
  for (const tag of String(html || '').match(/<a\b[^>]*>/gi) || []) {
    const href = attribute(tag, 'href');
    if (!href || /^(?:mailto|tel|javascript|data):/i.test(href)) continue;
    try {
      const url = new URL(href, baseUrl);
      url.hash = '';
      if (!['http:', 'https:'].includes(url.protocol) || canonicalDomain(url.toString()) !== baseDomain) continue;
      if (/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(url.pathname)) continue;
      results.push(url.toString());
    } catch {
      // Ignore malformed public links.
    }
  }
  return [...new Set(results)].slice(0, 100);
}

function priorityLinks(links) {
  const ranked = links.map((url) => {
    const path = new URL(url).pathname.replace(/[-_/]+/g, ' ');
    const index = LINK_PRIORITY.findIndex(([, pattern]) => pattern.test(path));
    const pageRole = pageAssetRole(url);
    const roleOffset = {
      product_detail: -35,
      portfolio: -25,
      product_collection: -20,
      service: -10,
      other: 0,
      homepage: 20,
    }[pageRole] || 0;
    const utilityPenalty = /\b(?:account|login|sign in|cart|checkout|policy|privacy|terms|search)\b/i.test(path) ? 1000 : 0;
    return { url, priority: index === -1 ? 999 : (index * 100) + roleOffset + utilityPenalty };
  }).filter((entry) => entry.priority < 999);
  return ranked.sort((left, right) => left.priority - right.priority || left.url.localeCompare(right.url)).map((entry) => entry.url);
}

function strongestUniqueAssets(assets, limit, scoreKey = 'score') {
  const byUrl = new Map();
  for (const asset of assets) {
    const existing = byUrl.get(asset.url);
    const valueScore = Number(asset?.[scoreKey] ?? asset?.score ?? 0);
    const existingScore = Number(existing?.[scoreKey] ?? existing?.score ?? -Infinity);
    if (!existing || valueScore > existingScore) byUrl.set(asset.url, asset);
  }
  return [...byUrl.values()]
    .sort((left, right) => Number(right?.[scoreKey] ?? right?.score ?? 0) - Number(left?.[scoreKey] ?? left?.score ?? 0)
      || Number(right?.score || 0) - Number(left?.score || 0) || left.url.localeCompare(right.url))
    .slice(0, limit);
}

function inferredLocationCount(text) {
  const match = text.match(/\b(\d{1,3})\s+(?:office|store|branch|campus|venue|location)s?\b/i);
  const count = Number(match?.[1]);
  return Number.isInteger(count) && count > 0 && count < 1000 ? count : null;
}

function pageExtraction(response) {
  const text = textFromHtml(response.body);
  const publicMarkup = String(response.body || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|canvas|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const emails = extractPublicEmails(publicMarkup).map((email) => ({ email, sourceUrl: response.finalUrl }));
  const signals = detectSignals(text, response.finalUrl);
  return {
    url: response.finalUrl,
    status: response.status,
    contentType: response.contentType,
    bytes: response.bytes,
    etag: response.etag,
    lastModified: response.lastModified,
    title: titleFromHtml(response.body),
    description: descriptionFromHtml(response.body),
    textHash: sha256(text.toLowerCase()),
    freshnessScore: freshnessScore(response.body),
    inferredLocationCount: inferredLocationCount(text),
    emails,
    signals,
    brandAssets: extractBrandAssets(response.body, response.finalUrl),
    brandProfile: extractBrandProfile(response.body),
    links: extractLinks(response.body, response.finalUrl),
  };
}

function safePreviousManifest(previousSnapshot) {
  if (previousSnapshot?.extractionVersion !== EXTRACTION_VERSION || !Array.isArray(previousSnapshot?.pageManifest)) return [];
  return previousSnapshot.pageManifest.filter((page) => page && typeof page.url === 'string').slice(0, MAX_RESEARCH_PAGES);
}

async function researchWebsite(options) {
  const fetchPage = options.fetchPage || fetchWebsitePage;
  const websiteUrl = String(options.websiteUrl || '');
  const previousSnapshot = options.previousSnapshot || null;
  const previousManifest = safePreviousManifest(previousSnapshot);
  const previousByUrl = new Map(previousManifest.map((page) => [page.url, page]));
  const pages = [];
  let reusedResponses = 0;

  async function fetchAndExtract(url) {
    let normalizedUrl;
    try { normalizedUrl = new URL(url).toString(); } catch { normalizedUrl = url; }
    const previous = previousByUrl.get(normalizedUrl);
    const response = await fetchPage(normalizedUrl, {
      etag: previous?.etag,
      lastModified: previous?.lastModified,
      maxBytes: options.maxBytes,
      timeoutMs: options.timeoutMs,
    });
    if (response.notModified && previous) {
      reusedResponses += 1;
      return { ...previous, etag: response.etag || previous.etag, lastModified: response.lastModified || previous.lastModified };
    }
    return pageExtraction(response);
  }

  const home = await fetchAndExtract(websiteUrl);
  pages.push(home);
  const candidates = [...new Set([
    ...priorityLinks(home.links || []),
    ...previousManifest.slice(1).map((page) => page.url),
  ])].filter((url) => url !== home.url && canonicalDomain(url) === canonicalDomain(home.url));
  for (const url of candidates.slice(0, MAX_RESEARCH_PAGES - 1)) {
    try {
      pages.push(await fetchAndExtract(url));
    } catch (error) {
      if (typeof options.onPageError === 'function') options.onPageError(error, url);
    }
  }

  const stablePages = pages.map((page) => ({
    url: page.url,
    status: page.status,
    contentType: page.contentType,
    bytes: page.bytes,
    etag: page.etag || null,
    lastModified: page.lastModified || null,
    title: page.title || null,
    description: page.description || null,
    textHash: page.textHash,
    freshnessScore: page.freshnessScore,
    inferredLocationCount: page.inferredLocationCount || null,
    emails: (page.emails || []).slice(0, 20),
    signals: (page.signals || []).slice(0, 20),
    brandAssets: {
      logoCandidates: (page.brandAssets?.logoCandidates || []).slice(0, 8),
      imageCandidates: (page.brandAssets?.imageCandidates || []).slice(0, 16),
    },
    brandProfile: {
      themeColors: (page.brandProfile?.themeColors || []).slice(0, 6),
      taglineCandidates: (page.brandProfile?.taglineCandidates || []).slice(0, 12),
      offeringCandidates: (page.brandProfile?.offeringCandidates || []).slice(0, 12),
    },
    links: (page.links || []).slice(0, 100),
  }));
  const hashPayload = stablePages
    .map((page) => ({
      url: page.url,
      textHash: page.textHash,
      title: page.title,
      description: page.description,
      emails: page.emails.map((entry) => entry.email).sort(),
      signals: page.signals.map((signal) => ({ code: signal.code, evidence: signal.evidence })),
      brandAssets: page.brandAssets,
      brandProfile: page.brandProfile,
    }))
    .sort((left, right) => left.url.localeCompare(right.url));
  const contentHash = sha256(JSON.stringify({ extractionVersion: EXTRACTION_VERSION, pages: hashPayload }));
  const unchanged = previousSnapshot?.contentHash === contentHash && previousSnapshot?.extractionVersion === EXTRACTION_VERSION;
  const extractionChanged = Boolean(previousSnapshot && previousSnapshot.extractionVersion !== EXTRACTION_VERSION);
  const allSignals = stablePages.flatMap((page) => page.signals);
  const signals = [...new Map(allSignals.map((signal) => [signal.code, signal])).values()];
  const emails = [...new Map(stablePages.flatMap((page) => page.emails).map((entry) => [entry.email, entry])).values()];
  const freshness = Math.max(...stablePages.map((page) => Number(page.freshnessScore) || 0), 0);
  const locationCount = Math.max(...stablePages.map((page) => Number(page.inferredLocationCount) || 0), 0) || null;
  const logoCandidates = strongestUniqueAssets(stablePages.flatMap((page) => page.brandAssets.logoCandidates), 8);
  const imageCandidates = strongestUniqueAssets(stablePages.flatMap((page) => page.brandAssets.imageCandidates), 16, 'selectionScore');
  const themeColors = [...new Set(stablePages.flatMap((page) => page.brandProfile.themeColors))].slice(0, 6);
  const taglineCandidates = [...new Map(stablePages.flatMap((page) => page.brandProfile.taglineCandidates).map((line) => [line.toLowerCase(), line])).values()].slice(0, 12);
  const offeringCandidates = [...new Map(stablePages.flatMap((page) => page.brandProfile.offeringCandidates).map((line) => [line.toLowerCase(), line])).values()].slice(0, 12);

  return Object.freeze({
    contentHash,
    contentChanged: !unchanged,
    cacheStatus: extractionChanged ? 'invalidated' : unchanged ? 'reused' : 'fresh',
    extractionVersion: EXTRACTION_VERSION,
    websiteUrl,
    finalUrl: home.url,
    httpStatus: home.status,
    contentType: home.contentType,
    contentBytes: stablePages.reduce((sum, page) => sum + (Number(page.bytes) || 0), 0),
    httpEtag: home.etag || null,
    httpLastModified: home.lastModified || null,
    sourceUrls: stablePages.map((page) => page.url),
    extractedFacts: {
      title: home.title || null,
      description: home.description || null,
      inferredLocationCount: locationCount,
      pagesAnalyzed: stablePages.length,
      responsesReused: reusedResponses,
      brandAssets: { logoCandidates, imageCandidates },
      brandProfile: { themeColors, taglineCandidates, offeringCandidates },
    },
    evidence: signals.map((signal) => ({ code: signal.code, label: signal.label, evidence: signal.evidence, sourceUrl: signal.sourceUrl })),
    bannerNeedSignals: signals,
    websiteFreshnessScore: freshness,
    emailCandidates: emails,
    pageManifest: stablePages,
  });
}

module.exports = {
  EXTRACTION_VERSION,
  MAX_RESEARCH_PAGES,
  SIGNAL_DEFINITIONS,
  sha256,
  decodeEntities,
  normalizeText,
  textFromHtml,
  titleFromHtml,
  descriptionFromHtml,
  publicAssetUrl,
  imageSource,
  pageAssetRole,
  imageEvidence,
  extractBrandAssets,
  extractBrandProfile,
  freshnessScore,
  detectSignals,
  extractLinks,
  priorityLinks,
  researchWebsite,
};
