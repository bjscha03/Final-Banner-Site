import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/delete-abandoned-cart.cjs';

export default withLambda(legacyModule.handler);

