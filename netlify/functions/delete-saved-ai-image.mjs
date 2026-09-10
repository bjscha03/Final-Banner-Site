import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/delete-saved-ai-image.cjs';

export default withLambda(legacyModule.handler);

