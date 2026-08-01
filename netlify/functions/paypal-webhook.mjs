import { withLambda } from '@netlify/aws-lambda-compat';
import webhookModule from './_shared/legacy/paypal-webhook-forward.cjs';

const getSiteUrl = (event) => {
  const configured = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.PUBLIC_SITE_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  const host = event?.headers?.['x-forwarded-host'] || event?.headers?.host;
  return host ? `https://${host}` : null;
};

const queuePaidOrderFollowups = async (event, orderId) => {
  const siteUrl = getSiteUrl(event);
  if (!siteUrl || !orderId) return false;

  const internalSecret = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const requestHeaders = { 'Content-Type': 'application/json' };
  if (internalSecret) requestHeaders['X-Internal-Job-Secret'] = internalSecret;

  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/process-paid-order-followups-background`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ orderId }),
    });
    if (!response.ok) {
      console.error('[paypal-webhook] follow-up queue rejected', {
        orderId,
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[paypal-webhook] follow-up queue failed', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const handler = async (event, context) => {
  const response = await webhookModule.handler(event, context);
  if (Number(response?.statusCode || 500) !== 200) return response;

  let payload = {};
  try { payload = JSON.parse(response.body || '{}'); } catch { return response; }

  const definitivePaidState = Boolean(
    payload?.orderId
    && payload?.paymentCaptured === true
    && payload?.captureID,
  );
  if (!definitivePaidState) return response;

  const followupsQueued = await queuePaidOrderFollowups(event, payload.orderId);
  response.body = JSON.stringify({ ...payload, followupsQueued });
  return response;
};

export const _test = { getSiteUrl, queuePaidOrderFollowups };
export default withLambda(handler);
