import handlerModule from './_shared/outbound-sales/event-import-handler.cjs';
import { withOutboundRuntime } from './_shared/outbound-sales/netlify-modern.mjs';

const handler = handlerModule.createEventImportBackgroundHandler({
  loadSharp: async () => (await import('sharp')).default,
  getStore: async () => {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: 'outbound-company-mockups', consistency: 'strong' });
  },
});

export default withOutboundRuntime(handler);
