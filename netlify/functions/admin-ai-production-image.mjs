import 'sharp';
import 'cloudinary';
import 'pdf-lib';
import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import auth from './_shared/server-auth.cjs';
import production from './_shared/ai-production-image.cjs';
import cloudinaryModule from 'cloudinary';

const { v2: cloudinary } = cloudinaryModule;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }, body: JSON.stringify(body) });
export async function handler(event) {
  const session = auth.requireAdmin(event);
  if (!session.ok) return session.response;
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Invalid request' }); }
  if (!UUID.test(input?.orderId || '') || !UUID.test(input?.itemId || '')) return reply(400, { error: 'A valid order and item are required.' });
  const db = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!db) return reply(503, { error: 'Database configuration missing' });
  try {
    const sql = neon(db);
    const [item] = await sql`SELECT id, width_in, height_in, file_url, file_name, original_filename, artwork_manifest, canvas_state_json
      FROM order_items WHERE id = ${input.itemId}::uuid AND order_id = ${input.orderId}::uuid`;
    if (!item) return reply(404, { error: 'Order item not found' });
    const plan = production.productionImagePlan(item);
    const cached = item.artwork_manifest?.productionImage;
    if (cached?.hash === plan.hash && cached?.version === production.VERSION && cached?.url) {
      try {
        const probe = await fetch(cached.url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        if (probe.ok) return reply(200, { ...cached, downloadUrl: cached.url });
      } catch { /* Regenerate an unavailable cached derivative from the original. */ }
    }
    const result = await production.renderAiProductionImage(item);
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    const upload = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ resource_type: 'raw', type: 'upload',
        public_id: `production-images/${item.id}-${plan.hash.slice(0, 16)}-${item.width_in}x${item.height_in}in-150dpi.jpg`, overwrite: false },
        (error, value) => error ? reject(error) : resolve(value));
      stream.end(result.buffer);
    });
    if (!upload?.secure_url) throw new Error('The production image could not be saved');
    const metadata = { ...result.metadata, url: upload.secure_url, bytes: result.buffer.length };
    // Preserve the immutable native source and all other manifest properties.
    // Cache applies only to this exact saved composition, not a later edit.
    await sql`UPDATE order_items SET artwork_manifest = jsonb_set(COALESCE(artwork_manifest, '{}'::jsonb), '{productionImage}', ${JSON.stringify(metadata)}::jsonb)
      WHERE id = ${input.itemId}::uuid AND order_id = ${input.orderId}::uuid
        AND canvas_state_json IS NOT DISTINCT FROM ${item.canvas_state_json}`;
    return reply(200, { ...metadata, downloadUrl: metadata.url });
  } catch (error) {
    console.error('[ai-production-image]', { orderId: input.orderId, itemId: input.itemId, message: error.message });
    return reply(422, { error: error.message || 'The production image could not be prepared. The original artwork is unchanged.' });
  }
}
export default withLambda(handler);
