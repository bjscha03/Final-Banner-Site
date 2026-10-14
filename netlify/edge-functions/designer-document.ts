// Serve the same prebuilt application HTML to people and crawlers. Query
// parameters stay in the browser URL for the existing designer to consume.
export default (request: Request) => {
  if (!['GET', 'HEAD'].includes(request.method)) return;
  const url = new URL(request.url);
  const product = url.searchParams.get('tab') || url.searchParams.get('product');
  const variant = ['yard-sign', 'yard_sign', 'yard-signs'].includes(product || '')
    ? 'yard-signs'
    : ['car-magnet', 'car-magnets', 'car_magnet', 'car_magnets'].includes(product || '')
      ? 'car-magnets'
      : 'banner';
  return new URL(`/seo-documents/design-${variant}.html`, url.origin);
};

// Fail open to the existing client application if the edge layer is unavailable.
export const config = { path: ['/design', '/design/'], onError: 'bypass' };
