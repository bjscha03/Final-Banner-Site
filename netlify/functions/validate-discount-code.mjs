import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/validate-discount-code.cjs';

export default withLambda(legacyModule.handler);

