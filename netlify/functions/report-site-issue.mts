import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import auth from './_shared/server-auth.cjs';
import { MAX_REPORT_BYTES, normalizeReport, reply, saveIssue, STORE_NAME, validOrigin } from './_shared/site-issues';

export default async (request: Request, context: Context) => {
  if (request.method !== 'POST') return reply(405, { ok: false });
  if (context.deploy.context !== 'production') return reply(503, { ok: false, error: 'Monitoring is enabled on the live site only.' });
  if (!validOrigin(request)) return reply(403, { ok: false });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { ok: false });
  if (Number(request.headers.get('content-length') || 0) > MAX_REPORT_BYTES) return reply(413, { ok: false });
  let body;
  try { const text = await request.text(); if (Buffer.byteLength(text) > MAX_REPORT_BYTES) return reply(413, { ok: false }); body = JSON.parse(text); }
  catch { return reply(400, { ok: false }); }
  if (body?.kind === 'monitor_test') {
    const verified = auth.requireAdmin({ headers: Object.fromEntries(request.headers) });
    if (!verified.ok || verified.session.preview) return reply(401, { ok: false });
  }
  const issue = normalizeReport(body, request.headers.get('user-agent') || '', context.deploy.id);
  if (!issue) return reply(400, { ok: false });
  try {
    await saveIssue(getStore({ name: STORE_NAME, consistency: 'strong' }), issue);
    return reply(202, { ok: true, id: issue.id });
  } catch { return reply(503, { ok: false }); }
};
export const config = { rateLimit: { action: 'rate_limit', windowLimit: 30, windowSize: 60, aggregateBy: 'ip' } };
