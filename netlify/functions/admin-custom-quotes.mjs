import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/admin-custom-quotes.cjs';

export default withLambda(legacyModule.handler);

