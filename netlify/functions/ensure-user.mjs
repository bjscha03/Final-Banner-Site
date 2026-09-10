import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/ensure-user.cjs';

export default withLambda(legacyModule.handler);

