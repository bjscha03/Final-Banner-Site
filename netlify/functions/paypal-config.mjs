import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-config.cjs';

export default withLambda(legacyModule.handler);

