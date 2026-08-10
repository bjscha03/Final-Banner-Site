import { withLambda } from '@netlify/aws-lambda-compat';
import manualReviewModule from './_shared/outbound-sales/manual-review-handler.cjs';

export default withLambda(manualReviewModule.manualReviewHandler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 90,
  },
};
