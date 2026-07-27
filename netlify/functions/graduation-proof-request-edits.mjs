import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/graduation-proof-request-edits.cjs';

export default withLambda(legacyModule.handler);

