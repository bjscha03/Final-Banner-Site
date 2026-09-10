import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/sign-up.cjs';

export default withLambda(legacyModule.handler);

