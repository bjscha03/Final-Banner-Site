import { withLambda } from '@netlify/aws-lambda-compat';
import outboundSales from './_shared/outbound-sales/handler.cjs';

export default withLambda(outboundSales.settingsHandler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 30,
  },
};
