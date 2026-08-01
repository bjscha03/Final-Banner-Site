import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-webhook.cjs';

const getSiteUrl = (event) => {
  const configured = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.PUBLIC_SITE_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  const host = event?.headers?.['x-forwarded-host'] || event?.headers?.host;
  return host ? `https://${host}` : null;
};

const triggerOrderNotifications = async (event, orderId) => {
  const siteUrl = getSiteUrl(event);
  if (!siteUrl || !orderId) return false;

  try {
    const response = await fetch(`${siteUrl}/.netlify/functions/notify-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    const details = await response.json().catch(() => ({}));
    if (!response.ok || details?.ok === false) {
      console.error('[paypal-webhook] notification trigger failed', {
        orderId,
        status: response.status,
        error: details?.error || null,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[paypal-webhook] notification request failed', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const handler = async (event, context) => {
  const response = await legacyModule.handler(event, context);
  const statusCode = Number(response?.statusCode || 500);
  if (statusCode < 200 || statusCode >= 300) return response;

  let payload = {};
  try {
    payload = JSON.parse(response.body || '{}');
  } catch {
    return response;
  }

  const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
  if (!orderId) return response;

  const notificationsTriggered = await triggerOrderNotifications(event, orderId);
  response.body = JSON.stringify({ ...payload, notificationsTriggered });
  return response;
};

export const _test = { getSiteUrl };
export default withLambda(handler);
