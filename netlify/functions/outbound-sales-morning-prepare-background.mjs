import { withLambda } from '@netlify/aws-lambda-compat';
import { getStore } from '@netlify/blobs';
import sharp from 'sharp';
import handlerModule from './_shared/outbound-sales/morning-handler.cjs';

const handler = handlerModule.createMorningBackgroundHandler({
  dependencies: { preparation: { sharp } },
  getStore: () => getStore({ name: 'outbound-company-mockups', consistency: 'strong' }),
});

export default withLambda(handler);
