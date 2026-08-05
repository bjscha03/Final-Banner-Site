'use strict';

const crypto = require('node:crypto');
const { canonicalDomain } = require('./providers/contract.cjs');
const { extractPublicEmails } = require('./email.cjs');
const { fetchWebsitePage } = require('./ssrf.cjs');

const EXTRACTION_VERSION = 'deterministic-html-v1';
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
  ['events', /\b(event|calendar|festival|conference|tournament|fundraiser|gala)s?\b/i],
  ['news', /\b(news|blog|press|updates?)\b/i],
  ['growth', /\b(careers?|jobs?|locations?|coming-soon|grand-opening)\b/i],
  ['services', /\b(services?|programs?|projects?|portfolio)\b/i],
  ['contact', /\b(contact|about)\b/i],
]);

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
    return { url, priority: index === -1 ? 999 : index };
  }).filter((entry) => entry.priority < 999);
  return ranked.sort((left, right) => left.priority - right.priority || left.url.localeCompare(right.url)).map((entry) => entry.url);
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
  freshnessScore,
  detectSignals,
  extractLinks,
  priorityLinks,
  researchWebsite,
};
