import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/create-one-time-code.cjs';

export default withLambda(legacyModule.handler);

