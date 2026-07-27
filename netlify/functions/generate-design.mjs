import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/generate-design.cjs';

export default withLambda(legacyModule.handler);

