import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/stripe-finalize-order.cjs';

export default withLambda(legacyModule.handler);

