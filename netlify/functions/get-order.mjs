import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-order.cjs';

export default withLambda(legacyModule.handler);

