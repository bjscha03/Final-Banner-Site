import { withLambda } from '@netlify/aws-lambda-compat';
import runtimeModule from './_shared/stripe-runtime-config.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
};

const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ enabled: false, error: 'METHOD_NOT_ALLOWED' }) };
  }
  try {
    runtimeModule.assertSameOrigin(event, { allowMissingOrigin: true });
  } catch {
    return { statusCode: 403, headers, body: JSON.stringify({ enabled: false, error: 'ORIGIN_REJECTED' }) };
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(runtimeModule.publicStripeConfig()),
  };
};

export const _test = { handler };
export default withLambda(handler);
