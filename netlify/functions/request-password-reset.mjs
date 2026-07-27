import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/request-password-reset.cjs';

export default withLambda(legacyModule.handler);

