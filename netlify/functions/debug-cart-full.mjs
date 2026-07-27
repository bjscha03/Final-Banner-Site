import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/debug-cart-full.cjs';

export default withLambda(legacyModule.handler);

