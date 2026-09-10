import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/sign-in.cjs';

export default withLambda(legacyModule.handler);

