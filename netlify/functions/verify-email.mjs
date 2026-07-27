import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/verify-email.cjs';

export default withLambda(legacyModule.handler);

