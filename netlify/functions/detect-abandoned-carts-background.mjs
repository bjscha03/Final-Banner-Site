import '@neondatabase/serverless';
import 'resend';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import legacyModule from './_shared/legacy/detect-abandoned-carts.cjs';

const WORKER_SOFT_LIMIT_MS = 12 * 60 * 1000;
const CART_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function createHandler({
  runGlobal = (options) => legacyModule.runConfiguredRecoveryWorker(options),
  runTargeted = (options) => legacyModule.runConfiguredTargetedRecovery(options),
  env = process.env,
} = {}) {
  return async function recoveryBackgroundHandler(request) {
    if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    if (!authorizedInternalRequest(request, env)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'INVALID_JOB_PAYLOAD' }, 400);
    }

    if (body?.trigger === 'pagehide') {
      const cartId = String(body.cartId || '').trim().toLowerCase();
      if (!CART_ID_PATTERN.test(cartId)) {
        return json({ ok: false, error: 'INVALID_CART_ID' }, 400);
      }
      const result = await runTargeted({ cartId });
      return json({ ok: true, ...result });
    }
    if (body?.trigger !== 'scheduled') {
      return json({ ok: false, error: 'INVALID_JOB_TRIGGER' }, 400);
    }

    const startedAt = Date.now();
    const result = await runGlobal({
      ownerToken: randomUUID(),
      deadlineAtMs: startedAt + WORKER_SOFT_LIMIT_MS,
    });
    return json({ ok: true, ...result });
  };
}

const handler = createHandler();

export default handler;

export const config = {
  background: true,
};

export const _test = {
  authorizedInternalRequest,
  CART_ID_PATTERN,
  createHandler,
  handler,
  WORKER_SOFT_LIMIT_MS,
};
