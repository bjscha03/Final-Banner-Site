import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/record-purchase-analytics.cjs';

export default withLambda(legacyModule.handler);

