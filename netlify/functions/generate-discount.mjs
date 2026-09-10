import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/generate-discount.cjs';

export default withLambda(legacyModule.handler);

