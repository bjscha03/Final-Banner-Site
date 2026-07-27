import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-webhook.cjs';

export default withLambda(legacyModule.handler);

