import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-credit-purchases.cjs';

export default withLambda(legacyModule.handler);

