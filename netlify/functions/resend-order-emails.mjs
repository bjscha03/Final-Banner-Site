import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/resend-order-emails.cjs';

export default withLambda(legacyModule.handler);

