import { neon } from '@neondatabase/serverless';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import paypalCaptureModule from './_shared/legacy/paypal-capture-forward.cjs';
import paypalCustomerInfoModule from './_shared/legacy/paypal-customer-info.cjs';
import paymentReconciliationModule from './_shared/admin-payment-reconciliation.cjs';
import checkoutModule from './_shared/stripe-checkout-service.cjs';
import paypalRuntimeModule from './_shared/paypal-runtime-config.cjs';

const PROVIDER_TIMEOUT_MS = 8 * 1000;
const { runReconciliationBatch } = paymentReconciliationModule;
const { deploymentContext } = paypalRuntimeModule;

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

function immutableDeployOrigin(context) {
  const deployId = String(context?.deploy?.id || '').trim().toLowerCase();
  const siteName = String(context?.site?.name || '').trim().toLowerCase();
  const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!dnsLabel.test(deployId) || !dnsLabel.test(siteName)) return null;
  return `https://${deployId}--${siteName}.netlify.app`;
}

function lambdaEventForWorker(request, origin, candidate, providerSignal) {
  const event = {
    httpMethod: 'POST',
    headers: {
      'content-type': 'application/json',
      host: new URL(origin).host,
      'x-internal-job-secret': String(process.env.INTERNAL_JOB_SECRET || ''),
    },
    rawUrl: `${origin}/.netlify/functions/reconcile-pending-paypal-background`,
    body: JSON.stringify({
      orderID: candidate.paypal_order_id,
      internalOrderId: candidate.id,
      reconcileOnly: true,
    }),
  };
  return paypalCaptureModule._internal.trustedReconciliationEvent(event, providerSignal);
}

function parseBody(response) {
  try { return JSON.parse(response?.body || '{}'); } catch { return {}; }
}

async function reconcileCandidate({ request, context, candidate, captureHandler = paypalCaptureModule.handler }) {
  const origin = immutableDeployOrigin(context);
  if (!origin) return { disposition: 'retry', error: 'IMMUTABLE_DEPLOY_ORIGIN_MISSING' };

  const providerSignal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  const event = lambdaEventForWorker(request, origin, candidate, providerSignal);
  const response = await captureHandler(event, context);
  const status = Number(response?.statusCode || 500);
  const payload = parseBody(response);
  const completed = status === 200
    && payload?.paymentCaptured === true
    && payload?.captureStatus === 'COMPLETED'
    && Boolean(payload?.captureID)
    && payload?.reconciliationRequired !== true
    && payload?.paymentStatusUnknown !== true;

  if (completed) {
    const followupsQueued = await checkoutModule.queuePaidOrderFollowups(event, candidate.id, {
      immutableOrigin: origin,
    });
    if (!followupsQueued) {
      console.error('[reconcile-pending-paypal-background] paid follow-ups were not acknowledged', {
        orderId: candidate.id,
      });
    }
    return { disposition: 'complete' };
  }

  const definitiveDecline = status === 422
    && payload?.paymentCaptured !== true
    && payload?.reconciliationRequired !== true
    && payload?.paymentStatusUnknown !== true;
  if (definitiveDecline) {
    const retired = await paypalCustomerInfoModule.retireDefinitivelyDeclinedPayPalOrder({
      internalOrderId: candidate.id,
      orderID: candidate.paypal_order_id,
    });
    return retired
      ? { disposition: 'terminal' }
      : { disposition: 'retry', error: 'PAYPAL_DECLINE_RETIREMENT_INCOMPLETE' };
  }

  return {
    disposition: 'retry',
    error: String(payload?.error || `PAYPAL_RECONCILIATION_HTTP_${status}`).slice(0, 500),
  };
}

async function runWorker({
  request,
  context,
  env = process.env,
  sqlFactory = neon,
  captureHandler = paypalCaptureModule.handler,
} = {}) {
  if (String(context?.deploy?.context || '').trim().toLowerCase() !== 'production'
      || deploymentContext({ rawUrl: request?.url, headers: request?.headers }) !== 'production') {
    return { error: 'PRODUCTION_CONTEXT_REQUIRED', status: 403 };
  }
  const origin = immutableDeployOrigin(context);
  const databaseUrl = env.NETLIFY_DATABASE_URL || env.DATABASE_URL;
  if (!origin || !databaseUrl) return { error: 'WORKER_CONFIGURATION_MISSING', status: 503 };

  const sql = sqlFactory(databaseUrl);
  const result = await runReconciliationBatch({
    sql,
    ownerToken: randomUUID(),
    allowTestOrders: false,
    reconcileCandidate: (candidate) => reconcileCandidate({
      request,
      context,
      candidate,
      captureHandler,
    }),
  });
  return { ...result, status: 200 };
}

async function handler(request, context) {
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!authorizedInternalRequest(request)) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  try {
    const result = await runWorker({ request, context });
    if (result.error) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error('[reconcile-pending-paypal-background] worker failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: 'PAYPAL_RECONCILIATION_WORKER_FAILED' }, 500);
  }
}

export default handler;

export const config = {
  background: true,
};

export const _test = {
  PROVIDER_TIMEOUT_MS,
  authorizedInternalRequest,
  handler,
  immutableDeployOrigin,
  lambdaEventForWorker,
  parseBody,
  reconcileCandidate,
  runWorker,
};
