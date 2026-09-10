import { withLambda } from '@netlify/aws-lambda-compat';
import module from './_shared/outbound-sales/unsubscribe-handler.cjs';

export default withLambda(module.handler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 30,
  },
};
