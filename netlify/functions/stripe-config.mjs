import { withLambda } from '@netlify/aws-lambda-compat';
import runtimeModule from './_shared/stripe-runtime-config.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
  // Safe, non-secret deploy marker used to prove the payment functions and
  // checkout bundle came from the same verified release candidate.
  'X-BOTF-Payment-Build': 'verified-followups-v1',
};

const handler = async (event) => {
  // aws-lambda-compat constructs a Web Response from this Lambda-shaped
  // result. A 204 with `body: ''` is invalid in the Web Response API and is
  // surfaced by Netlify as a 502, so use an explicit empty 200 for preflight.
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
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
