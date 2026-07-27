import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/apply-discount.cjs';

export default withLambda(legacyModule.handler);

