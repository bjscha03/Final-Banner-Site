import { withLambda } from '@netlify/aws-lambda-compat';
import handlerModule from './_shared/outbound-sales/event-import-handler.cjs';

const handler = handlerModule.createEventImportBackgroundHandler({
  loadSharp: async () => (await import('sharp')).default,
  getStore: async () => {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: 'outbound-company-mockups', consistency: 'strong' });
  },
});

export default withLambda(handler);
