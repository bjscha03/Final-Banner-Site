import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/check-admin-status.cjs';

export default withLambda(legacyModule.handler);

