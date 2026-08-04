import React from 'react';
/* eslint-disable react-refresh/only-export-components -- SSR entry exports renderer data, not a hot-reload component module. */
import { renderToString } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import type { HelmetServerState } from 'react-helmet-async';
import AppProviders from '@/components/AppProviders';
import { getAllCityProductPaths, getIndexableCityProductPaths } from '@/lib/seo/cityData';
import CityProductPage from '@/pages/CityProductPage';
import NotFound from '@/pages/NotFound';
import ProductHubPage from '@/pages/ProductHubPage';

const productHubPaths = ['/vinyl-banners', '/yard-signs', '/car-magnets'] as const;

export const prerenderRoutes = [
  ...productHubPaths,
  ...getAllCityProductPaths().map(({ product, citySlug }) => `/${product}/${citySlug}`),
];

export const indexablePrerenderRoutes = [
  ...productHubPaths,
  ...getIndexableCityProductPaths().map(({ product, citySlug }) => `/${product}/${citySlug}`),
];

const PrerenderRoutes = () => (
  <Routes>
    <Route path="/vinyl-banners" element={<ProductHubPage productSlug="vinyl-banners" />} />
    <Route path="/yard-signs" element={<ProductHubPage productSlug="yard-signs" />} />
    <Route path="/car-magnets" element={<ProductHubPage productSlug="car-magnets" />} />
    <Route path="/vinyl-banners/:citySlug" element={<CityProductPage productSlug="vinyl-banners" />} />
    <Route path="/yard-signs/:citySlug" element={<CityProductPage productSlug="yard-signs" />} />
    <Route path="/car-magnets/:citySlug" element={<CityProductPage productSlug="car-magnets" />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

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
        <PrerenderRoutes />
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
