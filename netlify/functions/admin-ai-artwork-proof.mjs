import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import auth from './_shared/server-auth.cjs';
import proof from './_shared/ai-artwork-proof.cjs';
import refunds from './_shared/admin-refund-order.cjs';

const reply = (statusCode, error) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error }) });
export async function handler(event) {
  const session = auth.requireAdmin(event);
  if (!session.ok) return session.response;
  if (event.httpMethod !== 'POST') return reply(405, 'Method not allowed');
  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, 'Invalid request'); }
  if (!refunds.UUID.test(String(input?.orderId || '')) || !refunds.UUID.test(String(input?.itemId || ''))) return reply(400, 'A valid order and item are required.');
  const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) return reply(503, 'Database configuration missing');
  try {
    const sql = neon(url);
    const [item] = await sql`SELECT id, width_in, height_in, file_url, file_name, original_filename, artwork_manifest, canvas_state_json
      FROM order_items WHERE id = ${input.itemId}::uuid AND order_id = ${input.orderId}::uuid`;
    if (!item) return reply(404, 'Order item not found');
    const result = await proof.createAiArtworkProof(item);
    const ppi = result.metadata.resolution[0]?.effectivePpi;
    return { statusCode: 200, headers: {
      'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="ai-proof-${input.itemId.slice(-8)}-${result.widthIn}x${result.heightIn}in.pdf"`,
      'X-Artwork-Effective-PPI': String(ppi || 0),
    }, isBase64Encoded: true, body: result.buffer.toString('base64') };
  } catch (error) {
    console.error('[ai-artwork-proof] failed', { orderId: input.orderId, itemId: input.itemId, message: error.message });
    return reply(422, 'The full-size proof could not be created. Please review the saved original artwork.');
  }
}
export default withLambda(handler);
