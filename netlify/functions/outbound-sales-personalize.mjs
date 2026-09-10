import { withLambda } from '@netlify/aws-lambda-compat';
import personalizationHandlers from './_shared/outbound-sales/personalization-handler.cjs';

export default withLambda(personalizationHandlers.personalizeHandler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 10,
  },
};
