import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/save-ai-image.cjs';

export default withLambda(legacyModule.handler);

