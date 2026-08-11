import { withLambda } from '@netlify/aws-lambda-compat';
import handlerModule from './_shared/outbound-sales/event-import-handler.cjs';

export default withLambda(handlerModule.createEventImportHandler());
