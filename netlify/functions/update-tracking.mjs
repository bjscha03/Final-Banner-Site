import '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/update-tracking.cjs';

export default withLambda(legacyModule.handler);
