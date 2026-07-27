import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/stripe-create-payment-intent.cjs';

export default withLambda(legacyModule.handler);

