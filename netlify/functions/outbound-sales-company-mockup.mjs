import { withLambda } from '@netlify/aws-lambda-compat';
import { getStore } from '@netlify/blobs';
import sharp from 'sharp';
import handlerModule from './_shared/outbound-sales/company-mockup-handler.cjs';

const handler = handlerModule.createCompanyMockupHandler({
  sharp,
  getStore() {
    return getStore({ name: 'outbound-company-mockups', consistency: 'strong' });
  },
});

export default withLambda(handler);

export const config = {
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: ['ip', 'domain'],
    windowSize: 60,
    windowLimit: 120,
  },
};
