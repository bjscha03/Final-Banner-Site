import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import type { HelmetServerState } from 'react-helmet-async';
import { RoutedApplication } from '@/App';
import AppProviders from '@/components/AppProviders';
import { getAllCityProductPaths, getIndexableCityProductPaths } from '@/lib/seo/cityData';

const productHubPaths = ['/vinyl-banners', '/yard-signs', '/car-magnets'] as const;

export const prerenderRoutes = [
  ...productHubPaths,
  ...getAllCityProductPaths().map(({ product, citySlug }) => `/${product}/${citySlug}`),
];

export const indexablePrerenderRoutes = [
  ...productHubPaths,
  ...getIndexableCityProductPaths().map(({ product, citySlug }) => `/${product}/${citySlug}`),
];

export interface RenderedRoute {
  appHtml: string;
  headHtml: string;
  htmlAttributes: string;
  bodyAttributes: string;
}

export function render(url: string): RenderedRoute {
  const helmetContext: { helmet?: HelmetServerState } = {};
  const appHtml = renderToString(
    <AppProviders helmetContext={helmetContext}>
      <StaticRouter location={url}>
        <RoutedApplication />
      </StaticRouter>
    </AppProviders>,
  );

  const helmet = helmetContext.helmet;
  if (!helmet) throw new Error(`Helmet did not produce server state for ${url}`);

  return {
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
  };
}
