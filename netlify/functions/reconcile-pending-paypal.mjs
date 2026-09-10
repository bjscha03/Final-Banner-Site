const BACKGROUND_PATH = '/.netlify/functions/reconcile-pending-paypal-background';
const DISPATCH_TIMEOUT_MS = 10 * 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function immutableDeployOrigin(context) {
  const deployId = String(context?.deploy?.id || '').trim().toLowerCase();
  const siteName = String(context?.site?.name || '').trim().toLowerCase();
  const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!dnsLabel.test(deployId) || !dnsLabel.test(siteName)) return null;
  return `https://${deployId}--${siteName}.netlify.app`;
}

async function dispatchPayPalReconciliation({ fetchImpl = fetch, env = process.env, context } = {}) {
  const origin = immutableDeployOrigin(context);
  const secret = String(env.INTERNAL_JOB_SECRET || '');
  if (!origin || !secret) throw new Error('PAYPAL_RECONCILIATION_DISPATCH_CONFIGURATION_MISSING');

  const response = await fetchImpl(`${origin}${BACKGROUND_PATH}`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Job-Secret': secret,
    },
    body: JSON.stringify({ trigger: 'scheduled' }),
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
  });
  if (response.status !== 202) {
    throw new Error(`PAYPAL_RECONCILIATION_BACKGROUND_DISPATCH_${response.status}`);
  }
  return { queued: true };
}

async function handler(_request, context) {
  try {
    return json({ ok: true, ...(await dispatchPayPalReconciliation({ context })) });
  } catch (error) {
    console.error('[reconcile-pending-paypal] background dispatch failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: 'PAYPAL_RECONCILIATION_DISPATCH_FAILED' }, 500);
  }
}

export default handler;

export const config = {
  schedule: '*/5 * * * *',
};

export const _test = {
  BACKGROUND_PATH,
  DISPATCH_TIMEOUT_MS,
  dispatchPayPalReconciliation,
  handler,
  immutableDeployOrigin,
};
