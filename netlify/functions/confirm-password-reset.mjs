import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/confirm-password-reset.cjs';

export default withLambda(legacyModule.handler);

