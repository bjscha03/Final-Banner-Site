import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/recover-abandoned-cart.cjs';

export default withLambda(legacyModule.handler);
