import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-saved-ai-images.cjs';

export default withLambda(legacyModule.handler);

