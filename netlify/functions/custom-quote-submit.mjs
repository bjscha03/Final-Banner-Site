import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/custom-quote-submit.cjs';

export default withLambda(legacyModule.handler);

