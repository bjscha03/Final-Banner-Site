import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/cart-load.cjs';

export default withLambda(legacyModule.handler);

