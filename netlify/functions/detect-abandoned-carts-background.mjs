import '@neondatabase/serverless';
import 'resend';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import legacyModule from './_shared/legacy/detect-abandoned-carts.cjs';

const WORKER_SOFT_LIMIT_MS = 12 * 60 * 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function authorizedInternalRequest(request, env = process.env) {
  const expected = Buffer.from(String(env.INTERNAL_JOB_SECRET || ''), 'utf8');
  const supplied = Buffer.from(String(request.headers.get('x-internal-job-secret') || ''), 'utf8');
  return expected.length > 0
    && expected.length === supplied.length
    && timingSafeEqual(expected, supplied);
}

async function handler(request) {
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!authorizedInternalRequest(request)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const startedAt = Date.now();
  const result = await legacyModule.runConfiguredRecoveryWorker({
    ownerToken: randomUUID(),
    deadlineAtMs: startedAt + WORKER_SOFT_LIMIT_MS,
  });
  return json({ ok: true, ...result });
}

export default handler;

export const config = {
  background: true,
};

export const _test = {
  authorizedInternalRequest,
  handler,
  WORKER_SOFT_LIMIT_MS,
};
