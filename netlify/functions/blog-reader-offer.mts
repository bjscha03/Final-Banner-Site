import type { Context } from '@netlify/functions';
import blogOffer from './_shared/blog-reader-offer.cjs';

const offer = blogOffer.createService();
export default async (request: Request, context: Context) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return reply(403, { ok: false, error: 'Please request your code from the blog.' });
  if (!request.headers.get('content-type')?.includes('application/json')) return reply(415, { ok: false, error: 'Expected JSON' });
  const raw = await request.text();
  if (raw.length > 4096) return reply(413, { ok: false, error: 'Request too large' });
  let input;
  try { input = JSON.parse(raw); } catch { return reply(400, { ok: false, error: 'Invalid request' }); }
  const keys = ['NETLIFY_DATABASE_URL', 'DATABASE_URL', 'RESEND_API_KEY', 'MARKETING_EMAIL_TOKEN_SECRET', 'RECOVERY_EMAIL_TOKEN_SECRET', 'AUTH_SESSION_SECRET', 'CLOUDINARY_API_SECRET', 'MARKETING_PHYSICAL_ADDRESS', 'OUTBOUND_PHYSICAL_ADDRESS', 'RECOVERY_PHYSICAL_ADDRESS', 'EMAIL_FROM_INFO', 'EMAIL_FROM', 'EMAIL_REPLY_TO'];
  const env = Object.fromEntries(keys.map(key => [key, Netlify.env.get(key)]));
  const result = await offer(input, env, { ip: context.ip, production: context.deploy.context === 'production' });
  return reply(result.status, result.body);
};
