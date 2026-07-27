import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-sign-in.cjs';

export default withLambda(legacyModule.handler);

