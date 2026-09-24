import { getStore } from '@netlify/blobs';
import { createLargeArtworkHandler } from './_shared/large-artwork.mjs';

export default async (request) => {
  const handler = createLargeArtworkHandler(
    () => getStore({ name: 'artwork-originals-v1', consistency: 'strong' }),
    { cloudName: Netlify.env.get('CLOUDINARY_CLOUD_NAME') },
  );
  try { return await handler(request); }
  catch (error) {
    console.error('[artwork-original-upload]', error.message);
    return Response.json({ error: 'Could not store artwork. Please retry.' }, { status: 500 });
  }
};

export const config = { rateLimit: { action: 'rate_limit', windowLimit: 120, windowSize: 60, aggregateBy: 'ip' } };
