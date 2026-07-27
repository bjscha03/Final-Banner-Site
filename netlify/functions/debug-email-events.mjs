import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/debug-email-events.cjs';

export default withLambda(legacyModule.handler);

