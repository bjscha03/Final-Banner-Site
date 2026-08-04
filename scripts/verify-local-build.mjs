import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const distDir = path.join(process.cwd(), 'dist');
const manifest = JSON.parse(await readFile(path.join(distDir, 'local-page-manifest.json'), 'utf8'));
const sitemap = await readFile(path.join(distDir, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/\/$/, '')));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] || null;
}

function metaTags(html, attributeName, value) {
  return tags(html, 'meta').filter((tag) => attribute(tag, attributeName)?.toLowerCase() === value.toLowerCase());
}

function linkTags(html, relation) {
  return tags(html, 'link').filter((tag) => attribute(tag, 'rel')?.toLowerCase() === relation.toLowerCase());
}

function schemaNodes(html) {
  const scripts = [...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)];
  return scripts.flatMap((match) => {
    const parsed = JSON.parse(match[1]);
    const documents = Array.isArray(parsed) ? parsed : [parsed];
    return documents.flatMap((document) => document?.['@graph'] || [document]);
  });
}

assert(manifest.length === 64, `Expected 64 generated routes; found ${manifest.length}.`);
assert(new Set(manifest.map((entry) => entry.route)).size === manifest.length, 'Generated route manifest contains duplicates.');

for (const entry of manifest) {
  const filePath = path.join(distDir, entry.output);
  const html = await readFile(filePath, 'utf8');
  const canonicalUrl = `https://bannersonthefly.com${entry.route}`;
  const isLocal = /^\/(vinyl-banners|yard-signs|car-magnets)\/[^/]+$/.test(entry.route);

  assert(html.includes('data-prerendered="true"'), `${entry.route}: missing prerender marker.`);
  assert(html.includes('<h1'), `${entry.route}: missing crawlable H1.`);
  assert(html.length > 15_000, `${entry.route}: initial HTML appears to be an empty or thin shell.`);
  assert(!/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<a\b/i.test(html), `${entry.route}: nested link inside button found.`);
  assert(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/i.test(html), `${entry.route}: nested button inside link found.`);
  assert((html.match(/<title\b/gi) || []).length === 1, `${entry.route}: expected exactly one title.`);
  assert(metaTags(html, 'name', 'description').length === 1, `${entry.route}: expected exactly one meta description.`);
  assert(metaTags(html, 'name', 'robots').length === 1, `${entry.route}: expected exactly one robots directive.`);
  assert(metaTags(html, 'name', 'keywords').length === 0, `${entry.route}: obsolete meta keywords tag found.`);
  assert(metaTags(html, 'property', 'og:image').length === 1, `${entry.route}: expected exactly one OG image.`);
  assert(linkTags(html, 'canonical').length === 1, `${entry.route}: expected exactly one canonical.`);
  assert(attribute(linkTags(html, 'canonical')[0], 'href') === canonicalUrl, `${entry.route}: canonical URL mismatch.`);

  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const description = attribute(metaTags(html, 'name', 'description')[0], 'content') || '';
  const robots = attribute(metaTags(html, 'name', 'robots')[0], 'content') || '';
  assert(title.length <= 60, `${entry.route}: title exceeds 60 characters (${title.length}).`);
  assert(description.length <= 160, `${entry.route}: description exceeds 160 characters (${description.length}).`);
  assert(entry.indexable ? /\bindex\b/i.test(robots) && !/noindex/i.test(robots) : /noindex/i.test(robots), `${entry.route}: robots directive disagrees with publish gate.`);
  assert(sitemapUrls.has(canonicalUrl) === entry.indexable, `${entry.route}: sitemap inclusion disagrees with publish gate.`);
  const localPageAnchors = [...html.matchAll(/<a\b[^>]*href=["']\/(?:vinyl-banners|yard-signs|car-magnets)\/[^"']+["']/gi)];
  if (!entry.indexable) assert(localPageAnchors.length === 0, `${entry.route}: unpublished local-page links are crawlable.`);

  const nodes = schemaNodes(html);
  const types = nodes.map((node) => node?.['@type']);
  assert(nodes.length > 0, `${entry.route}: missing parseable JSON-LD.`);
  assert(!JSON.stringify(nodes).includes('LocalBusiness'), `${entry.route}: unsupported LocalBusiness schema found.`);
  assert(types.includes('WebPage'), `${entry.route}: WebPage schema missing.`);

  if (isLocal) {
    const productSlug = entry.route.split('/')[1];
    const expectedQuery = {
      'vinyl-banners': 'banner',
      'yard-signs': 'yard-signs',
      'car-magnets': 'car-magnets',
    }[productSlug];
    const expectedPrice = {
      'vinyl-banners': '20.00',
      'yard-signs': '120.00',
      'car-magnets': '29.00',
    }[productSlug];
    const offer = nodes.find((node) => node?.['@type'] === 'Offer');
    assert(types.includes('Organization') && types.includes('WebSite'), `${entry.route}: organization graph is incomplete.`);
    assert(types.includes('Service') && types.includes('Product') && types.includes('Offer'), `${entry.route}: commercial schema is incomplete.`);
    assert(types.includes('ImageObject') && types.includes('BreadcrumbList') && types.includes('FAQPage'), `${entry.route}: supporting schema is incomplete.`);
    assert(offer?.price === expectedPrice, `${entry.route}: Offer price is not commerce-aligned.`);
    assert(html.includes(`/design?product=${expectedQuery}`), `${entry.route}: product-aware primary CTA missing.`);
    assert(html.includes(`source_page=%2F${productSlug}%2F`), `${entry.route}: source-page attribution missing.`);
    assert(html.includes('does not represent a storefront or pickup location'), `${entry.route}: shipping-only disclosure missing.`);
  }
}

const assetFiles = [
  'og-default.png',
  'og-vinyl-banners.png',
  'og-yard-signs.png',
  'og-car-magnets.png',
];
for (const asset of assetFiles) {
  const filePath = path.join(distDir, 'images', asset);
  await access(filePath);
  const metadata = await sharp(filePath).metadata();
  assert(metadata.format === 'png', `${asset}: expected a real PNG.`);
  assert(metadata.width === 1200 && metadata.height === 630, `${asset}: expected 1200x630 dimensions.`);
}

const notFoundHtml = await readFile(path.join(distDir, '404.html'), 'utf8');
assert(notFoundHtml.includes('>404<'), '404.html is missing its visible 404 heading.');
assert(/<meta\b(?=[^>]*name=["']robots["'])(?=[^>]*content=["'][^"']*noindex)/i.test(notFoundHtml), '404.html must be noindex.');

const shell = await readFile(path.join(distDir, 'index.html'), 'utf8');
assert(!/modulepreload[^>]+(?:pdf|pdfjs|pdfkit)/i.test(shell), 'PDF code must not be preloaded on landing pages.');

const redirects = await readFile(path.join(distDir, '_redirects'), 'utf8');
const fallbackPosition = redirects.indexOf('/*    /index.html   200');
for (const namespace of ['/vinyl-banners/*', '/yard-signs/*', '/car-magnets/*']) {
  const rulePosition = redirects.indexOf(`${namespace}`);
  assert(rulePosition >= 0 && rulePosition < fallbackPosition, `${namespace}: true-404 rule must precede the SPA fallback.`);
}

console.log(`Verified ${manifest.length} generated routes, publish-gate sitemap parity, schema, metadata, CTAs, 404 output, and four social assets.`);
