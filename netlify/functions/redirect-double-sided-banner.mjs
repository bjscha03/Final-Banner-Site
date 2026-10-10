// A static redirect with target query parameters drops the incoming query.
// Preserve old cart-edit links, dimensions and campaign attribution explicitly.
export default async function redirectDoubleSidedBanner(request) {
  const params = new URL(request.url).searchParams;
  params.delete('tab');
  params.set('product', 'banner');
  params.set('sides', 'double');
  return new Response(null, {
    status: 301,
    headers: {
      Location: `/design?${params.toString()}`,
      'Cache-Control': 'no-store',
    },
  });
}
