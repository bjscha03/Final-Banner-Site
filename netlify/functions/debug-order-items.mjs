import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/debug-order-items.cjs';

export default withLambda(legacyModule.handler);

