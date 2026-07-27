import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/ai-artwork-processor.cjs';

export default withLambda(legacyModule.handler);

