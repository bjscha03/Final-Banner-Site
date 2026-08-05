import { withLambda } from '@netlify/aws-lambda-compat';

/**
 * Preserve the existing, well-tested Lambda-style request handlers while
 * attaching authoritative metadata from Netlify's modern runtime. The deploy
 * context comes from Netlify, not from a request header or client payload.
 */
export function withDesignerRuntime(handler) {
  return async (request, context) => {
    const adapted = withLambda((event, lambdaContext) => handler({
      ...event,
      netlify: {
        deployContext: context?.deploy?.context || null,
        deployId: context?.deploy?.id || null,
      },
    }, lambdaContext));

    return adapted(request, context);
  };
}
