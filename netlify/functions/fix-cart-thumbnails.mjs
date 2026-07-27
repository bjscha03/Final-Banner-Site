import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/fix-cart-thumbnails.cjs';

export default withLambda(legacyModule.handler);

