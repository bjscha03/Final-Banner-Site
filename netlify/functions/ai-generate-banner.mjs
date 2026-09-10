import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/ai-generate-banner.cjs';

export default withLambda(legacyModule.handler);

