import { withLambda } from '@netlify/aws-lambda-compat';

/**
 * Keep the existing Lambda-style handlers while attaching deployment metadata
 * supplied by Netlify's modern runtime. None of these fields come from request
 * headers or the browser.
 */
export function withOutboundRuntime(handler) {
  return async (request, context) => {
    const adapted = withLambda((event, lambdaContext) => handler({
      ...event,
      netlify: {
        deployContext: context?.deploy?.context || null,
        deployId: context?.deploy?.id || null,
        siteName: context?.site?.name || null,
      },
    }, lambdaContext));

    return adapted(request, context);
  };
}
