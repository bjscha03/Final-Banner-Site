import handlerModule from './_shared/outbound-sales/event-import-handler.cjs';
import { withOutboundRuntime } from './_shared/outbound-sales/netlify-modern.mjs';

export default withOutboundRuntime(handlerModule.createEventImportHandler());
