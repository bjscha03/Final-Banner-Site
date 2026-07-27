import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/mark-in-production.cjs';

export default withLambda(legacyModule.handler);

