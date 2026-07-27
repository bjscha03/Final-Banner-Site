import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/add-file-url-column.cjs';

export default withLambda(legacyModule.handler);

