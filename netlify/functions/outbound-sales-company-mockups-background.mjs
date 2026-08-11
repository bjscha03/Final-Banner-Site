import { withLambda } from '@netlify/aws-lambda-compat';
import { getStore } from '@netlify/blobs';
import sharp from 'sharp';
import handlerModule from './_shared/outbound-sales/company-mockup-batch-handler.cjs';

const handler = handlerModule.createCompanyMockupBatchHandler({
  sharp,
  getStore() {
    return getStore({ name: 'outbound-company-mockups', consistency: 'strong' });
  },
});

export default withLambda(handler);
