import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-resend-confirmation.cjs';

export default withLambda(legacyModule.handler);

