import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/stripe-webhook.cjs';

export default withLambda(legacyModule.handler);

