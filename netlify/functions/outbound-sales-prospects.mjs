import { withLambda } from '@netlify/aws-lambda-compat';
import prospectHandlers from './_shared/outbound-sales/prospects-handler.cjs';

export default withLambda(prospectHandlers.prospectsHandler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 60,
  },
};
