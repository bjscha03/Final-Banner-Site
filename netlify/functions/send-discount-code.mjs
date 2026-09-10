import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/send-discount-code.cjs';

export default withLambda(legacyModule.handler);

