import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/cart-save.cjs';

export default withLambda(legacyModule.handler);

