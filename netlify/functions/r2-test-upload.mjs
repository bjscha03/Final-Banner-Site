import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/r2-test-upload.cjs';

export default withLambda(legacyModule.handler);

