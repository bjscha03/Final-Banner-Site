import { withLambda } from '@netlify/aws-lambda-compat';
import handlerModule from './_shared/outbound-sales/morning-handler.cjs';

export default withLambda(handlerModule.createMorningScheduledHandler({ action: 'replenish' }));

export const config = { schedule: '30 10 * * *' };
