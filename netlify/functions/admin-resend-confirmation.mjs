// The order-email implementation is a shared CommonJS handler with runtime
// requires. Declare its production dependencies here so Netlify includes them
// in this function artifact.
import '@neondatabase/serverless';
import 'resend';
import { withLambda } from '@netlify/aws-lambda-compat';
import notifyOrderModule from './_shared/legacy/notify-order.cjs';
import serverAuthModule from './_shared/server-auth.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const auth = serverAuthModule.requireAdmin(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  }

  let orderId;
  try {
    ({ orderId } = JSON.parse(event.body || '{}'));
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
    };
  }

  if (!orderId || typeof orderId !== 'string') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'Order ID is required' }),
    };
  }

  // Force only the customer confirmation; never duplicate the new-order alert.
  return notifyOrderModule.handler({
    ...event,
    headers: event.headers || {},
    body: JSON.stringify({ orderId, forceResendCustomer: true }),
  });
};

export default withLambda(handler);
