import type { Context } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import auth from './_shared/server-auth.cjs';
import blogOffer from './_shared/blog-reader-offer.cjs';

export default async (request: Request, context: Context) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  const verified = auth.requireAdmin({ headers: Object.fromEntries(request.headers) });
  if (!verified.ok) return reply(401, { ok: false, error: 'Verified administrator session required' });
  if (request.method !== 'GET') return reply(405, { ok: false, error: 'Method not allowed' });
  // Preview cookies must never expose the production lead list.
  if (context.deploy.context !== 'production' || verified.session.preview) return reply(503, { ok: false, error: 'Lead data is available in the live admin only.' });
  const db = Netlify.env.get('NETLIFY_DATABASE_URL') || Netlify.env.get('DATABASE_URL');
  if (!db) return reply(503, { ok: false, error: 'Lead data is temporarily unavailable.' });
  const page = Number(new URL(request.url).searchParams.get('page') || '1');
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return reply(400, { ok: false, error: 'Invalid page' });
  try { return reply(200, { ok: true, ...await blogOffer.listLeads(neon(db), { page }) }); }
  catch { return reply(503, { ok: false, error: 'Could not refresh leads and subscription status. Please try again.' }); }
};
