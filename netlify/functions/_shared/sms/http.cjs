'use strict';
const runtime = require('./runtime.cjs');
const store = require('./store.cjs');
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { ...runtime.privateHeaders, 'Content-Type': 'application/json' } }); }
function eventFor(request) { return { rawUrl: request.url, headers: Object.fromEntries(request.headers), httpMethod: request.method }; }
function sameOrigin(request, config) { return request.headers.get('origin') === config.origin && request.headers.get('content-type')?.startsWith('application/json'); }
async function twilioRequest(request, config) {
  if (request.method !== 'POST') return { error: json(405, { error: 'METHOD_NOT_ALLOWED' }) };
  if (!config.enabled) return { error: json(503, { error: 'TEXT_ORDERING_UNAVAILABLE' }) };
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return { error: json(415, { error: 'FORM_REQUIRED' }) };
  const body = await request.text();
  if (body.length > 32768) return { error: json(413, { error: 'REQUEST_TOO_LARGE' }) };
  const pairs = new URLSearchParams(body);
  if (new Set(pairs.keys()).size !== [...pairs].length) return { error: json(400, { error: 'DUPLICATE_PARAMETERS' }) };
  const params = Object.fromEntries(pairs);
  if (!runtime.verifyWebhook(request, params, config)) return { error: json(403, { error: 'INVALID_SIGNATURE' }) };
  return { params };
}
async function sessionFor(request, config) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const id = runtime.verifyToken(token, config);
  if (!id) return null;
  const sql = store.database();
  await store.ensureSchema(sql);
  const session = await store.getSession(sql, id);
  if (!session || new Date(session.expires_at).getTime() <= Date.now() || !runtime.allowedRecipient(session.phone, config)) return null;
  return { sql, session };
}
module.exports = { json, eventFor, sameOrigin, twilioRequest, sessionFor };
