import { withLambda } from '@netlify/aws-lambda-compat';
import handlerModule from './_shared/outbound-sales/morning-handler.cjs';

const handler = handlerModule.createMorningBackgroundHandler();

export default withLambda(handler);
