import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-download-file.cjs';

export default withLambda(legacyModule.handler);

