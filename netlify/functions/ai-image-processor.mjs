import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/ai-image-processor.cjs';

export default withLambda(legacyModule.handler);

