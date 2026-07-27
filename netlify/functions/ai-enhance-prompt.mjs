import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/ai-enhance-prompt.cjs';

export default withLambda(legacyModule.handler);

