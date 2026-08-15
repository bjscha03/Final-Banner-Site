import React from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import type { HelmetServerState } from 'react-helmet-async';
import { RoutedApplication } from '@/App';
import AppProviders from '@/components/AppProviders';
import { getAllCityProductPaths, getIndexableCityProductPaths } from '@/lib/seo/cityData';
import { getAllTradeShowPaths, getIndexableTradeShowPaths } from '@/lib/tradeShows/tradeShows';

const productHubPaths = ['/vinyl-banners', '/yard-signs', '/car-magnets'] as const;

export const prerenderRoutes = [
  ...productHubPaths,
  ...getAllCityProductPaths().map(({ product, citySlug }) => `/${product}/${citySlug}`),
  '/trade-shows',
  ...getAllTradeShowPaths(),
];

export const indexablePrerenderRoutes = [
  ...productHubPaths,
  ...getIndexableCityProductPaths().map(({ product, citySlug }) => `/${product}/${citySlug}`),
  '/trade-shows',
  ...getIndexableTradeShowPaths(),
];

export interface RenderedRoute {
  appHtml: string;
  headHtml: string;
  htmlAttributes: string;
  bodyAttributes: string;
}

export function render(url: string): Promise<RenderedRoute> {
  const helmetContext: { helmet?: HelmetServerState } = {};
  const application = (
    <AppProviders helmetContext={helmetContext}>
      <StaticRouter location={url}>
        <RoutedApplication />
      </StaticRouter>
    </AppProviders>
  );

  // renderToString stops at Suspense fallbacks, which prevents route-level
  // code splitting from being used on pages that are also prerendered. Wait
  // for lazy route modules before collecting the crawlable HTML instead.
  return new Promise((resolve, reject) => {
    let settled = false;
    const output = new PassThrough();
    let appHtml = '';
    output.setEncoding('utf8');
    output.on('data', (chunk) => { appHtml += chunk; });
    output.on('error', reject);
    output.on('end', () => {
      if (settled) return;
      settled = true;
      const helmet = helmetContext.helmet;
      if (!helmet) {
        reject(new Error(`Helmet did not produce server state for ${url}`));
        return;
      }
      resolve({
        appHtml,
        headHtml: [
          helmet.title.toString(),
          helmet.priority.toString(),
          helmet.meta.toString(),
          helmet.link.toString(),
          helmet.script.toString(),
          helmet.style.toString(),
          helmet.noscript.toString(),
        ].filter(Boolean).join('\n    '),
        htmlAttributes: helmet.htmlAttributes.toString(),
        bodyAttributes: helmet.bodyAttributes.toString(),
      });
    });

    const stream = renderToPipeableStream(application, {
      onAllReady() {
        stream.pipe(output);
      },
      onShellError(error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
      onError(error) {
        console.error(`[prerender] ${url}`, error);
      },
    });
  });
}
