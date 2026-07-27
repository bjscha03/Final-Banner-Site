import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/save-cart-snapshot.cjs';

export default withLambda(legacyModule.handler);

