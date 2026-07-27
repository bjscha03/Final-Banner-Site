import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/designer-intake-submit.cjs';

export default withLambda(legacyModule.handler);

