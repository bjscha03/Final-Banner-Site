import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-create-order.cjs';

export default withLambda(legacyModule.handler);

