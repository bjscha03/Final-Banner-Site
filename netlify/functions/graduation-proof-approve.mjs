import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/graduation-proof-approve.cjs';

export default withLambda(legacyModule.handler);

