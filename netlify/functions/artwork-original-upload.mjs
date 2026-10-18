import { getStore } from '@netlify/blobs';
import { createLargeArtworkHandler } from './_shared/large-artwork.mjs';
import { v2 as cloudinary } from 'cloudinary';
import { renderLargeArtworkPreview } from './_shared/large-artwork-preview.mjs';

export default async (request) => {
  const handler = createLargeArtworkHandler(
    () => getStore({ name: 'artwork-originals-v1', consistency: 'strong' }),
    {
      cloudName: Netlify.env.get('CLOUDINARY_CLOUD_NAME'),
      createRasterPreview: async (original, session) => {
        const preview = await renderLargeArtworkPreview(original);
        cloudinary.config({
          cloud_name: Netlify.env.get('CLOUDINARY_CLOUD_NAME'),
          api_key: Netlify.env.get('CLOUDINARY_API_KEY'),
          api_secret: Netlify.env.get('CLOUDINARY_API_SECRET'),
          secure: true,
        });
        const uploaded = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream({
            disable_promises: true,
            resource_type: 'image', public_id: `uploads/original-preview-${session.id}`,
            overwrite: true, format: 'png',
          }, (error, result) => error ? reject(error) : resolve(result)).end(preview.data);
        });
        return { previewUrl: uploaded.secure_url, width: preview.width, height: preview.height };
      },
    },
  );
  try { return await handler(request); }
  catch (error) {
    console.error('[artwork-original-upload]', error.message);
    return Response.json({ error: 'Could not store artwork. Please retry.' }, { status: 500 });
  }
};

export const config = { rateLimit: { action: 'rate_limit', windowLimit: 120, windowSize: 60, aggregateBy: 'ip' } };
