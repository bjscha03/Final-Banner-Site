import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/notify-credit-purchase.cjs';

export default withLambda(legacyModule.handler);

