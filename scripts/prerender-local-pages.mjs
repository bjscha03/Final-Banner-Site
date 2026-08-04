import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const template = await readFile(path.join(distDir, 'index.html'), 'utf8');
const serverEntry = pathToFileURL(path.join(projectRoot, '.ssr-dist', 'entry-server.mjs')).href;
const { render, prerenderRoutes, indexablePrerenderRoutes } = await import(serverEntry);

const managedTagPatterns = [
  /\s*<title\b[^>]*>[\s\S]*?<\/title>/gi,
  /\s*<meta\b(?=[^>]*\bname=["'](?:description|robots|twitter:[^"']+)["'])[^>]*>/gi,
  /\s*<meta\b(?=[^>]*\bproperty=["']og:[^"']+["'])[^>]*>/gi,
  /\s*<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi,
  /\s*<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']image["'])[^>]*>/gi,
  /\s*<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
];

function makeDocument(url) {
  const rendered = render(url);
  let html = template;
  for (const pattern of managedTagPatterns) html = html.replace(pattern, '');
  html = html.replace('<html lang="en">', `<html lang="en" data-prerendered="true"${rendered.htmlAttributes ? ` ${rendered.htmlAttributes}` : ''}>`);
  if (rendered.bodyAttributes) html = html.replace('<body>', `<body ${rendered.bodyAttributes}>`);
  html = html.replace('</head>', `    ${rendered.headHtml}\n  </head>`);
  html = html.replace('<div id="root"></div>', `<div id="root">${rendered.appHtml}</div>`);
  return html;
}

for (const route of prerenderRoutes) {
  const outputDir = path.join(distDir, route.slice(1));
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'index.html'), makeDocument(route), 'utf8');
}

await writeFile(path.join(distDir, '404.html'), makeDocument('/__not-found__'), 'utf8');

const allowedLocalUrls = new Set(indexablePrerenderRoutes.map((route) => `https://bannersonthefly.com${route}`));
const sitemapPath = path.join(distDir, 'sitemap.xml');
let sitemap = await readFile(sitemapPath, 'utf8');
const localPathPattern = /^https:\/\/bannersonthefly\.com\/(vinyl-banners|yard-signs|car-magnets)\/[^/]+\/?$/;
sitemap = sitemap.replace(/\s*<url>[\s\S]*?<\/url>/g, (block) => {
  const location = block.match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
  if (location?.replace(/\/$/, '') === 'https://bannersonthefly.com/locations') return '';
  if (location && localPathPattern.test(location) && !allowedLocalUrls.has(location.replace(/\/$/, ''))) return '';
  return block;
});

for (const route of indexablePrerenderRoutes) {
  const location = `https://bannersonthefly.com${route}`;
  if (!sitemap.includes(`<loc>${location}</loc>`)) {
    sitemap = sitemap.replace('</urlset>', `  <url>\n    <loc>${location}</loc>\n  </url>\n</urlset>`);
  }
}
await writeFile(sitemapPath, sitemap, 'utf8');

const manifest = prerenderRoutes.map((route) => ({
  route,
  indexable: indexablePrerenderRoutes.includes(route),
  output: `${route.slice(1)}/index.html`,
}));
await writeFile(path.join(distDir, 'local-page-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Prerendered ${prerenderRoutes.length} routes plus 404.html; ${indexablePrerenderRoutes.length} routes are sitemap-eligible.`);
