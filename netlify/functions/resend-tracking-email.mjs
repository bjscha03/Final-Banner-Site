import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/resend-tracking-email.cjs';

export default withLambda(legacyModule.handler);

