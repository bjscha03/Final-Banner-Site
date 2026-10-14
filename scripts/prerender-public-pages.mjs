import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function publishPublicPages({ distDir, makeDocument, template }) {
  // Keep the original shell for private/transactional routes. They must never
  // receive a prebuilt homepage or a stale customer-specific designer state.
  await writeFile(path.join(distDir, 'app-shell.html'), template);
  const pages = [
    ['/', 'index.html'],
    ['/design', 'seo-documents/design-banner.html'],
    ['/design?product=yard-signs', 'seo-documents/design-yard-signs.html'],
    ['/design?product=car-magnets', 'seo-documents/design-car-magnets.html'],
    ...['about', 'contact', 'faq', 'shipping', 'terms', 'privacy', 'custom-quote']
      .map(slug => [`/${slug}`, `${slug}/index.html`]),
  ];
  for (const [route, output] of pages) {
    let html = await makeDocument(route);
    // The existing client mount restores cart, uploads, responsive layout and
    // live production timers. Do not hydrate a build-time snapshot of that state.
    html = html.replace('data-prerendered="true"', 'data-prerendered="static"');
    assert(html.includes('<h1'), `${route}: missing crawlable heading`);
    assert(!html.includes('<!--$!-->'), `${route}: server render failed inside Suspense`);
    assert.equal((html.match(/<title\b/g) || []).length, 1, `${route}: duplicate title`);
    assert.equal((html.match(/<meta\b[^>]*name="description"/g) || []).length, 1, `${route}: duplicate/missing description`);
    assert.equal((html.match(/<link\b[^>]*rel="canonical"/g) || []).length, 1, `${route}: duplicate/missing canonical`);
    assert(html.includes(`href="https://bannersonthefly.com${route}"`), `${route}: incorrect canonical`);
    if (!['deploy-preview', 'branch-deploy'].includes(process.env.CONTEXT)) {
      assert(!/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html), `${route}: accidentally noindex`);
    }
    const file = path.join(distDir, output);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html);
  }

  // Preserve every existing application route (including nested admin routes),
  // while genuinely unknown URLs get a real HTTP 404 rather than a 200 shell.
  const app = await readFile('src/App.tsx', 'utf8');
  const routes = [...new Set([...app.matchAll(/<Route\s+path="(\/[^\"]*)"/g)].map(m => m[1]))];
  const rules = [...routes, '/admin/*'].map(route => `${route} /app-shell.html 200`).join('\n');
  const redirectsPath = path.join(distDir, '_redirects');
  let redirects = await readFile(redirectsPath, 'utf8');
  assert(redirects.includes('/*    /index.html   200'), 'SPA fallback marker missing');
  redirects = redirects.replace('/*    /index.html   200', `${rules}\n/* /404.html 404`);
  await writeFile(redirectsPath, redirects);

  // Do not claim yesterday's build time as every page's content modification.
  // Omit stale dates on changed public pages rather than manufacture freshness.
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  let sitemap = await readFile(sitemapPath, 'utf8');
  const changed = new Set(pages.map(([route]) => `https://bannersonthefly.com${route}`));
  sitemap = sitemap.replace(/<url>[\s\S]*?<\/url>/g, block => {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    return changed.has(loc) ? block.replace(/\s*<lastmod>[^<]+<\/lastmod>/g, '') : block;
  });
  assert(!sitemap.includes('political'), 'Retired political URL in sitemap');
  for (const [route] of pages) assert(sitemap.includes(`<loc>https://bannersonthefly.com${route}</loc>`), `${route}: missing from sitemap`);
  await writeFile(sitemapPath, sitemap);
  await writeFile(path.join(distDir, 'public-page-manifest.json'), JSON.stringify(pages.map(([route, output]) => ({ route, output })), null, 2));
  console.log(`Verified ${pages.length} public HTML documents: content, titles, descriptions, canonicals, indexing and sitemap coverage.`);
}
