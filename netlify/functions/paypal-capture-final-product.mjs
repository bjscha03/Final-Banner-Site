import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-capture-final-product.cjs';

export default withLambda(legacyModule.handler);

