import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-create-credits-order.cjs';

export default withLambda(legacyModule.handler);

