import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-sign-in.cjs';

export default withLambda(legacyModule.handler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: 'ip',
    windowSize: 60,
    windowLimit: 10,
  },
};
