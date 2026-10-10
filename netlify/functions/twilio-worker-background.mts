// Explicit entrypoint imports keep transitive CJS dependencies in the artifact.
import 'twilio';
import '@neondatabase/serverless';
import 'sharp';
import 'cloudinary';
import 'stripe';
import 'resend';
import 'node-fetch';
import runtime from './_shared/sms/runtime.cjs';
import store from './_shared/sms/store.cjs';
import worker from './_shared/sms/worker.cjs';
import http from './_shared/sms/http.cjs';

export default async (request: Request) => {
  const config = runtime.settings();
  if (!config.enabled || request.method !== 'POST') return http.json(503, { error: 'TEXT_ORDERING_UNAVAILABLE' });
  const body = await request.text();
  if (body.length > 256 || !runtime.verifyWorker(body, request.headers.get('x-bof-sms-worker'), config)) return http.json(403, { error: 'INVALID_SIGNATURE' });
  let issuedAt;
  try { issuedAt = JSON.parse(body).issuedAt; } catch { return http.json(400, { error: 'INVALID_REQUEST' }); }
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 300000) return http.json(403, { error: 'EXPIRED_REQUEST' });
  const sql = store.database(); await store.ensureSchema(sql);
  await worker.runWorker(sql, config);
  return http.json(200, { ok: true });
};
