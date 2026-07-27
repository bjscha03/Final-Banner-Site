import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/validate-discount.cjs';

export default withLambda(legacyModule.handler);

