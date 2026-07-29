import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-order.cjs';
import publicModule from './_shared/legacy/get-order-public.cjs';

const handler = async (event, context) => {
  const authenticatedResponse = await legacyModule.handler(event, context);

  // Email links historically point directly to /orders/:uuid. A guest customer
  // has no site session, so the protected endpoint returned 401 and the page
  // appeared to load forever. Fall back only for an exact UUID and return the
  // deliberately limited customer-facing order shape from get-order-public.
  if (Number(authenticatedResponse?.statusCode) === 401 && event.httpMethod === 'GET') {
    return publicModule.handler(event, context);
  }

  return authenticatedResponse;
};

export default withLambda(handler);
