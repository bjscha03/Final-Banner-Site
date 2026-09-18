import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import sharp from 'sharp';

/** Generate and verify the approved blog route without changing local SEO gates. */
export async function publishAIArticle({ distDir, makeDocument }) {
  const slug = 'how-to-create-vinyl-banner-with-ai';
  const route = `/blog/${slug}`;
  const canonical = `https://bannersonthefly.com${route}`;
  const source = await readFile(path.join(process.cwd(), 'content', 'blog', `${slug}.mdx`), 'utf8');
  const { data, content } = matter(source);
  assert.equal(data.slug, slug);
  assert.equal(data.draft, false);
  assert.equal(data.noindex, false);
  assert.equal(data.canonical, canonical);
  assert(content.trim().split(/\s+/).length >= 1000, 'AI article must contain the approved full-length copy.');
  assert(!/[\uE200\uE201\uE202]/u.test(source), 'Chat citation markers must not be published.');

  const html = await makeDocument(route);
  assert(html.includes('data-prerendered="true"'), 'Article must be prerendered.');
  assert.equal((html.match(/<h1\b/gi) || []).length, 1, 'Article must have exactly one visible H1.');
  assert(html.includes(data.title), 'Article title missing from initial HTML.');
  assert(html.includes('How to design your banner with AI'), 'Full article missing from initial HTML.');
  assert(html.includes('Use selected version &amp; continue'), 'Version-selection instructions are missing.');
  assert(html.includes('next-day air does not mean your banner arrives within 24 hours'), 'Shipping qualification is missing.');
  assert(!html.includes('Loading article...'), 'Article is still an empty loading shell.');
  assert.equal((html.match(/<title\b/gi) || []).length, 1, 'Duplicate SEO titles.');
  assert(html.includes(data.seoTitle), 'Approved SEO title is missing.');
  assert(data.seoTitle.length <= 60, 'SEO title exceeds 60 characters.');
  assert(data.description.length <= 160, 'Meta description exceeds 160 characters.');
  assert.equal((html.match(/<link\b(?=[^>]*rel="canonical")[^>]*>/gi) || []).length, 1, 'Duplicate canonicals.');
  assert(html.includes(`href="${canonical}"`), 'Canonical does not match the published route.');
  // Netlify intentionally blocks preview deployments from search. Keep that
  // protection intact; only the actual production article must be indexable.
  const isPreview = ['deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT || '');
  const hasNoindex = /<meta\b(?=[^>]*name="robots")(?=[^>]*content="[^"]*noindex)/i.test(html);
  if (!isPreview) assert(!hasNoindex, 'Published production article must not be noindex.');
  for (const property of ['og:title', 'og:description', 'og:url', 'og:image']) {
    const expression = new RegExp(`<meta\\b(?=[^>]*property="${property}")[^>]*>`, 'gi');
    assert.equal((html.match(expression) || []).length, 1, `Expected one ${property} tag.`);
  }
  assert(html.includes('https://bannersonthefly.com/images/og-ai-banner-designer.png'), 'Article social image is missing.');
  const schemas = [...html.matchAll(/<script\b(?=[^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi)].map(match => JSON.parse(match[1]));
  assert(schemas.some(schema => schema['@type'] === 'Article' && schema.headline === data.title), 'Article schema missing.');
  const callsToAction = [...html.matchAll(/<a\b[^>]*href="([^"<>]+)"[^>]*>/gi)]
    .map(match => match[1].replaceAll('&amp;', '&'))
    .filter(href => href.includes('source_page=%2Fblog%2Fhow-to-create-vinyl-banner-with-ai'));
  assert(callsToAction.length >= 3, 'Article designer links are missing.');
  for (const href of callsToAction) {
    const url = new URL(href, canonical);
    assert.equal(url.origin, 'https://bannersonthefly.com');
    assert.equal(url.pathname, '/design');
    assert.equal(url.searchParams.get('product'), 'banner');
    assert.equal(url.searchParams.get('source'), 'blog');
  }
  const image = await sharp(path.join(distDir, 'images', 'og-ai-banner-designer.png')).metadata();
  assert.equal(image.format, 'png');
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);

  const outputDirectory = path.join(distDir, 'blog', slug);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, 'index.html'), html, 'utf8');
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  let sitemap = await readFile(sitemapPath, 'utf8');
  const location = `<loc>${canonical}</loc>`;
  if (!sitemap.includes(location)) {
    sitemap = sitemap.replace('</urlset>', `  <url>\n    ${location}\n    <lastmod>${data.publishDate.slice(0, 10)}</lastmod>\n  </url>\n</urlset>`);
  }
  assert.equal(sitemap.split(location).length - 1, 1, 'Article sitemap entry must exist exactly once.');
  await writeFile(sitemapPath, sitemap, 'utf8');
  console.log(`Verified and published ${route}: complete initial HTML, metadata, image, schema, CTA links and sitemap.`);
}
