import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-abandoned-carts.cjs';

export default withLambda(legacyModule.handler);

