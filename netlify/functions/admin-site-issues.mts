import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import auth from './_shared/server-auth.cjs';
import { listIssues, reply, STORE_NAME, validIssueKey, validOrigin } from './_shared/site-issues';

export default async (request: Request, context: Context) => {
  const verified = auth.requireAdmin({ headers: Object.fromEntries(request.headers) });
  if (!verified.ok) return reply(401, { ok: false, error: 'Verified administrator session required.' });
  if (context.deploy.context !== 'production' || verified.session.preview) return reply(503, { ok: false, error: 'Issue data is available in the live admin only.' });
  if (!['GET', 'PATCH'].includes(request.method)) return reply(405, { ok: false });
  try {
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    if (request.method === 'GET') return await listIssues(store, request.headers.get('if-none-match'));
    if (!validOrigin(request)) return reply(403, { ok: false });
    const text = await request.text();
    if (text.length > 1024) return reply(413, { ok: false });
    let body; try { body = JSON.parse(text); } catch { return reply(400, { ok: false }); }
    if (!validIssueKey(body.key) || !['new', 'reviewed'].includes(body.status)) return reply(400, { ok: false });
    const issue = await store.get(body.key, { type: 'json' });
    if (!issue) return reply(404, { ok: false });
    await store.setJSON(body.key, { ...issue, status: body.status, reviewedAt: body.status === 'reviewed' ? new Date().toISOString() : null });
    return reply(200, { ok: true });
  } catch { return reply(503, { ok: false, error: 'Issue monitoring is temporarily unavailable. Please retry.' }); }
};
