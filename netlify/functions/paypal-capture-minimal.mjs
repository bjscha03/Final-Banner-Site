import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/paypal-capture-minimal.cjs';

export default withLambda(legacyModule.handler);

