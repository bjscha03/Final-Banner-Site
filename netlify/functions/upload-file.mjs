import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/upload-file.cjs';

export default withLambda(legacyModule.handler);

